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
// non che cosa fare. La barra e' quella del dossier, col colore del marchio, che non
// dichiara un verso; la tinta della famiglia compare accanto al suo nome **scritto**, quindi nessuna
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
        Le letture più solide di {homeTeam} contro {awayTeam}
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
                  {chi(lettura)}
                  {lettura.base === null
                    ? " · non sappiamo quanto sia normale in questa lega"
                    : ` · in questa lega succede il ${Math.round(lettura.base)}% delle volte`}
                  {" · affidabilità "}{lettura.affidabilita}/100
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
        In cima non c&apos;è la percentuale più alta: c&apos;è quella che si scosta di più da{" "}
        <b>quante volte quella linea succede in questa lega</b>, pesata per quanto quel
        bersaglio ci prende fuori campione. La barra mostra questa forza.
        {letture.senzaMisura.length > 0 ? (
          <>
            {" "}Restano fuori {letture.senzaMisura.map((t) => FAMIGLIE[t]?.nome ?? t).join(", ")}:
            non sappiamo quanto reggono.
          </>
        ) : null}
      </p>

    </section>
  );
}
