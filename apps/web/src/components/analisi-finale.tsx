import type { Analisi, Voce } from "@/server/iqstats/analisi-finale";
import type { EventoValore } from "@/server/iqstats/eventi-di-valore";
import { FAMIGLIE } from "@/components/match-projection-section";

/**
 * L'analisi finale, in fondo al dossier.
 *
 * **Due parti, e portano due cose diverse.** In cima gli **eventi di valore**: le poche
 * letture dove la nostra probabilità batte il prezzo del banco, con la quota accanto. È
 * l'unica parte del dossier con le cifre nell'analisi finale, ed è voluto (scelta
 * dell'utente il 13 settembre 2026): «se è il caso o no» si legge solo mettendo il numero e
 * il prezzo vicini. Sotto, a comando, il **riepilogo per capitoli** in sola prosa, ogni
 * frase con il rimando al capitolo da cui esce: resta una rilettura, non la scorciatoia per
 * saltare i numeri.
 *
 * **Il valore non è una scommessa.** L'edge è al netto del margine del banco, quindi è un
 * valore vero rispetto a quel prezzo, ma manca lo storico quote per dire che regge nel
 * tempo: si scrive «diamo più del prezzo», mai «gioca» o «vince».
 */
function euro(quota: number): string {
  return quota.toFixed(2).replace(".", ",");
}

function soglia(numero: number): string {
  return numero.toFixed(1).replace(".", ",");
}

function EventoDiValore(
  { evento, casa, trasferta }: {
    readonly evento: EventoValore;
    readonly casa: string;
    readonly trasferta: string;
  },
) {
  const nome = (FAMIGLIE[evento.bersaglio]?.nome ?? evento.bersaglio).toLowerCase();
  const chi = evento.lato === "casa" ? casa : evento.lato === "trasferta" ? trasferta : "totale gara";
  return (
    <li className="valore-evento">
      <b className="valore-titolo">
        {evento.verso} {soglia(evento.soglia)} {nome} · {chi}
      </b>
      <span className="valore-verdetto">diamo {evento.valore} punti più del prezzo</span>
      <span className="valore-numeri">
        noi {Math.round(evento.nostra)}% · quota {euro(evento.quota)} · il prezzo ne dà{" "}
        {Math.round(evento.implicita)}%
      </span>
    </li>
  );
}

function Riga({ voce }: { readonly voce: Voce }) {
  return (
    <li>
      <span>{voce.testo}</span>
      {/* Il rimando sta su riga propria e non in fondo alla frase: un collegamento inline e'
          alto quanto il testo, cioe' meno del minimo tattile del design system, e due frasi
          corte di fila lo metterebbero a ridosso di quello sotto. */}
      <a href={`#${voce.ancora}`}>{voce.capitolo}</a>
    </li>
  );
}

export function AnalisiFinale(
  { analisi, eventiValore = [], casa, trasferta }: {
    readonly analisi: Analisi | null;
    readonly eventiValore?: readonly EventoValore[];
    readonly casa: string;
    readonly trasferta: string;
  },
) {
  if (analisi === null) return null;
  const haRecap = analisi.dice.length > 0 || analisi.limiti.length > 0;
  return (
    <section className="dossier-panel analisi" aria-labelledby="analisi-title">
      <p className="dossier-kick">Analisi finale</p>
      <h2 id="analisi-title" className="sr-only-heading">
        Gli eventi di valore e la rilettura di quello che sta sopra
      </h2>

      <p className="analisi-titoletto">Eventi di valore</p>
      {eventiValore.length === 0 ? (
        <p className="analisi-vuoto">
          Su questa gara nessun evento ha un valore netto sopra il prezzo: dove il banco
          quota, la nostra probabilità non lo batte abbastanza. Non se ne inventa uno.
        </p>
      ) : (
        <ul className="valore-eventi">
          {eventiValore.map((evento) => (
            <EventoDiValore
              key={`${evento.bersaglio}-${evento.lato}-${evento.soglia}-${evento.verso}`}
              evento={evento}
              casa={casa}
              trasferta={trasferta}
            />
          ))}
        </ul>
      )}

      {!haRecap ? null : (
        <details className="dossier-spiega analisi-recap">
          <summary>Il riepilogo per capitoli</summary>
          {analisi.dice.length === 0 ? null : (
            <ul className="analisi-voci">
              {analisi.dice.map((voce) => <Riga key={`${voce.ancora}-${voce.testo}`} voce={voce} />)}
            </ul>
          )}
          {analisi.limiti.length === 0 ? null : (
            <>
              <p className="analisi-titoletto">Quello che questo dossier non dice</p>
              <ul className="analisi-voci analisi-limiti">
                {analisi.limiti.map((voce) => (
                  <Riga key={`${voce.ancora}-${voce.testo}`} voce={voce} />
                ))}
              </ul>
            </>
          )}
        </details>
      )}
      <p className="dossier-src">{analisi.nota}</p>
    </section>
  );
}
