import type { Metadata } from "next";
import Link from "next/link";

import { ProductShell } from "@/components/product-shell";
import { TeamCompareSection } from "@/components/team-compare-section";
import {
  BERSAGLI_PUBBLICI,
  classificaSquadre,
  type PerimetroClassifica,
  competizioniConSquadre,
  profiloSquadra,
} from "@/server/iqstats/team-stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Squadre",
  description:
    "Classifiche di campionato su venti bersagli e confronto fra due squadre, calcolati "
    + "sulle nostre osservazioni con il campione e l'errore dichiarati.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PRINCIPALI = BERSAGLI_PUBBLICI.filter((b) => b.gruppo === "principale");
const DETTAGLI = BERSAGLI_PUBBLICI.filter((b) => b.gruppo === "dettaglio");

function scalare(valore: string | string[] | undefined): string {
  return typeof valore === "string" ? valore : "";
}

/** Due decimali dove il numero e' piccolo, uno dove non servono. */
const GIORNO: Intl.DateTimeFormatOptions = {
  day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome",
};

function giorno(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "data non disponibile"
    : data.toLocaleDateString("it-IT", GIORNO);
}

function numeroDecimale(valore: number, percentuale: boolean, cifreDate?: number): string {
  const cifre = cifreDate ?? (percentuale ? 1 : valore < 10 ? 2 : 1);
  return valore.toFixed(cifre).replace(".", ",") + (percentuale ? "%" : "");
}

/**
 * Le cifre con cui scrivere prodotto e concesso **della stessa riga**.
 *
 * Stanno uno accanto all'altro e si confrontano a occhio: «17,3» accanto a «8,83» si legge
 * come due scale diverse. Comanda il prodotto, che e' il numero su cui la classifica ordina.
 */
function cifreDellaRiga(media: number, percentuale: boolean): number {
  return percentuale ? 1 : media < 10 ? 2 : 1;
}

