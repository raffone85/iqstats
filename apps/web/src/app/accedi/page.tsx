import type { Metadata } from "next";
import Link from "next/link";

import { EmailAccessForm } from "@/components/email-access-form";
import { GoogleAccessButton } from "@/components/google-access-button";
import { ProductShell } from "@/components/product-shell";
import { isGoogleAccessEnabled } from "@/server/auth/providers";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accedi a IQstatS",
  description:
    "Che cos'è IQstatS, come si leggono i dati e che cosa contiene ogni sezione. Collega la tua sessione con un codice via email.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Come si legge un valore, in sei righe. Nessuna di queste è una regola di gioco. */
const READING = [
  ["La media", "Quanto fa di solito quella squadra nella stagione in corso."],
  ["Casa e trasferta", "Sempre separate: la stessa squadra non gioca allo stesso modo."],
  ["Verde e mattone", "Un valore sopra o sotto il suo riferimento. Dicono il verso, non se è un bene."],
  ["Il numero piccolo", "Su quante gare poggia il valore. Poche gare, valore fragile."],
  ["La lineetta", "Quel dato non c'è. Non è uno zero e non viene sostituito."],
  ["Il filo sotto la riga", "Quanta parte del valore viene dalle gare in casa e quanta da quelle fuori."],
] as const;

const SECTIONS = [
  ["Home", "Il sommario: ogni riquadro dichiara quanto contenuto ha adesso."],
  ["Oggi", "La gara del giorno in evidenza e le letture principali."],
  ["Partite", "Il calendario, giorno per giorno, con la competizione accanto."],
  ["Pronostici", "Tutte le gare in arrivo, da filtrare per competizione, mercato, probabilità minima e ordine."],
  ["Squadre", "La scheda completa: medie, casa e trasferta, registro gara per gara, chi le ha arbitrate."],
  ["Metodo", "Quanto sono aggiornati i dati, che cosa è coperto e che cosa no."],
  ["Piani", "Che cosa include il tuo accesso."],
] as const;

const SOON = [
  ["Giocatori", "Rendimento per giocatore su più gare, con il campione dichiarato."],
  ["Arbitri", "Falli e cartellini di ogni direttore, con il metro della competizione accanto."],
  ["Le mie giocate", "Lo storico delle tue letture salvate, legato al tuo accesso."],
] as const;

/** Il ritorno da un provider esterno può fallire: il motivo si dice, non si nasconde. */
function accessErrorMessage(value: string | string[] | undefined) {
  if (value === "provider") return "L'accesso con Google è stato annullato o rifiutato. Puoi riprovare o entrare con il codice via email.";
  if (value === "codice-mancante" || value === "scambio") return "Il ritorno dall'accesso non è andato a buon fine. Riprova, oppure entra con il codice via email.";
  return "";
}

function localNext(value: string | string[] | undefined) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export default async function AccessPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  const query = await searchParams;
  const nextPath = localNext(query.next);
  const accessError = accessErrorMessage(query.errore);
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, googleEnabled] = await Promise.all([
    supabase.auth.getClaims(),
    isGoogleAccessEnabled(),
  ]);
  const authenticated = !error && Boolean(data?.claims?.sub);

  return (
    <ProductShell activeSection="account">
      {/* La porta d'ingresso: un riquadro solo, al centro, su fondo bordeaux. */}
      <section className="gate" aria-labelledby="access-title">
        <div className="gate-card">
          <span className="gate-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="12" cy="8" r="3.6" />
              <path d="M4.6 20c.8-3.8 3.8-5.8 7.4-5.8s6.6 2 7.4 5.8" />
            </svg>
          </span>

          {authenticated ? (
            <>
              <h1 id="access-title" className="gate-title">Bentornato.</h1>
              <p className="gate-sub">La tua sessione IQstatS è attiva.</p>
              <Link className="gate-primary" href={nextPath}>
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 12h13" /><path d="M12.5 6.5 18.5 12l-6 5.5" />
                </svg>
                Vai alla home
              </Link>
              <p className="gate-divider" aria-hidden="true"><span>oppure</span></p>
              <div className="gate-secondary">
                <Link className="gate-button" href="/partite">Vedi le partite di oggi</Link>
                <Link className="gate-button gate-button-strong" href="/account/billing">Il tuo piano</Link>
              </div>
            </>
          ) : (
            <>
              <h1 id="access-title" className="gate-title">Bentornato.</h1>
              <p className="gate-sub">Accedi al tuo account IQstatS. Nessuna password: entri con un codice.</p>

              <EmailAccessForm nextPath={nextPath} />

              {accessError ? (
                <p className="email-field-error" role="alert">{accessError}</p>
              ) : null}

              <p className="gate-divider" aria-hidden="true"><span>oppure</span></p>

              <div className="gate-secondary">
                {googleEnabled ? (
                  <GoogleAccessButton nextPath={nextPath} />
                ) : (
                  <Link className="gate-button" href="/metodo">Come funziona</Link>
                )}
                <Link className="gate-button gate-button-strong" href="/account/billing">
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3.2 20 7.4v9.2L12 20.8 4 16.6V7.4z" /><path d="M4 7.4 12 11.6l8-4.2" /><path d="M12 11.6v9.2" />
                  </svg>
                  Abbonati
                </Link>
              </div>
            </>
          )}
        </div>

        <p className="gate-note">
          Entri con un codice di sei cifre che ti arriva via email, oppure con Google. Nessuna
          password da ricordare e nessun collegamento da aprire.
        </p>
      </section>

      <section className="legend" aria-labelledby="legend-reading-title">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Come si leggono</span>
          <span className="oggi-line" aria-hidden="true" />
        </div>
        <h2 id="legend-reading-title" className="legend-title">
          Sei cose da sapere, e sai leggere tutto il resto.
        </h2>
        <dl className="legend-list">
          {READING.map((entry) => (
            <div className="legend-row" key={entry[0]}>
              <dt>{entry[0]}</dt>
              <dd>{entry[1]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="legend" aria-labelledby="legend-sections-title">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Le sezioni</span>
          <span className="oggi-line" aria-hidden="true" />
        </div>
        <h2 id="legend-sections-title" className="legend-title">
          Che cosa trovi, sezione per sezione.
        </h2>
        <dl className="legend-list">
          {SECTIONS.map((entry) => (
            <div className="legend-row" key={entry[0]}>
              <dt>{entry[0]}</dt>
              <dd>{entry[1]}</dd>
            </div>
          ))}
        </dl>

        <p className="legend-soon-head">Non ancora disponibili, e finché non lo sono restano spente:</p>
        <dl className="legend-list legend-list-soon">
          {SOON.map((entry) => (
            <div className="legend-row" key={entry[0]}>
              <dt>{entry[0]}</dt>
              <dd>{entry[1]}</dd>
            </div>
          ))}
        </dl>

        <p className="legend-note">
          Un dato che manca resta dichiarato mancante: non viene ricostruito, non diventa zero e
          non viene sostituito da una stima. È la sola promessa che ti facciamo sui numeri.
        </p>
      </section>
    </ProductShell>
  );
}
