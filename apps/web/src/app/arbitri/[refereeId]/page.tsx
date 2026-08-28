import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArbitroScheda } from "@/components/arbitro-scheda";
import { ProductShell } from "@/components/product-shell";
import { getReferee } from "@/server/iqstats/match-context";
import {
  gareDirette,
  medieDelPeriodo,
  metriDiLega,
  perStagioneCompetizione,
  profiloArbitro,
  type PosizioneFraColleghi,
} from "@/server/iqstats/referees";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arbitro",
  description: "Falli e cartellini di un direttore di gara, con il campione e il metro dichiarati.",
};

type Props = { params: Promise<{ refereeId: string }> };

const GIORNO: Intl.DateTimeFormatOptions = {
  day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome",
};

function decimale(valore: number, cifre: number): string {
  return valore.toFixed(cifre).replace(".", ",");
}

function giorno(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "data non disponibile"
    : data.toLocaleDateString("it-IT", GIORNO);
}

/**
 * La posizione fra i colleghi, detta come posizione.
 *
 * Nessun indice centrato su cento e nessuna soglia inventata: si dice quanti colleghi
 * fischia più di lui, e su quanti. La scala è la distribuzione vera della competizione,
 * quindi si muove con lei invece di restare ferma su numeri decisi a tavolino.
 */
function Posizione({ posizione, cosa }: {
  readonly posizione: PosizioneFraColleghi | null;
  readonly cosa: string;
}) {
  if (posizione === null) {
    return (
      <span className="engine-obs">
        confronto non disponibile: servono almeno tre colleghi con cinque gare
      </span>
    );
  }
  const quota = Math.round(posizione.quota * 100);
  // Al centro della distribuzione non si dichiara né più né meno: si dice che è in linea.
  const lettura = quota >= 60 ? `più del ${quota}% dei colleghi`
    : quota <= 40 ? `meno del ${100 - quota}% dei colleghi`
      : "in linea con i colleghi";
  return (
    <span className="engine-obs">
      {cosa} {lettura} di questa competizione, su {posizione.colleghi} con almeno cinque gare
    </span>
  );
}