export default async function SquadrePage({ searchParams }: Props) {
  const parametri = await searchParams;
  const competizioni = await competizioniConSquadre();

  // Nessuna competizione: il livello dati non risponde, oppure nessuna arriva a quattro
  // squadre sopra il campione minimo. Si dichiara, non si riempie.
  if (competizioni.length === 0) {
    return (
      <ProductShell activeSection="teams">
        <section className="oggi" aria-labelledby="squadre-title">
          <div className="oggi-eyebrow">
            <span className="oggi-kick">Squadre</span>
            <span className="oggi-line" aria-hidden="true" />
          </div>
          <div className="oggi-empty">
            <h2 id="squadre-title">Nessuna competizione con abbastanza gare</h2>
            <p>
              Una squadra entra in classifica da cinque gare osservate, e una competizione
              compare da quattro squadre in su. Al momento nessuna raggiunge la soglia, oppure
              il livello dati non è raggiungibile: in nessuno dei due casi si mostrano numeri.
            </p>
          </div>
        </section>
      </ProductShell>
    );
  }

  const richiesta = Number(scalare(parametri.competizione));
  const scelta = competizioni.find((c) => c.sourceId === richiesta) ?? competizioni[0];

  const chiesto = scalare(parametri.bersaglio);
  const bersaglio = BERSAGLI_PUBBLICI.find((b) => b.chiave === chiesto) ?? PRINCIPALI[0];

  const confronto = scalare(parametri.vista) === "confronto";
  // **Il perimetro, come nel resto del prodotto.** In casa e in trasferta i livelli sono
  // diversi, e una classifica che li mescola nasconde proprio la differenza che si cerca.
  const chiestoLato = scalare(parametri.lato);
  const perimetro: PerimetroClassifica = chiestoLato === "home" || chiestoLato === "away"
    ? chiestoLato
    : "tutte";
  const classifica = await classificaSquadre(
    scelta.sourceId,
    confronto ? "gol_fatti" : bersaglio.chiave,
    perimetro,
  );

  // Le due squadre del confronto si scelgono dalla classifica della competizione: la lista
  // c'e' gia' e non serve una seconda interrogazione per averla.
  const primaScelta = Number(scalare(parametri.a));
  const secondaScelta = Number(scalare(parametri.b));
  const primaId = classifica.find((r) => r.sourceId === primaScelta)?.sourceId
    ?? classifica[0]?.sourceId;
  const secondaId = classifica.find(
    (r) => r.sourceId === secondaScelta && r.sourceId !== primaId,
  )?.sourceId ?? classifica.find((r) => r.sourceId !== primaId)?.sourceId;

  const [profiloA, profiloB] = confronto && primaId !== undefined && secondaId !== undefined
    ? await Promise.all([profiloSquadra(primaId), profiloSquadra(secondaId)])
    : [null, null];

  const indirizzo = (aggiunte: Record<string, string | number>) => {
    const q = new URLSearchParams({
      competizione: String(scelta.sourceId),
      vista: confronto ? "confronto" : "classifiche",
      bersaglio: bersaglio.chiave,
      lato: perimetro,
      ...(primaId === undefined ? {} : { a: String(primaId) }),
      ...(secondaId === undefined ? {} : { b: String(secondaId) }),
    });
    for (const [chiave, valore] of Object.entries(aggiunte)) q.set(chiave, String(valore));
    return `/squadre?${q.toString()}`;
  };

  return (
    <ProductShell activeSection="teams">
      <section className="oggi" aria-labelledby="squadre-title">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Squadre</span>
          <span className="oggi-line" aria-hidden="true" />
          <span className="oggi-src">
            {competizioni.length} competizioni · {scelta.nome} fino al {giorno(scelta.ultima)}
          </span>
        </div>

        <h1 id="squadre-title" className="squad-title">
          {confronto ? "Confronto fra due squadre" : `${bersaglio.nome} in ${scelta.nome}`}
        </h1>
        <p className="home-lede">
          Ogni media è calcolata sulle nostre osservazioni, non su quelle di chi ci passa i
          dati, e porta accanto il campione su cui poggia. La classifica sta dentro la
          stagione in corso della competizione; il confronto fra due squadre guarda invece gli
          ultimi 365 giorni, dove il campione è tre volte più grande.
        </p>

        <nav className="partite-index" aria-label="Vista">
          <Link
            className="partite-index-link"
            href={indirizzo({ vista: "classifiche" })}
            aria-current={confronto ? undefined : "page"}
          >
            Classifiche
          </Link>
          <Link
            className="partite-index-link"
            href={indirizzo({ vista: "confronto" })}
            aria-current={confronto ? "page" : undefined}
          >
            Confronto
          </Link>
        </nav>

        {confronto ? null : (
          <nav className="partite-index" aria-label="Perimetro della classifica">
            {([
              { chiave: "tutte", nome: "Tutte le gare" },
              { chiave: "home", nome: "Solo in casa" },
              { chiave: "away", nome: "Solo in trasferta" },
            ] as const).map((v) => (
              <Link
                className="partite-index-link"
                key={v.chiave}
                href={indirizzo({ lato: v.chiave })}
                aria-current={v.chiave === perimetro ? "page" : undefined}
              >
                {v.nome}
              </Link>
            ))}
          </nav>
        )}

        <nav className="partite-index" aria-label="Competizione">
          {competizioni.map((c) => (
            <Link
              className="partite-index-link"
              key={c.sourceId}
              href={indirizzo({ competizione: c.sourceId, a: "", b: "" })}
              aria-current={c.sourceId === scelta.sourceId ? "page" : undefined}
            >
              {c.nome} <i>{c.squadre}</i>
            </Link>
          ))}
        </nav>

        {confronto ? (
          <>
            <nav className="partite-index" aria-label="Prima squadra">
              {classifica.map((r) => (
                <Link
                  className="partite-index-link"
                  key={r.sourceId}
                  href={indirizzo({ a: r.sourceId, b: r.sourceId === secondaId ? primaId ?? "" : secondaId ?? "" })}
                  aria-current={r.sourceId === primaId ? "page" : undefined}
                >
                  {r.nome}
                </Link>
              ))}
            </nav>
            <nav className="partite-index" aria-label="Seconda squadra">
              {classifica.filter((r) => r.sourceId !== primaId).map((r) => (
                <Link
                  className="partite-index-link"
                  key={r.sourceId}
                  href={indirizzo({ b: r.sourceId })}
                  aria-current={r.sourceId === secondaId ? "page" : undefined}
                >
                  {r.nome}
                </Link>
              ))}
            </nav>

            {profiloA === null || profiloB === null ? (
              <div className="oggi-empty">
                <h2>Confronto non disponibile</h2>
                <p>
                  Una delle due squadre non ha almeno cinque gare osservate negli ultimi 365
                  giorni. Sotto quel campione una media racconta due partite, non una squadra:
                  si dichiara, non si mostra.
                </p>
              </div>
            ) : (
              <TeamCompareSection a={profiloA} b={profiloB} />
            )}
          </>
        ) : (
          <>
            <nav className="partite-index" aria-label="Bersaglio">
              {PRINCIPALI.map((b) => (
                <Link
                  className="partite-index-link"
                  key={b.chiave}
                  href={indirizzo({ bersaglio: b.chiave })}
                  aria-current={b.chiave === bersaglio.chiave ? "page" : undefined}
                >
                  {b.nome}
                </Link>
              ))}
            </nav>

            <details className="squad-group" open={DETTAGLI.some((b) => b.chiave === bersaglio.chiave)}>
              <summary>
                Il resto della partita
                <span>{DETTAGLI.length} bersagli</span>
              </summary>
              <nav className="partite-index" aria-label="Altri bersagli">
                {DETTAGLI.map((b) => (
                  <Link
                    className="partite-index-link"
                    key={b.chiave}
                    href={indirizzo({ bersaglio: b.chiave })}
                    aria-current={b.chiave === bersaglio.chiave ? "page" : undefined}
                  >
                    {b.nome}
                  </Link>
                ))}
              </nav>
            </details>

            {classifica.length === 0 ? (
              <div className="oggi-empty">
                <h2>Nessuna squadra con abbastanza gare</h2>
                <p>
                  In questa competizione nessuna squadra arriva a cinque gare con{" "}
                  {bersaglio.nome.toLowerCase()} osservati.
                </p>
              </div>
            ) : (
              <ol className="partite-rows">
                {classifica.map((r, indice) => (
                  <li key={r.sourceId}>
                    <Link className="partite-row" href={`/squadre/${r.sourceId}`}>
                      <span className="partite-time">{indice + 1}</span>
                      <span className="partite-teams">
                        {r.nome}
                        <span className="engine-obs">{r.campione} gare</span>
                      </span>
                      <span className="partite-read">
                        <b>{numeroDecimale(r.media, bersaglio.percentuale)}</b>
                        {/* Il concesso accanto al prodotto: chi ne fa quindici e ne concede
                            cinque e chi ne fa quindici e ne concede venti hanno la stessa
                            riga e due partite diverse. */}
                        <i>
                          a gara
                          {r.concessa === null
                            ? ""
                            : ` · concede ${numeroDecimale(
                              r.concessa,
                              bersaglio.percentuale,
                              cifreDellaRiga(r.media, bersaglio.percentuale),
                            )}`}
                        </i>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}

            <p className="dossier-src">
              Una squadra entra in classifica da <b>cinque gare</b> con quel dato osservato:
              sotto, una media racconta due partite e non una squadra. Il campione è dichiarato
              per riga e non una volta sola, perché le colonne non si riempiono insieme: delle
              gare che abbiamo, non tutte portano ogni statistica. La classifica sta dentro la
              stagione in corso della competizione — mescolarne due farebbe salire chi ha
              giocato di più per il solo fatto di aver giocato di più.
            </p>
          </>
        )}
      </section>
    </ProductShell>
  );
}
