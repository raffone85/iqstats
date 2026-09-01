import type { Metadata } from "next";
import Link from "next/link";

import { DossierCapitoli, DossierCapitolo } from "@/components/dossier-capitoli";
import { ProductShell } from "@/components/product-shell";
import { getMatchDetail } from "@/server/iqstats/match-context";
import { getMatchOdds } from "@/server/iqstats/odds";
import { getMatchPrediction, getUpcomingPredictions } from "@/server/iqstats/predictions";
import { readMarket } from "@/server/iqstats/match-reading";
import { proiezioniDellaGara } from "@/server/iqstats/projection-runtime";
import {
  QUOTA_PRIMO_TEMPO,
  mercatiGol,
  mercatiPrimoTempo,
  mercatiSecondoTempo,
  type MercatiGol,
} from "@/server/iqstats/projection/gol";
import type { ProiezioneDiGara } from "@/server/iqstats/projection/match";

export const metadata: Metadata = {
  title: "Laboratorio dossier",
  description: "Dossier di prova alimentato dagli endpoint, fuori dalla produzione.",
};

export const dynamic = "force-dynamic";

const CAPITOLI = [
  { id: "quadro", nome: "Quadro" },
  { id: "primo-tempo", nome: "1° tempo" },
  { id: "secondo-tempo", nome: "2° tempo" },
  { id: "over", nome: "Over" },
  { id: "tiri", nome: "Tiri" },
  { id: "multigol", nome: "Multigol" },
  { id: "quote", nome: "Quote" },
  { id: "consigli", nome: "Consigli" },
] as const;

const kickoffFormatter = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits).replace(".", ",");
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function pct100(n: number): string {
  return `${Math.round(n)}%`;
}

function as01(n: number | null): number | null {
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
}

function attesoBersaglio(bersagli: readonly ProiezioneDiGara[], target: string, lato: "casa" | "trasferta"): number | null {
  const b = bersagli.find((x) => x.target === target);
  if (!b) return null;
  const latoEsito = lato === "casa" ? b.casa : b.trasferta;
  return latoEsito.stato === "prevista" ? latoEsito.valoreAtteso : null;
}

function topMultigol(m: MercatiGol) {
  return [...m.multigolPartita].sort((a, b) => b.probabilita - a.probabilita)[0];
}

type PageProps = { searchParams: Promise<{ id?: string }> };

