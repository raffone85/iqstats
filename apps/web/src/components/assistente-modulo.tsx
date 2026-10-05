"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useTransition } from "react";

/**
 * Il modulo dell'assistente della gara: la domanda scritta, e quelle gia' pronte.
 *
 * **Resta un modulo `GET`, e funziona anche senza JavaScript.** Il client serve a due cose
 * sole: chiedere senza ricaricare il documento - la pagina resta dov'e' e la risposta
 * arriva al suo posto - e dire che la domanda e' in lettura mentre il server risponde.
 * Senza JavaScript il modulo parte da solo, e i pulsanti delle domande pronte portano il
 * loro testo nello stesso campo `domanda`.
 *
 * ponytail: la risposta arriva rifacendo il dossier sul server, quindi 2-4 secondi anche
 * cosi'. Scendere sotto vuole una rotta che componga solo il tema chiesto.
 */
export function AssistenteModulo({ gara, domanda, stagione, pronte }: Readonly<{
  gara: number;
  domanda: string;
  /** La finestra scelta da chi legge: la domanda non deve farla perdere. */
  stagione: string | null;
  /** Le domande pronte: insegnano che cosa si puo' chiedere senza un manuale. */
  pronte: readonly string[];
}>) {
  const router = useRouter();
  const [inLettura, avvia] = useTransition();

  const chiedi = (testo: string) => {
    const parametri = new URLSearchParams({ domanda: testo });
    if (stagione !== null) parametri.set("stagione", stagione);
    avvia(() => {
      router.push(`/match/${gara}?${parametri.toString()}#chiedi`, { scroll: false });
    });
  };

  const invia = (evento: FormEvent<HTMLFormElement>) => {
    const testo = new FormData(evento.currentTarget).get("domanda");
    if (typeof testo !== "string" || testo.trim() === "") return;
    evento.preventDefault();
    chiedi(testo.trim());
  };

  return (
    <form className="assistente-modulo" action={`/match/${gara}#chiedi`} method="get" onSubmit={invia}>
      {stagione === null ? null : <input type="hidden" name="stagione" value={stagione} />}
      <div className="cerca-modulo">
        <label className="cerca-etichetta" htmlFor="domanda">Domanda</label>
        <input
          id="domanda"
          name="domanda"
          type="text"
          className="cerca-campo"
          // La chiave rimonta il campo quando la domanda cambia da fuori, cioe' da una
          // domanda pronta: `defaultValue` da solo resterebbe sul testo di prima.
          key={domanda}
          defaultValue={domanda}
          maxLength={200}
          placeholder="Conviene l’over 9,5 tiri ospite?"
          autoComplete="off"
          required
        />
        <button type="submit" className="cerca-invia" disabled={inLettura}>Chiedi</button>
      </div>

      <div className="assistente-pronte" role="group" aria-label="Domande pronte">
        {pronte.map((testo) => (
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
  );
}