export default async function ArbitroPage({ params }: Props) {
  const { refereeId } = await params;
  const identificativo = Number(refereeId);
  if (!Number.isSafeInteger(identificativo) || identificativo <= 0) notFound();

  const p = await profiloArbitro(identificativo);
  if (p === null) notFound();

  // Le gare si leggono una volta sola e servono a tre blocchi: la tabella per stagione e
  // competizione, le ultime cinque e l'elenco della competizione principale. La carriera
  // arriva dalla fonte, che e' l'unica a saperla, e resta dichiarata come sua.
  const [gare, carriera] = await Promise.all([
    gareDirette(identificativo),
    getReferee(identificativo),
  ]);
  const righe = perStagioneCompetizione(gare);
  // I metri delle competizioni che tocca: senza, nessuna riga puo' dire severo o permissivo.
  const metri = await metriDiLega(
    [...new Set(righe.map((r) => r.competitionSourceId))]
      .filter((id): id is number => id !== null),
  );

  const sbilancio = p.falliControCasa - p.falliControTrasferta;
  const sbilancioGialli = p.gialliControCasa - p.gialliControTrasferta;

  return (
    <ProductShell activeSection="referees">
      <section className="oggi" aria-labelledby="arbitro-title">
        <Link className="dossier-back" href="/arbitri">← Arbitri</Link>

        <div className="oggi-eyebrow">
          <span className="oggi-kick">{p.competizione}</span>
          <span className="oggi-line" aria-hidden="true" />
          <span className="oggi-src">
            {p.gare} gare dirette
            {p.ultima === null ? "" : ` · fino al ${giorno(p.ultima)}`}
          </span>
        </div>

        <h1 id="arbitro-title" className="squad-title">{p.nome}</h1>
        <p className="home-lede">
          {p.paese === null ? "Paese non dichiarato dalla fonte." : `Arbitro di ${p.paese}.`}{" "}
          Tutte le medie che seguono sono calcolate sulle <b>nostre</b> osservazioni, su{" "}
          {p.gare} gare di cui abbiamo entrambe le squadre, e confrontate con gli altri
          direttori della stessa competizione.
        </p>

        <ul className="engine-rows">
          <li className="engine-row">
            <p className="engine-metric">Falli fischiati</p>
            <ul className="engine-splits">
              <li className="engine-split">
                <span className="engine-who">
                  A gara
                  <Posizione posizione={p.posizioneFalli} cosa="fischia" />
                </span>
                <span className="engine-exp">
                  {decimale(p.media.falli, 1)}
                  <span className="engine-obs">
                    metro della competizione {decimale(p.metro.falli, 1)}
                  </span>
                </span>
              </li>
              <li className="engine-split">
                <span className="engine-who">Contro la squadra di casa</span>
                <span className="engine-exp">{decimale(p.falliControCasa, 1)}</span>
              </li>
              <li className="engine-split">
                <span className="engine-who">Contro l&apos;ospite</span>
                <span className="engine-exp">{decimale(p.falliControTrasferta, 1)}</span>
              </li>
            </ul>
            <p className="engine-why">
              {Math.abs(sbilancio) < 0.5
                ? "Fischia allo stesso modo dalle due parti: lo scarto fra casa e ospite è sotto"
                  + " mezzo fallo a gara, cioè dentro il rumore."
                : `Fischia ${decimale(Math.abs(sbilancio), 1)} falli a gara in più contro `
                  + `${sbilancio > 0 ? "la squadra di casa" : "l'ospite"}. `
                  + "È una differenza osservata, non un giudizio sull'arbitro: dipende anche da "
                  + "come giocano le squadre che gli capitano."}
            </p>
          </li>

          <li className="engine-row">
            <p className="engine-metric">Cartellini</p>
            <ul className="engine-splits">
              <li className="engine-split">
                <span className="engine-who">
                  Gialli a gara
                  <Posizione posizione={p.posizioneGialli} cosa="ammonisce" />
                </span>
                <span className="engine-exp">
                  {decimale(p.media.gialli, 2)}
                  <span className="engine-obs">
                    metro della competizione {decimale(p.metro.gialli, 2)}
                  </span>
                </span>
              </li>
              <li className="engine-split">
                <span className="engine-who">Di cui alla squadra di casa</span>
                <span className="engine-exp">{decimale(p.gialliControCasa, 2)}</span>
              </li>
              <li className="engine-split">
                <span className="engine-who">Di cui all&apos;ospite</span>
                <span className="engine-exp">{decimale(p.gialliControTrasferta, 2)}</span>
              </li>
              <li className="engine-split">
                <span className="engine-who">Espulsioni a gara</span>
                <span className="engine-exp">
                  {decimale(p.media.rossi, 2)}
                  <span className="engine-obs">
                    metro della competizione {decimale(p.metro.rossi, 2)}
                  </span>
                </span>
              </li>
            </ul>
            <p className="engine-why">
              {Math.abs(sbilancioGialli) < 0.3
                ? "Ammonisce le due squadre allo stesso modo."
                : `Ammonisce ${decimale(Math.abs(sbilancioGialli), 2)} volte a gara in più `
                  + `${sbilancioGialli > 0 ? "la squadra di casa" : "l'ospite"}, cioè il `
                  + `${Math.round(Math.abs(sbilancioGialli) / Math.max(p.gialliControCasa, p.gialliControTrasferta) * 100)}% `
                  + "in più. Lo squilibrio nei cartellini è più raro di quello nei falli, "
                  + "e vale la pena notarlo: fischiare un fallo e ammonire sono due decisioni "
                  + "diverse."}{" "}
              Le espulsioni comprendono i rossi diretti e le seconde ammonizioni. Su{" "}
              {p.gare} gare un&apos;espulsione in più o in meno sposta la media di{" "}
              {decimale(1 / p.gare, 2)}: è il numero più fragile della scheda, e va letto
              sapendolo.
            </p>
          </li>
        </ul>

        {/* La scheda vera e propria: stagione per stagione, competizione per competizione,
            sempre a partita. Sostituisce l'elenco delle ultime venti gare, che diceva molto
            meno con lo stesso spazio. */}
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Come fischia</span>
          <span className="oggi-line" aria-hidden="true" />
          <span className="oggi-src">stagione per stagione</span>
        </div>

        <ArbitroScheda
          nome={p.nome}
          carriera={carriera === null ? null : {
            gare: carriera.careerGames,
            gialli: carriera.careerYellowCards,
            rossi: carriera.careerRedCards,
          }}
          righe={righe}
          gareDirette={gare}
          medieLunghe={medieDelPeriodo(gare)}
          quiEOra={null}
          daQuando={gare.at(-1)?.quando ?? null}
          metri={metri}
        />

        <p className="dossier-src">
          Il metro è la media dei direttori della stessa competizione con almeno cinque gare,
          e la posizione dice quanti ne fischia più di lui. <b>Non è un voto.</b> Un arbitro
          che fischia molto può avere avuto partite spigolose, e uno che ammonisce poco può
          aver diretto gare tranquille: qui si misura quello che è successo in campo, non come
          ha arbitrato.
        </p>
      </section>
    </ProductShell>
  );
}
