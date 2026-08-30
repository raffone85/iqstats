"use client";

import { useState } from "react";

/**
 * Il pulsante che apre il portale di fatturazione.
 *
 * **Perche' esiste.** `/api/billing/portal` era gia' scritto e funzionante ma nessuna
 * pagina lo chiamava: metodo di pagamento, ricevute e disdetta erano irraggiungibili
 * dall'interfaccia. Questo pulsante e' l'unico collegamento.
 *
 * **Il portale e' di Stripe, e si dice.** Da qui si esce dal nostro dominio: dirlo prima e'
 * la differenza fra un collegamento e una sorpresa.
 *
 * **Il caso «nessun cliente» non e' un errore.** Chi non ha mai pagato non ha un cliente
 * Stripe: la rotta risponde 409, e la pagina lo racconta come stato normale invece di
 * mostrare un guasto.
 */
type RispostaPortale = Readonly<{ url: string }>;

function haUrl(valore: unknown): valore is RispostaPortale {
  return typeof valore === "object" && valore !== null && "url" in valore && typeof valore.url === "string";
}

export function PortaleFatturazione() {
  const [inCorso, setInCorso] = useState(false);
  const [avviso, setAvviso] = useState<string | null>(null);

  async function apri() {
    setInCorso(true);
    setAvviso(null);
    try {
      const risposta = await fetch("/api/billing/portal", { method: "POST" });
      if (risposta.status === 409) {
        setInCorso(false);
        setAvviso(
          "Non risulta ancora nessun pagamento a tuo nome, quindi non c'è niente da gestire. Il portale si apre dopo il primo acquisto.",
        );
        return;
      }
      const corpo: unknown = await risposta.json();
      if (!risposta.ok || !haUrl(corpo)) throw new Error("portale non disponibile");

      const destinazione = new URL(corpo.url);
      if (destinazione.protocol !== "https:") throw new Error("destinazione non sicura");
      window.location.assign(destinazione.toString());
    } catch {
      setInCorso(false);
      setAvviso(
        "Non riusciamo ad aprire il portale in questo momento. Il tuo abbonamento non è cambiato: riprova fra poco.",
      );
    }
  }

  return (
    <>
      <button type="button" className="button-link" onClick={apri} disabled={inCorso}>
        {inCorso ? "Apertura in corso…" : "Apri il portale di fatturazione"}
      </button>
      {avviso ? (
        <p className="account-avviso" role="status" aria-live="polite">
          {avviso}
        </p>
      ) : null}
    </>
  );
}