export default async function LaboratorioPage({ searchParams }: PageProps) {
  const params = await searchParams;
  let eventId = params.id && /^[1-9]\d*$/.test(params.id) ? Number(params.id) : null;

  if (eventId === null) {
    const upcoming = await getUpcomingPredictions(40);
    eventId = upcoming.predictions[0]?.eventId ?? null;
  }

  if (eventId === null) {
    return (
      <ProductShell>
        <div className="dossier">
          <Link className="dossier-back" href="/">← Home</Link>
          <div className="oggi-empty">
            <h2>Nessuna gara dall'endpoint</h2>
            <p>predictions/?date_from non ha restituito righe.</p>
          </div>
        </div>
      </ProductShell>
    );
  }

  const esito = await getMatchDetail(eventId);
  if (esito.stato !== "trovato") {
    return (
      <ProductShell>
        <div className="dossier">
          <Link className="dossier-back" href="/">← Home</Link>
          <div className="oggi-empty">
            <h2>Gara {eventId} non leggibile</h2>
            <p>events/{eventId}/ non ha dato un dettaglio utilizzabile ({esito.stato}).</p>
          </div>
        </div>
      </ProductShell>
    );
  }

  const detail = esito.detail;
  const [prediction, odds, proiezioniRaw] = await Promise.all([
    getMatchPrediction(eventId),
    getMatchOdds(eventId),
    proiezioniDellaGara(detail),
  ]);

  const proiezioni = typeof proiezioniRaw === "string" ? null : proiezioniRaw;
  const gol = proiezioni?.gol ?? null;
  const casaAttesi = gol?.mercati.casa.attesi ?? prediction?.xgHome ?? null;
  const fuoriAttesi = gol?.mercati.trasferta.attesi ?? prediction?.xgAway ?? null;
  const totAttesi = casaAttesi !== null && fuoriAttesi !== null ? casaAttesi + fuoriAttesi : null;
  const mercatiFt = gol?.mercati ?? (casaAttesi !== null && fuoriAttesi !== null
    ? mercatiGol(casaAttesi, fuoriAttesi)
    : null);
  const mercati1t = casaAttesi !== null && fuoriAttesi !== null
    ? mercatiPrimoTempo(casaAttesi, fuoriAttesi)
    : null;
  const mercati2t = casaAttesi !== null && fuoriAttesi !== null
    ? mercatiSecondoTempo(casaAttesi, fuoriAttesi)
    : null;

  const pHome = as01(prediction?.probHome ?? null);
  const pOver25 = as01(prediction?.probOver25 ?? mercatiFt?.overUnder.find((l) => l.linea === 2.5)?.sopra ?? null);
  const pBtts = as01(prediction?.probBtts ?? mercatiFt?.gg ?? null);

  const market = odds ? readMarket(
    prediction
      ? {
        probHome: prediction.probHome,
        probDraw: prediction.probDraw,
        probAway: prediction.probAway,
        probOver25: prediction.probOver25,
        probBtts: prediction.probBtts,
      }
      : null,
    odds,
    detail.homeTeam,
    detail.awayTeam,
  ) : null;

  const tiriCasa = attesoBersaglio(proiezioni?.bersagli ?? [], "total_shots", "casa");
  const tiriFuori = attesoBersaglio(proiezioni?.bersagli ?? [], "total_shots", "trasferta");
  const tipCasa = attesoBersaglio(proiezioni?.bersagli ?? [], "shots_on_target", "casa");
  const tipFuori = attesoBersaglio(proiezioni?.bersagli ?? [], "shots_on_target", "trasferta");
  const cornerCasa = attesoBersaglio(proiezioni?.bersagli ?? [], "corner_kicks", "casa");
  const cornerFuori = attesoBersaglio(proiezioni?.bersagli ?? [], "corner_kicks", "trasferta");
  const falliCasa = attesoBersaglio(proiezioni?.bersagli ?? [], "fouls", "casa");
  const falliFuori = attesoBersaglio(proiezioni?.bersagli ?? [], "fouls", "trasferta");
  const gialliCasa = attesoBersaglio(proiezioni?.bersagli ?? [], "yellow_cards", "casa");
  const gialliFuori = attesoBersaglio(proiezioni?.bersagli ?? [], "yellow_cards", "trasferta");

  const quando = detail.kickoff ? kickoffFormatter.format(new Date(detail.kickoff)).replace(",", " ·") : "orario n/d";
  const fonteGol = gol ? "proiezione sulle osservazioni" : prediction?.xgHome != null ? "endpoint /prediction/" : "assente";

  return (
    <ProductShell>
      <div className="oggi-backdrop" aria-hidden="true" />
      <div className="dossier">
        <Link className="dossier-back" href="/">← Home</Link>
        <article className="oggi-hero">
          <div className="oggi-hero-stadium" aria-hidden="true" />
          <div className="oggi-hero-scrim" aria-hidden="true" />
          <div className="oggi-hero-body">
            <p className="oggi-hero-comp">
              <span>{detail.roundName ?? "Gara"} · laboratorio</span>
              <span className="oggi-hero-when">{quando} · id {eventId}</span>
            </p>
            <div className="oggi-hero-teams">
              <span className="oggi-team">
                <span className="oggi-crest"><span className="oggi-crest-mono">{detail.homeTeam.slice(0, 2).toUpperCase()}</span></span>
                <span className="oggi-team-name">{detail.homeTeam}</span>
              </span>
              <span className="oggi-vs">contro</span>
              <span className="oggi-team oggi-team-away">
                <span className="oggi-team-name">{detail.awayTeam}</span>
                <span className="oggi-crest"><span className="oggi-crest-mono">{detail.awayTeam.slice(0, 2).toUpperCase()}</span></span>
              </span>
            </div>
          </div>
        </article>

        <DossierCapitoli capitoli={CAPITOLI} />

        <section className="dossier-panel contesto" aria-labelledby="quadro">
          <DossierCapitolo id="quadro" nome="Il quadro della gara" descrizione={`Numeri dagli endpoint. Gol: ${fonteGol}.`} />
          <p className="contesto-favorito">
            {pHome !== null ? `${detail.homeTeam} ${pct(pHome)}` : "Esito non coperto dall'endpoint"}
          </p>
          <ul className="contesto-righe">
            <li className="contesto-riga">
              <span className="contesto-fam">Gol <em>· gara</em></span>
              <span className="contesto-atteso">{totAttesi !== null ? fmt(totAttesi) : "—"}</span>
              <span className="contesto-metro">{casaAttesi !== null && fuoriAttesi !== null ? `${fmt(casaAttesi)} / ${fmt(fuoriAttesi)}` : "xg assente"}</span>
            </li>
            <li className="contesto-riga">
              <span className="contesto-fam">Gol <em>· 1T</em></span>
              <span className="contesto-atteso">{mercati1t ? fmt(mercati1t.attesiTotali) : "—"}</span>
              <span className="contesto-metro">44% del totale, quota europea</span>
            </li>
            <li className="contesto-riga">
              <span className="contesto-fam">Gol <em>· 2T</em></span>
              <span className="contesto-atteso">{mercati2t ? fmt(mercati2t.attesiTotali) : "—"}</span>
              <span className="contesto-metro">56% del totale</span>
            </li>
            <li className="contesto-riga">
              <span className="contesto-fam">Entrambe</span>
              <span className="contesto-atteso">{pBtts !== null ? pct(pBtts) : "—"}</span>
              <span className="contesto-metro">over 2,5 {pOver25 !== null ? pct(pOver25) : "—"}</span>
            </li>
          </ul>
          <p className="contesto-riserva">
            {prediction?.modelVersion ? `Modello fonte ${prediction.modelVersion}. ` : ""}
            {gol ? `${gol.campioneCasa} gare casa, ${gol.campioneTrasferta} fuori, ${gol.campioneLega} righe di lega. ` : ""}
            Altra gara: /laboratorio?id=EVENT_ID
          </p>
        </section>

        {mercati1t ? (
          <section className="dossier-panel" aria-labelledby="primo-tempo">
            <DossierCapitolo id="primo-tempo" nome="Primo tempo" descrizione="Poisson sui lambda della gara, tagliati al 44%." />
            <ul className="engine-rows">
              <li className="engine-row">
                <p className="engine-metric">Gol attesi 1T</p>
                <ul className="engine-splits">
                  <li className="engine-split"><span className="engine-who">{detail.homeTeam}</span><span className="engine-exp">{fmt(mercati1t.casa.attesi)}</span></li>
                  <li className="engine-split"><span className="engine-who">{detail.awayTeam}</span><span className="engine-exp">{fmt(mercati1t.trasferta.attesi)}</span></li>
                  <li className="engine-split"><span className="engine-who">Totale</span><span className="engine-exp">{fmt(mercati1t.attesiTotali)}</span></li>
                </ul>
              </li>
              <li className="engine-row">
                <p className="engine-metric">Esito 1T</p>
                <ul className="engine-ladder">
                  <li className="engine-step"><span className="engine-step-line">1</span><span className="engine-step-prob">{pct(mercati1t.esito.uno)}</span></li>
                  <li className="engine-step"><span className="engine-step-line">X</span><span className="engine-step-prob">{pct(mercati1t.esito.x)}</span></li>
                  <li className="engine-step"><span className="engine-step-line">2</span><span className="engine-step-prob">{pct(mercati1t.esito.due)}</span></li>
                </ul>
              </li>
              <li className="engine-row">
                <p className="engine-metric">Over 1T</p>
                <ul className="engine-ladder">
                  <li className="engine-step is-central"><span className="engine-step-line">Over 0,5</span><span className="engine-step-prob">{pct(1 - Math.exp(-mercati1t.attesiTotali))}</span></li>
                  <li className="engine-step"><span className="engine-step-line">Over 1,5</span><span className="engine-step-prob">{pct(mercati1t.overUnder.find((l) => l.linea === 1.5)?.sopra ?? 0)}</span></li>
                </ul>
              </li>
            </ul>
          </section>
        ) : null}

        {mercati2t ? (
          <section className="dossier-panel" aria-labelledby="secondo-tempo">
            <DossierCapitolo id="secondo-tempo" nome="Secondo tempo" descrizione="Stessi lambda, quota 56%." />
            <ul className="engine-rows">
              <li className="engine-row">
                <p className="engine-metric">Gol attesi 2T</p>
                <ul className="engine-splits">
                  <li className="engine-split"><span className="engine-who">{detail.homeTeam}</span><span className="engine-exp">{fmt(mercati2t.casa.attesi)}</span></li>
                  <li className="engine-split"><span className="engine-who">{detail.awayTeam}</span><span className="engine-exp">{fmt(mercati2t.trasferta.attesi)}</span></li>
                  <li className="engine-split"><span className="engine-who">Totale</span><span className="engine-exp">{fmt(mercati2t.attesiTotali)}</span></li>
                </ul>
              </li>
              <li className="engine-row">
                <p className="engine-metric">Over 2T</p>
                <ul className="engine-ladder">
                  <li className="engine-step is-central"><span className="engine-step-line">Over 0,5</span><span className="engine-step-prob">{pct(1 - Math.exp(-mercati2t.attesiTotali))}</span></li>
                  <li className="engine-step"><span className="engine-step-line">Over 1,5</span><span className="engine-step-prob">{pct(mercati2t.overUnder.find((l) => l.linea === 1.5)?.sopra ?? 0)}</span></li>
                </ul>
              </li>
            </ul>
          </section>
        ) : null}

        {mercatiFt ? (
          <section className="dossier-panel" aria-labelledby="over">
            <DossierCapitolo id="over" nome="Over e under" descrizione="Linee di fine gara dal modello gol." />
            <ul className="engine-rows">
              <li className="engine-row">
                <p className="engine-metric">Fine gara</p>
                <ul className="engine-ladder">
                  {mercatiFt.overUnder.map((l) => (
                    <li key={l.linea} className={`engine-step${l.linea === 2.5 ? " is-central" : ""}`}>
                      <span className="engine-step-line">Over {String(l.linea).replace(".", ",")}</span>
                      <span className="engine-step-prob">{pct(l.sopra)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </section>
        ) : null}

        <section className="dossier-panel" aria-labelledby="tiri">
          <DossierCapitolo id="tiri" nome="Tiri e altri mercati" descrizione="Bersagli del motore, se coperti." />
          {tiriCasa === null && tipCasa === null ? (
            <p className="dossier-src">Nessun bersaglio tiri su questa gara.</p>
          ) : (
            <ul className="engine-rows">
              {tiriCasa !== null && tiriFuori !== null ? (
                <li className="engine-row">
                  <p className="engine-metric">Tiri totali</p>
                  <ul className="engine-splits">
                    <li className="engine-split"><span className="engine-who">{detail.homeTeam}</span><span className="engine-exp">{fmt(tiriCasa, 1)}</span></li>
                    <li className="engine-split"><span className="engine-who">{detail.awayTeam}</span><span className="engine-exp">{fmt(tiriFuori, 1)}</span></li>
                    <li className="engine-split"><span className="engine-who">Totale</span><span className="engine-exp">{fmt(tiriCasa + tiriFuori, 1)}</span></li>
                  </ul>
                </li>
              ) : null}
              {tipCasa !== null && tipFuori !== null ? (
                <li className="engine-row">
                  <p className="engine-metric">Tiri in porta</p>
                  <ul className="engine-splits">
                    <li className="engine-split"><span className="engine-who">{detail.homeTeam}</span><span className="engine-exp">{fmt(tipCasa, 1)}</span></li>
                    <li className="engine-split"><span className="engine-who">{detail.awayTeam}</span><span className="engine-exp">{fmt(tipFuori, 1)}</span></li>
                    <li className="engine-split"><span className="engine-who">Totale</span><span className="engine-exp">{fmt(tipCasa + tipFuori, 1)}</span></li>
                  </ul>
                </li>
              ) : null}
              {cornerCasa !== null && cornerFuori !== null ? (
                <li className="engine-row">
                  <p className="engine-metric">Corner</p>
                  <ul className="engine-splits">
                    <li className="engine-split"><span className="engine-who">{detail.homeTeam}</span><span className="engine-exp">{fmt(cornerCasa, 1)}</span></li>
                    <li className="engine-split"><span className="engine-who">{detail.awayTeam}</span><span className="engine-exp">{fmt(cornerFuori, 1)}</span></li>
                  </ul>
                </li>
              ) : null}
              {falliCasa !== null && falliFuori !== null ? (
                <li className="engine-row">
                  <p className="engine-metric">Falli</p>
                  <ul className="engine-splits">
                    <li className="engine-split"><span className="engine-who">{detail.homeTeam}</span><span className="engine-exp">{fmt(falliCasa, 1)}</span></li>
                    <li className="engine-split"><span className="engine-who">{detail.awayTeam}</span><span className="engine-exp">{fmt(falliFuori, 1)}</span></li>
                  </ul>
                </li>
              ) : null}
              {gialliCasa !== null && gialliFuori !== null ? (
                <li className="engine-row">
                  <p className="engine-metric">Gialli</p>
                  <ul className="engine-splits">
                    <li className="engine-split"><span className="engine-who">{detail.homeTeam}</span><span className="engine-exp">{fmt(gialliCasa, 1)}</span></li>
                    <li className="engine-split"><span className="engine-who">{detail.awayTeam}</span><span className="engine-exp">{fmt(gialliFuori, 1)}</span></li>
                  </ul>
                </li>
              ) : null}
            </ul>
          )}
        </section>

        {mercatiFt ? (
          <section className="dossier-panel" aria-labelledby="multigol">
            <DossierCapitolo id="multigol" nome="Multigol" descrizione="Fasce della stessa distribuzione." />
            <ul className="engine-rows">
              <li className="engine-row">
                <p className="engine-metric">Gara</p>
                <ul className="engine-ladder">
                  {mercatiFt.multigolPartita.slice(0, 4).map((i) => (
                    <li key={`${i.da}-${i.a}`} className="engine-step">
                      <span className="engine-step-line">{i.da}-{i.a}</span>
                      <span className="engine-step-prob">{pct(i.probabilita)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </section>
        ) : null}

        <section className="dossier-panel" aria-labelledby="quote">
          <DossierCapitolo id="quote" nome="Quote a confronto" descrizione="odds/comparison/ · consenso." />
          {market ? (
            <>
              <p className="dossier-verdict-lead">{market.sentence}</p>
              <div className="market-table">
                <div className="market-head" aria-hidden="true">
                  <span>Esito</span><span>Modello</span><span>Mercato</span><span>Quota</span>
                </div>
                {market.rows.map((r) => (
                  <div className="market-row" key={r.label}>
                    <span className="market-label">{r.label}</span>
                    <span className="market-val">{r.model !== null ? pct100(r.model) : "—"}</span>
                    <span className="market-val">{r.market !== null ? pct100(r.market) : "—"}</span>
                    <span className="market-val market-odds">{r.odds !== null ? fmt(r.odds) : "—"}</span>
                  </div>
                ))}
              </div>
              <p className="dossier-src">Consenso su {odds?.bookmakers ?? 0} operatori.</p>
            </>
          ) : (
            <p className="dossier-src">Endpoint quote assente su questa gara.</p>
          )}
        </section>

        <section className="dossier-panel analisi" aria-labelledby="consigli">
          <DossierCapitolo id="consigli" nome="Lettura finale" descrizione="Solo da numeri già in pagina." />
          <ol className="analisi-voci">
            {mercatiFt ? (
              <li>
                <span className="analisi-titoletto">Multigol</span>{" "}
                <span>Fascia più densa {topMultigol(mercatiFt).da}–{topMultigol(mercatiFt).a} ({pct(topMultigol(mercatiFt).probabilita)}).</span>
              </li>
            ) : null}
            {mercati2t ? (
              <li>
                <span className="analisi-titoletto">Secondo tempo</span>{" "}
                <span>Over 0,5 2T al {pct(1 - Math.exp(-mercati2t.attesiTotali))}.</span>
              </li>
            ) : null}
            {tipCasa !== null ? (
              <li>
                <span className="analisi-titoletto">Tiri in porta casa</span>{" "}
                <span>{fmt(tipCasa, 1)} attesi dal motore.</span>
              </li>
            ) : null}
          </ol>
        </section>

        <p className="dossier-note">
          Laboratorio. Endpoint server-side. Produzione intatta. Gara {eventId}.
        </p>
      </div>
    </ProductShell>
  );
}
