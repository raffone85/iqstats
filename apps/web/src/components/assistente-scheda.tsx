// La risposta dell'assistente, sopra i risultati della ricerca.
//
// **Non c'e' un pannello a parte, e non e' pigrizia.** Chi ha una domanda scrive in un
// campo di testo, e quel campo esiste gia': su `/cerca` una parola sola resta una ricerca,
// una frase diventa una domanda. Una seconda casella in testata avrebbe chiesto alla gente
// di scegliere fra due modi di scrivere la stessa cosa.
//
// **L'avviso non e' un disclaimer di rito.** La voce 19 chiede che l'assistente dichiari di
// poter sbagliare: qui la frase dice anche **in che modo** sbaglia, cioe' scegliendo la
// scheda sbagliata, perche' i numeri non li scrive lui.
import Link from "next/link";

import type { Risposta } from "@/server/iqstats/assistente";

export function AssistenteScheda({ risposta }: Readonly<{ risposta: Risposta }>) {
  return (
    <section className="assistente" aria-labelledby="assistente-title">
      <p className="dossier-kick">{risposta.capito ? "La risposta" : "Non ho capito"}</p>
      <h2 id="assistente-title" className="squad-section-title">
        {risposta.titolo}
      </h2>

      {risposta.righe.length === 0 ? null : (
        <span className="squad-player-stats">
          {risposta.righe.map((riga) => (
            <span className="squad-stat" key={riga.etichetta}>
              <em>{riga.etichetta}</em>
              <b>{riga.valore}</b>
              {riga.nota === null ? null : <i className="assistente-nota">{riga.nota}</i>}
            </span>
          ))}
        </span>
      )}

      <p className="dossier-src">{risposta.spiegazione}</p>

      <p className="dossier-src">
        <b>Posso sbagliare, e in un modo solo:</b> scegliendo la scheda sbagliata. I numeri
        non li scrivo io, li prendo dalle pagine che li mostrano, quindi non posso
        inventarne uno; se la scheda non è quella che cercavi, il nome giusto si trova qui
        sotto.
      </p>

      {risposta.collegamento === null ? null : (
        <Link className="cerca-invia assistente-vai" href={risposta.collegamento.href}>
          {risposta.collegamento.testo}
        </Link>
      )}
    </section>
  );
}

/**
 * L'assistente dentro il dossier: una domanda sulle linee di questa gara.
 *
 * **Un modulo normale, come su `/cerca`.** La domanda sta nell'indirizzo, la risposta la
 * rende il server e la pagina funziona anche senza JavaScript. `#chiedi` riporta chi ha
 * chiesto davanti alla risposta invece che in cima a un dossier lungo.
 */
export function AssistenteGara({ gara, domanda, risposta, stagione }: Readonly<{
  gara: number;
  domanda: string;
  risposta: Risposta | null;
  /** La finestra scelta da chi legge: la domanda non deve farla perdere. */
  stagione: string | null;
}>) {
  return (
    <section className="assistente" id="chiedi" aria-labelledby="chiedi-title">
      <p className="dossier-kick">Chiedi</p>
      <h2 id="chiedi-title" className="squad-section-title">
        {risposta === null ? "Una domanda su questa gara" : risposta.titolo}
      </h2>

      <form className="cerca-modulo" action={`/match/${gara}#chiedi`} method="get">
        {stagione === null ? null : <input type="hidden" name="stagione" value={stagione} />}
        <label className="cerca-etichetta" htmlFor="domanda">Domanda</label>
        <input
          id="domanda"
          name="domanda"
          type="text"
          className="cerca-campo"
          defaultValue={domanda}
          maxLength={200}
          placeholder="Conviene l’over 9,5 tiri ospite? Chi è favorito? Com’è l’arbitro?"
          autoComplete="off"
          required
        />
        <button type="submit" className="cerca-invia">Chiedi</button>
      </form>

      {risposta === null || risposta.righe.length === 0 ? null : (
        <span className="squad-player-stats">
          {risposta.righe.map((riga) => (
            <span className="squad-stat" key={riga.etichetta}>
              <em>{riga.etichetta}</em>
              <b>{riga.valore}</b>
              {riga.nota === null ? null : <i className="assistente-nota">{riga.nota}</i>}
            </span>
          ))}
        </span>
      )}

      {risposta === null ? null : <p className="dossier-src">{risposta.spiegazione}</p>}

      <p className="dossier-src">
        <b>Posso sbagliare, e in un modo solo:</b> capendo male la domanda. I numeri sono
        quelli del dossier: le probabilità le calcola il motore, le quote sono del banco, le
        medie vengono dalle gare osservate. Nessuno lo scrivo io. Controlla che il titolo qui
        sopra sia quello che volevi chiedere.
      </p>
    </section>
  );
}
