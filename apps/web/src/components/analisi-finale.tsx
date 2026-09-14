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

/** Una lettura con il suo perché in parole semplici, `null` dove il motore non ne ha uno. */
export interface ConPerche {
  readonly perche: string | null;
}

/** «Over 5,5 corner · Como»: lo stesso titolo per il pronostico e per gli eventi. */
function titolo(
  l: { readonly bersaglio: string; readonly lato: string; readonly verso: string; readonly soglia: number },
  casa: string,
  trasferta: string,
): string {
  const nome = (FAMIGLIE[l.bersaglio]?.nome ?? l.bersaglio).toLowerCase();
  const chi = l.lato === "casa" ? casa : l.lato === "trasferta" ? trasferta : "totale gara";
  return `${l.verso} ${soglia(l.soglia)} ${nome} · ${chi}`;
}

function EventoDiValore(
  { evento, casa, trasferta }: {
    readonly evento: EventoValore & ConPerche;
    readonly casa: string;
    readonly trasferta: string;
  },
) {
  return (
    <li className="valore-evento">
      <b className="valore-titolo">{titolo(evento, casa, trasferta)}</b>
      <span className="valore-verdetto">diamo {evento.valore} punti più del prezzo</span>
      <span className="valore-numeri">
        noi {Math.round(evento.nostra)}% · quota {euro(evento.quota)} · il prezzo ne dà{" "}
        {Math.round(evento.implicita)}%
      </span>
      {evento.perche === null ? null : <span className="valore-verdetto">{evento.perche}</span>}
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
  { analisi, eventiValore = [], pronostico, casa, trasferta }: {
    readonly analisi: Analisi | null;
    readonly eventiValore?: readonly (EventoValore & ConPerche)[];
    /**
     * Il consigliato del dossier, lo stesso di `ordinaLetture`: qui si mostra, non si sceglie.
     * `null` dove nessuna lettura supera la soglia; assente dove il motore non proietta la gara,
     * e allora il blocco non compare, perché il motivo lo dice già il dossier sopra.
     */
    readonly pronostico?: ({
      readonly bersaglio: string;
      readonly lato: string;
      readonly verso: string;
      readonly soglia: number;
    } & ConPerche) | null;
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
        Il pronostico, gli eventi di valore e la rilettura di quello che sta sopra
      </h2>

      {pronostico === undefined ? null : (
        <>
          <p className="analisi-titoletto">Pronostico</p>
          {pronostico === null ? (
            <p className="analisi-vuoto">
              Su questa gara nessuna lettura si stacca abbastanza da quello che il campionato fa
              da solo: non si consiglia niente, invece di consigliare l&apos;ovvio.
            </p>
          ) : (
            <div className="valore-evento">
              <b className="valore-titolo">{titolo(pronostico, casa, trasferta)}</b>
              {pronostico.perche === null ? null : (
                <span className="valore-verdetto">{pronostico.perche}</span>
              )}
            </div>
          )}
        </>
      )}

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
