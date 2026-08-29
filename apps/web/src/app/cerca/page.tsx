import type { Metadata } from "next";
import Link from "next/link";

import { ProductShell } from "@/components/product-shell";
import { cerca } from "@/server/iqstats/ricerca";

export const metadata: Metadata = {
  title: "Cerca",
  description: "Trova una squadra o un arbitro per nome, fra quelli che abbiamo osservato.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function scalare(valore: string | string[] | undefined): string {
  return typeof valore === "string" ? valore : "";
}

/**
 * Che cosa dice una riga di risultato oltre al nome.
 *
 * **Il campione non e' un vezzo.** Una squadra con zero gare osservate ha una scheda che si
 * apre vuota: dirlo prima del tocco e' la stessa regola che il calendario applica alle gare.
 */
function Riga({
  href,
  nome,
  dove,
  gare,
}: Readonly<{ href: string; nome: string; dove: string | null; gare: number }>) {
  return (
    <li>
      <Link className="partite-row cerca-riga" href={href}>
        <span className="partite-teams">
          {nome}
          {dove === null ? null : <span className="engine-obs">{dove}</span>}
        </span>
        <span className="partite-read">
          <b>{gare === 0 ? "nessuna gara" : `${gare} ${gare === 1 ? "gara" : "gare"}`}</b>
          <i>osservate</i>
        </span>
      </Link>
    </li>
  );
}

export default async function CercaPage({ searchParams }: Props) {
  const parametri = await searchParams;
  const domanda = scalare(parametri.q).trim();
  const risultati = await cerca(domanda);
  const quanti = risultati.squadre.length + risultati.arbitri.length;

  return (
    <ProductShell activeSection="search">
      <div className="oggi-backdrop" aria-hidden="true" />
      <section className="oggi" aria-labelledby="cerca-title">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Cerca</span>
          <span className="oggi-line" aria-hidden="true" />
          <span className="oggi-src">Squadre e arbitri, per nome</span>
        </div>

        <h1 id="cerca-title" className="squad-title">
          {domanda === "" ? "Cerca una squadra o un arbitro" : `«${domanda}»`}
        </h1>

        {/* Un modulo normale, non un campo che cerca a ogni tasto: la ricerca interroga il
            livello dati, e una richiesta per lettera sarebbe traffico senza risposta
            migliore. Funziona anche senza JavaScript. */}
        <form className="cerca-modulo" action="/cerca" method="get" role="search">
          <label className="cerca-etichetta" htmlFor="q">Nome</label>
          <input
            id="q"
            name="q"
            type="search"
            className="cerca-campo"
            defaultValue={domanda}
            placeholder="Milan, Guida, Corinthians…"
            autoComplete="off"
          />
          <button type="submit" className="cerca-invia">Cerca</button>
        </form>

        {domanda === "" ? (
          <p className="dossier-src">
            Si cerca fra le squadre e gli arbitri che <b>abbiamo osservato</b>: sono quelli che
            hanno una scheda da aprire. Le gare si trovano invece dal calendario, che filtra
            per giorno, campionato e stato.
          </p>
        ) : quanti === 0 ? (
          <div className="oggi-empty">
            <h2>Nessun nome contiene «{domanda}»</h2>
            <p>
              Si cerca solo fra squadre e arbitri che abbiamo osservato, e il testo deve
              essere di almeno due caratteri. Prova con una parte del nome.
            </p>
          </div>
        ) : (
          <>
            {risultati.squadre.length > 0 ? (
              <>
                <h2 className="squad-section-title">Squadre</h2>
                <ol className="partite-rows">
                  {risultati.squadre.map((t) => (
                    <Riga
                      key={`squadra-${t.sourceId}`}
                      href={`/squadre/${t.sourceId}`}
                      nome={t.nome}
                      dove={t.dove}
                      gare={t.gare}
                    />
                  ))}
                </ol>
              </>
            ) : null}

            {risultati.arbitri.length > 0 ? (
              <>
                <h2 className="squad-section-title">Arbitri</h2>
                <ol className="partite-rows">
                  {risultati.arbitri.map((a) => (
                    <Riga
                      key={`arbitro-${a.sourceId}`}
                      href={`/arbitri/${a.sourceId}`}
                      nome={a.nome}
                      dove={a.dove}
                      /* Le gare dell'arbitro si contano per riga squadra-gara, e ogni gara ne
                         ha due: qui si dimezza, altrimenti direbbe il doppio del vero. */
                      gare={Math.floor(a.gare / 2)}
                    />
                  ))}
                </ol>
              </>
            ) : null}
          </>
        )}
      </section>
    </ProductShell>
  );
}
