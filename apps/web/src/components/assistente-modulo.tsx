"use client";

import { type FormEvent, useState, useTransition } from "react";

import { chiediAllaGara } from "@/app/actions/assistente";
import type { Risposta } from "@/server/iqstats/assistente";

/**
 * Le domande pronte sotto il campo. Una per tema fra i piu' chiesti: chi apre la pagina
 * vede subito che cosa si puo' domandare, invece di una casella vuota.
 */
const DOMANDE_PRONTE = [
  "Che partita sarà?",
  "Chi è favorito?",
  "Chi può segnare?",
  "Com'è l'arbitro?",
  "Ci sono infortunati?",
] as const;

/** Quando l'azione non risponde: rete caduta, o l'assistente non c'e' piu' su questa gara. */
const SENZA_RISPOSTA: Risposta = {
  capito: false,
  titolo: "L'assistente non risponde in questo momento",
  righe: [],
  collegamento: null,
  spiegazione: "Non sono riuscito a rispondere adesso. I numeri di questa gara restano tutti "
    + "nel dossier qui sotto: riprova fra poco.",
};

/**
 * L'assistente dentro il dossier: una domanda su questa gara.
 *
 * **Sta in cima, sotto la testata.** Il dossier e' lungo decine di schermate e la risposta a
 * una domanda precisa sta a meta' strada: qui si chiede invece di cercare.
 *
 * **La risposta arriva da un'azione server, senza rifare il dossier.** Fino al 6 ottobre
 * 2026 ogni domanda ricaricava la pagina intera, venti letture per mostrarne una; ora
 * l'azione legge solo cio' che il tema chiede. L'indirizzo si aggiorna lo stesso, cosi' la
 * domanda si puo' ricaricare o mandare a qualcuno.
 *
 * **Resta un modulo `GET`, e funziona anche senza JavaScript:** la domanda viaggia
 * nell'indirizzo, la pagina la legge e rende la stessa risposta dal server.
 */
export function AssistenteGara({ gara, domanda, risposta, stagione }: Readonly<{
  gara: number;
  /** La domanda arrivata dall'indirizzo, e la sua risposta resa dal server. */
  domanda: string;
  risposta: Risposta | null;
  /** La finestra scelta da chi legge: la domanda non deve farla perdere. */
  stagione: string | null;
}>) {
  const [stato, setStato] = useState({ domanda, risposta });
  const [inLettura, avvia] = useTransition();

  const chiedi = (testo: string) => {
    avvia(async () => {
      const nuova = await chiediAllaGara(gara, testo).catch(() => null);
      setStato({ domanda: testo, risposta: nuova ?? SENZA_RISPOSTA });
      const parametri = new URLSearchParams({ domanda: testo });
      if (stagione !== null) parametri.set("stagione", stagione);
      window.history.replaceState(null, "", `/match/${gara}?${parametri.toString()}#chiedi`);
    });
  };

  const invia = (evento: FormEvent<HTMLFormElement>) => {
    const testo = new FormData(evento.currentTarget).get("domanda");
    if (typeof testo !== "string" || testo.trim() === "") return;
    evento.preventDefault();
    chiedi(testo.trim());
  };

  const data = stato.risposta;
  return (
    <section className="assistente" id="chiedi" aria-labelledby="chiedi-title">
      <p className="dossier-kick">Chiedi</p>
      <h2 id="chiedi-title" className="squad-section-title">
        {data === null ? "Una domanda su questa gara" : data.titolo}
      </h2>

      <form className="assistente-modulo" action={`/match/${gara}#chiedi`} method="get" onSubmit={invia}>
        {stagione === null ? null : <input type="hidden" name="stagione" value={stagione} />}
        <div className="cerca-modulo">
          <label className="cerca-etichetta" htmlFor="domanda">Domanda</label>
          <input
            id="domanda"
            name="domanda"
            type="text"
            className="cerca-campo"
            // La chiave rimonta il campo quando la domanda cambia da una domanda pronta:
            // `defaultValue` da solo resterebbe sul testo di prima.
            key={stato.domanda}
            defaultValue={stato.domanda}
            maxLength={200}
            placeholder="Conviene l’over 9,5 tiri ospite?"
            autoComplete="off"
            required
          />
          <button type="submit" className="cerca-invia" disabled={inLettura}>Chiedi</button>
        </div>

        <div className="assistente-pronte" role="group" aria-label="Domande pronte">
          {DOMANDE_PRONTE.map((testo) => (
            <button
              key={testo}
              type="submit"
              name="domanda"
              value={testo}
              // Il campo scritto e' obbligatorio: una domanda pronta parte anche con quello vuoto.
              formNoValidate
              className="assistente-pronta"
              disabled={inLettura}
              onClick={(evento) => {
                evento.preventDefault();
                chiedi(testo);
              }}
            >
              {testo}
            </button>
          ))}
        </div>

        <p className="assistente-attesa" role="status" aria-live="polite">
          {inLettura ? "Sto leggendo la domanda…" : ""}
        </p>
      </form>

      {data === null || data.righe.length === 0 ? null : (
        <span className="squad-player-stats">
          {data.righe.map((riga) => (
            <span className="squad-stat" key={riga.etichetta}>
              <em>{riga.etichetta}</em>
              <b>{riga.valore}</b>
              {riga.nota === null ? null : <i className="assistente-nota">{riga.nota}</i>}
            </span>
          ))}
        </span>
      )}

      {data === null ? null : <p className="dossier-src">{data.spiegazione}</p>}

      <p className="dossier-src">
        <b>Posso sbagliare, e in un modo solo:</b> capendo male la domanda. I numeri sono
        quelli del dossier: le probabilità le calcola il motore, le quote sono del banco, le
        medie vengono dalle gare osservate. Nessuno lo scrivo io. Controlla che il titolo qui
        sopra sia quello che volevi chiedere.
      </p>
    </section>
  );
}
