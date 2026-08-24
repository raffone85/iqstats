import type { Metadata } from "next";
import Link from "next/link";

import { ProductShell } from "@/components/product-shell";
import {
  classificaArbitri,
  competizioniConArbitri,
  type MetricaArbitro,
} from "@/server/iqstats/referees";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arbitri",
  description:
    "Falli e cartellini di ogni direttore di gara, calcolati sulle nostre osservazioni e "
    + "confrontati con i colleghi della stessa competizione.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Le tre letture, con il nome che si legge in pagina. */
const METRICHE: ReadonlyArray<{ chiave: MetricaArbitro; nome: string; unita: string }> = [
  { chiave: "gialli", nome: "Cartellini gialli", unita: "gialli a gara" },
  { chiave: "falli", nome: "Falli fischiati", unita: "falli a gara" },
  { chiave: "rossi", nome: "Espulsioni", unita: "rossi a gara" },
];

function scalare(valore: string | string[] | undefined): string {
  return typeof valore === "string" ? valore : "";
}

function numeroDecimale(valore: number, cifre: number): string {
  return valore.toFixed(cifre).replace(".", ",");
}

const GIORNO: Intl.DateTimeFormatOptions = {
  day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome",
};

function giorno(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "data non disponibile"
    : data.toLocaleDateString("it-IT", GIORNO);
}

export default async function ArbitriPage({ searchParams }: Props) {
  const parametri = await searchParams;
  const competizioni = await competizioniConArbitri();

  // Nessuna competizione: il livello dati non risponde, oppure non c'è ancora una
  // competizione con abbastanza arbitri. Si dichiara, non si riempie.
  if (competizioni.length === 0) {
    return (
      <ProductShell activeSection="referees">
        <section className="oggi" aria-labelledby="arbitri-title">
          <div className="oggi-eyebrow">
            <span className="oggi-kick">Arbitri</span>
            <span className="oggi-line" aria-hidden="true" />
          </div>
          <div className="oggi-empty">
            <h2 id="arbitri-title">Nessuna competizione con abbastanza gare</h2>
            <p>
              Un arbitro entra in classifica da cinque gare dirette, e una competizione compare
              da tre arbitri in su. Al momento nessuna raggiunge la soglia, oppure il livello
              dati non è raggiungibile: in nessuno dei due casi si mostrano numeri.
            </p>
          </div>
        </section>
      </ProductShell>
    );
  }

  const richiesta = Number(scalare(parametri.competizione));
  const scelta = competizioni.find((c) => c.sourceId === richiesta) ?? competizioni[0];

  const metricaRichiesta = scalare(parametri.metrica);
  const metrica = METRICHE.find((m) => m.chiave === metricaRichiesta) ?? METRICHE[0];

  const classifica = await classificaArbitri(scelta.sourceId, metrica.chiave);

  return (
    <ProductShell activeSection="referees">
      <section className="oggi" aria-labelledby="arbitri-title">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Arbitri</span>
          <span className="oggi-line" aria-hidden="true" />
          <span className="oggi-src">
            {competizioni.length} competizioni · {scelta.nome} fino al {giorno(scelta.ultima)}
          </span>
        </div>

        <h1 id="arbitri-title" className="squad-title">
          {metrica.nome} in {scelta.nome}
        </h1>
        <p className="home-lede">
          Ogni media è calcolata sulle nostre osservazioni, non su quelle di chi ci passa i
          dati, e conta solo le gare di cui abbiamo entrambe le squadre. Il confronto è con i
          colleghi della stessa competizione: un metro fischiato in Championship non vale in
          Chinese Super League.
        </p>

        <nav className="partite-index" aria-label="Competizione">
          {competizioni.map((c) => (
            <Link
              className="partite-index-link"
              key={c.sourceId}
              href={`/arbitri?competizione=${c.sourceId}&metrica=${metrica.chiave}`}
              aria-current={c.sourceId === scelta.sourceId ? "page" : undefined}
            >
              {c.nome} <i>{c.arbitri}</i>
            </Link>
          ))}
        </nav>

        <nav className="partite-index" aria-label="Lettura">
          {METRICHE.map((m) => (
            <Link
              className="partite-index-link"
              key={m.chiave}
              href={`/arbitri?competizione=${scelta.sourceId}&metrica=${m.chiave}`}
              aria-current={m.chiave === metrica.chiave ? "page" : undefined}
            >
              {m.nome}
            </Link>
          ))}
        </nav>

        {classifica.length === 0 ? (
          <div className="oggi-empty">
            <h2>Nessun arbitro con abbastanza gare</h2>
            <p>In questa competizione nessun direttore arriva a cinque gare dirette.</p>
          </div>
        ) : (
          <ol className="partite-rows">
            {classifica.map((r, indice) => (
              <li key={r.sourceId}>
                <Link className="partite-row" href={`/arbitri/${r.sourceId}`}>
                  <span className="partite-time">{indice + 1}</span>
                  <span className="partite-teams">
                    {r.nome}
                    <span className="engine-obs">
                      {r.paese ?? "paese non dichiarato"} · {r.gare} gare
                    </span>
                  </span>
                  <span className="partite-read">
                    <b>
                      {numeroDecimale(
                        metrica.chiave === "falli" ? r.falli
                          : metrica.chiave === "gialli" ? r.gialli : r.rossi,
                        metrica.chiave === "falli" ? 1 : 2,
                      )}
                    </b>
                    <i>{metrica.unita}</i>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <p className="dossier-src">
          Un arbitro entra in classifica da <b>cinque gare</b> dirette in poi: sotto, una media
          racconta la singola serata e non il direttore. Le gare di cui manca una delle due
          squadre restano fuori dal conto, perché falli e cartellini di una partita sono la
          somma dei due lati e con una riga sola il totale sarebbe dimezzato senza che si veda.
        </p>
      </section>
    </ProductShell>
  );
}
