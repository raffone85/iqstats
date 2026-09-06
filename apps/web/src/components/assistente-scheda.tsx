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
