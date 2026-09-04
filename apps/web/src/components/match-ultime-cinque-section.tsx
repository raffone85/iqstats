import type { CinqueDiLato, Somma, UltimeCinque } from "@/server/iqstats/ultime-cinque";

/**
 * Le ultime cinque gare dal lato che si giochera' qui, una per una.
 *
 * **Perche' le gare e non solo la media.** «Forma, in numeri» dice quanto valgono le
 * ultime tre, cinque e dieci contro il metro della competizione, e si ferma alle reti.
 * Qui si vede da dove viene quel numero: contro chi si e' giocato, com'e' finita, e con
 * quali gol attesi e tiri dalle due parti. Cinque pari di misura e quattro pari piu' una
 * goleada danno la stessa media e non sono la stessa squadra.
 *
 * **Non e' una previsione.** Nessun numero di qui entra nei mercati o nel motore: e' il
 * racconto di partite avvenute, e il testo in fondo lo dice.
 */
const giorno = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });

function quandoBreve(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "" : giorno.format(data);
}

/** Un conteggio scritto come si legge, con i decimali che servono. */
function cifra(valore: number, decimali: number): string {
  return valore.toFixed(decimali).replace(".", ",");
}

/** I due lati di una somma, «7-4». */
function duello(s: Somma | null, decimali: number): string | null {
  return s === null ? null : cifra(s.fatti, decimali) + "-" + cifra(s.subiti, decimali);
}

function Squadra({ serie }: { readonly serie: CinqueDiLato }) {
  const xg = duello(serie.totali.xg, 1);
  const tiri = duello(serie.totali.tiri, 0);
  const porta = duello(serie.totali.porta, 0);
  return (
    <li className="engine-row">
      <p className="engine-metric">
        {serie.nome} · ultime {serie.gare.length} {serie.lato === "casa" ? "in casa" : "in trasferta"}
        {/* Quante appartengono davvero alla stagione in corso: a settembre sono poche, e
            chiamarle tutte «di questa stagione» sarebbe falso. */}
        <span className="engine-obs">
          {serie.diQuestaStagione === serie.gare.length
            ? "tutte di questa stagione"
            : serie.diQuestaStagione === 0
              ? "nessuna di questa stagione: sono le precedenti dello stesso lato"
              : serie.diQuestaStagione + " di questa stagione, le altre precedenti"}
        </span>
      </p>
      <ul className="engine-splits">
        {serie.gare.map((g) => (
          <li className="engine-split" key={g.quando + g.avversario}>
            <span className="engine-who">
              {quandoBreve(g.quando)} · {g.avversario}
            </span>
            <span className="engine-exp">
              {g.golFatti === null || g.golSubiti === null
                ? "—"
                : g.golFatti + "-" + g.golSubiti}
              {g.xgFatti === null || g.xgSubiti === null ? null : (
                <span className="engine-obs">
                  gol attesi {cifra(g.xgFatti, 2)}-{cifra(g.xgSubiti, 2)}
                </span>
              )}
              {g.tiriFatti === null || g.tiriSubiti === null ? null : (
                <span className="engine-obs">
                  tiri {g.tiriFatti}-{g.tiriSubiti}
                  {g.portaFatti === null || g.portaSubiti === null
                    ? null
                    : ", in porta " + g.portaFatti + "-" + g.portaSubiti}
                </span>
              )}
            </span>
          </li>
        ))}
        <li className="engine-split">
          <span className="engine-who">Totale delle {serie.gare.length}</span>
          <span className="engine-exp">
            {duello(serie.totali.gol, 0) ?? "—"}
            <span className="engine-obs">gol fatti e subiti</span>
            {xg === null ? null : <span className="engine-obs">gol attesi {xg}</span>}
            {tiri === null ? null : (
              <span className="engine-obs">
                tiri {tiri}{porta === null ? null : ", in porta " + porta}
              </span>
            )}
          </span>
        </li>
      </ul>
    </li>
  );
}

export function MatchUltimeCinqueSection({ ultime }: { readonly ultime: UltimeCinque | null }) {
  if (ultime === null) return null;
  const gol = ultime.insieme.gol;
  const xg = ultime.insieme.xg;
  const tiri = ultime.insieme.tiri;
  return (
    <section className="dossier-panel" aria-labelledby="ultime-cinque-title">
      <p className="dossier-kick">Le ultime cinque, dal lato che si gioca</p>
      <h2 id="ultime-cinque-title" className="squad-section-title">
        Come stanno arrivando, gara per gara
      </h2>

      <ul className="engine-rows">
        <Squadra serie={ultime.casa} />
        <Squadra serie={ultime.trasferta} />
      </ul>

      {gol === null ? null : (
        <p className="engine-why">
          Le {gol.gare} gare messe insieme: <b>{gol.fatti + gol.subiti}</b> gol totali
          {xg === null ? null : <> · <b>{cifra(xg.fatti + xg.subiti, 1)}</b> gol attesi</>}
          {tiri === null ? null : <> · <b>{tiri.fatti + tiri.subiti}</b> tiri</>}.
        </p>
      )}

      <div className="dossier-src">
        {ultime.rapporto.map((frase) => (
          <p key={frase}>{frase}</p>
        ))}
        <p>
          Dalle nostre osservazioni sulle gare già chiuse, stessa competizione di questa
          partita e stesso lato del campo: la squadra di casa con le sue gare in casa,
          l&apos;ospite con le sue in trasferta. Dove una metrica manca nella gara non viene
          sostituita da uno zero: quella riga non la mostra.
        </p>
      </div>
    </section>
  );
}
