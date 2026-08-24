// Le letture piu' solide della gara, in cima al dossier.
//
// **Perche' sta prima di tutto il resto.** Sotto ci sono ventuno scale dentro sette card:
// i numeri ci sono tutti, ma per capire dove il modello dice qualcosa e dove alza le
// spalle bisognava confrontarli a mente. Questa lista fa quel confronto una volta sola.
//
// **Non e' una classifica di percentuali, ed e' scritto in pagina.** L'ordine viene da
// `lettureForti`: quanto il verso e' deciso, per quanto quel bersaglio si e' dimostrato
// affidabile fuori campione. Una lettura al 78% su un bersaglio che sbaglia spesso sta
// sotto una al 68% su un bersaglio che sbaglia poco, ed e' esattamente il punto.
//
// **Nessuna istruzione di puntata**, come vuole il master: si dice dove la lettura regge,
// non che cosa fare. La barra e' quella bordeaux del dossier, che non dichiara un verso;
// la tinta della famiglia compare accanto al suo nome **scritto**, quindi nessuna
// informazione vive solo nel colore. Nessun CSS nuovo.
import type { CSSProperties } from "react";

import type { LetturaForte, LettureDellaGara } from "@/server/iqstats/projection/letture-forti";
import { FAMIGLIE } from "./match-projection-section";

function valore(numero: number): string {
  return numero.toFixed(1).replace(".", ",");
}

function percento(quota: number): string {
  return String(Math.round(quota * 100)) + "%";
}

type Props = Readonly<{
  letture: LettureDellaGara;
  homeTeam: string;
  awayTeam: string;
}>;

export function MatchLettureFortiSection({ letture, homeTeam, awayTeam }: Props) {
  const righe = letture.letture;
  // Una sezione appare solo quando il suo contratto dati c'e'. Senza nemmeno una lettura
  // sopra la forza minima non si scrive «nessuna lettura forte» in un pannello vuoto: la
  // pagina prosegue con le card, che restano leggibili da sole.
  if (righe.length === 0) return null;

  const massima = righe[0]?.forza ?? 1;
  const chi = (lettura: LetturaForte) => lettura.lato === "casa" ? homeTeam
    : lettura.lato === "trasferta" ? awayTeam : "Totale gara";

  return (
    <section className="dossier-panel" aria-labelledby="letture-forti-title">
      <p className="dossier-kick">Dove il modello dice qualcosa</p>
      <h2 id="letture-forti-title" className="sr-only-heading">
        Le letture piu&apos; solide di {homeTeam} contro {awayTeam}
      </h2>

      <div className="dossier-1x2">
        {righe.map((lettura) => {
          const famiglia = FAMIGLIE[lettura.bersaglio];
          return (
            <div
              className="dossier-1x2-row"
              key={`${lettura.bersaglio}-${lettura.lato}-${lettura.soglia}`}
              style={{ "--famiglia": famiglia?.tinta ?? "var(--card-brand)" } as CSSProperties}
            >
              <span className="dossier-1x2-label">
                {lettura.verso} {valore(lettura.soglia)} · {famiglia?.nome ?? lettura.bersaglio}
                <em className="engine-obs">
                  {chi(lettura)} · affidabilità {lettura.affidabilita}/100, misurata su{" "}
                  {lettura.righeDiProva} gare di prova
                </em>
              </span>
              <span className="dossier-bar" aria-hidden="true">
                <i style={{ width: `${Math.round((lettura.forza / massima) * 100)}%` }} />
              </span>
              <span className="dossier-1x2-val">{percento(lettura.probabilita)}</span>
            </div>
          );
        })}
      </div>

      <p className="dossier-src">
        Queste sono le letture che <b>reggono di più</b> in questa gara, non quelle con la
        percentuale più alta. L&apos;ordine nasce da due numeri moltiplicati fra loro: quanto il
        verso è deciso, cioè quanto la probabilità si allontana da cinquanta, e quanto quel
        bersaglio ci ha preso <b>fuori campione</b> sulle gare di prova. Una lettura al 78% su
        un bersaglio che sbaglia spesso vale meno di una al 68% su un bersaglio che sbaglia
        poco: la barra mostra questa forza, la percentuale a destra resta quella vera.
      </p>

      <p className="dossier-src">
        Entrano solo le soglie che la pagina accende più in basso, cioè le più decise fra
        quelle vicine al valore atteso: le soglie lontane dicono l&apos;ovvio e quelle a ridosso
        del previsto sono una moneta.
        {letture.senzaMisura.length > 0 ? (
          <>
            {" "}
            Restano fuori {letture.senzaMisura.length === 1 ? "un bersaglio" : `${letture.senzaMisura.length} bersagli`}
            {" "}
            ({letture.senzaMisura.map((t) => FAMIGLIE[t]?.nome ?? t).join(", ")}): per{" "}
            {letture.senzaMisura.length === 1 ? "quello" : "quelli"} non abbiamo una misura di
            quanto la lettura regga, e senza quella non si può metterla in cima a una
            classifica che parla proprio di questo.
          </>
        ) : null}
        {" "}I mercati dei gol non entrano in questo elenco: nascono da due Poisson e da una
        griglia, non da un modello con un campione di riscontro, quindi non sanno ancora dire
        quante volte hanno preso.
      </p>
    </section>
  );
}
