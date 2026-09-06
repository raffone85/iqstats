import type { Metadata } from "next";
import Link from "next/link";

import { ProductShell } from "@/components/product-shell";
import {
  LETTURE,
  classificaGiocatori,
  competizioniConGiocatori,
  type LetturaGiocatori,
} from "@/server/iqstats/giocatori-classifica";
import { nomiDeiGiocatori } from "@/server/iqstats/player-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Giocatori",
  description:
    "Chi guida il campionato per minuti, tiri, falli, cartellini e parate, sulle nostre "
    + "osservazioni, con le gare coperte dichiarate accanto.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function scalare(valore: string | string[] | undefined): string {
  return typeof valore === "string" ? valore : "";
}

export default async function GiocatoriPage({ searchParams }: Props) {
  const parametri = await searchParams;
  const competizioni = await competizioniConGiocatori();

  if (competizioni.length === 0) {
    return (
      <ProductShell activeSection="teams">
        <section className="oggi" aria-labelledby="giocatori-title">
          <div className="oggi-eyebrow">
            <span className="oggi-kick">Giocatori</span>
            <span className="oggi-line" aria-hidden="true" />
          </div>
          <div className="oggi-empty">
            <h2 id="giocatori-title">Nessuna competizione con abbastanza gare</h2>
            <p>
              Una competizione compare da cinque gare osservate in su, oppure il livello dati
              non è raggiungibile. In nessuno dei due casi si mostrano numeri.
            </p>
          </div>
        </section>
      </ProductShell>
    );
  }

  const richiesta = Number(scalare(parametri.competizione));
  const stagioneRichiesta = Number(scalare(parametri.stagione));
  const scelta =
    competizioni.find(
      (c) => c.competizioneSourceId === richiesta && c.stagioneSourceId === stagioneRichiesta,
    )
    ?? competizioni.find((c) => c.competizioneSourceId === richiesta)
    ?? competizioni[0];

  const chiave = scalare(parametri.lettura);
  const lettura = LETTURE.find((l) => l.chiave === chiave) ?? LETTURE[0];

  const classifica = await classificaGiocatori(
    scelta.competizioneSourceId,
    scelta.stagioneSourceId,
    lettura.chiave as LetturaGiocatori,
  );
  const nomi = await nomiDeiGiocatori(classifica.map((voce) => voce.teamSourceId));

  // **I pari merito prendono la stessa posizione.** In Serie A 25/26 il massimo di gialli
  // e' sette e almeno sei giocatori ci arrivano: numerarli uno, due, tre direbbe che c'e'
  // un ordine dove c'e' solo l'ordine con cui il database ha restituito le righe.
  const posizioni = classifica.map(
    (voce, indice) =>
      classifica.findIndex((altro) => altro.valore === voce.valore) + 1 || indice + 1,
  );
  const aPariMerito = classifica.filter((voce) => voce.valore === classifica[0]?.valore).length;

  const indirizzo = (
    competizione: number, stagione: number, quale: string,
  ): string => `/giocatori?competizione=${competizione}&stagione=${stagione}&lettura=${quale}`;

  return (
    <ProductShell activeSection="teams">
      <section className="oggi" aria-labelledby="giocatori-title">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Giocatori</span>
          <span className="oggi-line" aria-hidden="true" />
          <span className="oggi-src">
            {scelta.gareConDato} gare con il dato su {scelta.gareGiocate} giocate ·{" "}
            {scelta.giocatori} giocatori
          </span>
        </div>

        <h1 id="giocatori-title" className="squad-title">
          {lettura.nome} in {scelta.nome} {scelta.stagione}
        </h1>
        <p className="home-lede">
          I totali vengono dalle nostre osservazioni, una riga per giocatore e per gara. La
          classifica dei marcatori non c&apos;è, e non viene sostituita dai tiri: i gol non
          stanno nel nostro livello dati, e chiederli alla fonte costerebbe una chiamata per
          ogni gara del campionato.
        </p>

        <nav className="partite-index" aria-label="Competizione">
          {competizioni.slice(0, 24).map((c) => (
            <Link
              className="partite-index-link"
              key={`${c.competizioneSourceId}-${c.stagioneSourceId}`}
              href={indirizzo(c.competizioneSourceId, c.stagioneSourceId, lettura.chiave)}
              aria-current={
                c.competizioneSourceId === scelta.competizioneSourceId
                && c.stagioneSourceId === scelta.stagioneSourceId
                  ? "page"
                  : undefined
              }
            >
              {c.nome} {c.stagione} <i>{c.gareConDato}</i>
            </Link>
          ))}
        </nav>

        <nav className="partite-index" aria-label="Lettura">
          {LETTURE.map((l) => (
            <Link
              className="partite-index-link"
              key={l.chiave}
              href={indirizzo(scelta.competizioneSourceId, scelta.stagioneSourceId, l.chiave)}
              aria-current={l.chiave === lettura.chiave ? "page" : undefined}
            >
              {l.nome}
            </Link>
          ))}
        </nav>

        {classifica.length === 0 ? (
          <div className="oggi-empty">
            <h2>Nessun giocatore con abbastanza gare</h2>
            <p>
              In questa competizione nessuno arriva a cinque gare osservate con un valore sopra
              lo zero per questa lettura.
            </p>
          </div>
        ) : (
          <ol className="partite-rows">
            {classifica.map((voce, indice) => (
              <li key={voce.playerSourceId}>
                <Link className="partite-row" href={`/giocatori/${voce.playerSourceId}`}>
                  <span className="partite-time">{posizioni[indice]}</span>
                  <span className="partite-teams">
                    {nomi.get(voce.playerSourceId) ?? `giocatore ${voce.playerSourceId}`}
                    <span className="engine-obs">
                      {voce.squadra} · {voce.gare} gare ·{" "}
                      {voce.minuti.toLocaleString("it-IT")} minuti
                    </span>
                  </span>
                  <span className="partite-read">
                    <b>{voce.valore.toLocaleString("it-IT")}</b>
                    <i>{lettura.unita}</i>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <p className="dossier-src">
          {aPariMerito > 1 ? (
            <>
              In cima ci sono <b>{aPariMerito} giocatori a pari merito</b>, e portano lo stesso
              numero di posizione: fra valori uguali non c&apos;è un ordine da mostrare.{" "}
            </>
          ) : null}
          Un giocatore entra in classifica da <b>cinque gare</b> osservate in poi. Le gare
          coperte sono {scelta.gareConDato} su {scelta.gareGiocate} già iniziate: sotto il
          totale la classifica è parziale, e quanto lo sia sta scritto qui sopra. Chi non
          compare nella rosa di oggi della sua squadra resta senza nome, con il suo
          identificativo al posto del nome, invece di essere lasciato fuori.
        </p>
      </section>
    </ProductShell>
  );
}
