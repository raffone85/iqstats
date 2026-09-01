import type { Metadata } from "next";
import Link from "next/link";

import { DossierCapitoli, DossierCapitolo } from "@/components/dossier-capitoli";
import { ProductShell } from "@/components/product-shell";
import { StatEngineSection } from "@/components/stat-engine-section";
import { getMatchDetail, getReferee } from "@/server/iqstats/match-context";
import { getMatchOdds } from "@/server/iqstats/odds";
import { getMatchPrediction, getUpcomingPredictions } from "@/server/iqstats/predictions";
import { readMarket } from "@/server/iqstats/match-reading";
import { proiezioniDellaGara } from "@/server/iqstats/projection-runtime";
import {
  mercatiGol,
  mercatiPrimoTempo,
  mercatiSecondoTempo,
  type MercatiGol,
} from "@/server/iqstats/projection/gol";
import type { ProiezioneDiGara } from "@/server/iqstats/projection/match";
import { getStatEngineReading } from "@/server/iqstats/stat-engine";

export const metadata: Metadata = {
  title: "Laboratorio dossier",
  description: "Match intelligence dossier in preview. Motori esistenti, produzione intatta.",
};

export const dynamic = "force-dynamic";

const CAPITOLI = [
  { id: "quadro", nome: "Quadro" },
  { id: "segnali", nome: "Segnali" },
  { id: "primo-tempo", nome: "1° tempo" },
  { id: "secondo-tempo", nome: "2° tempo" },
  { id: "over", nome: "Over" },
  { id: "multigol", nome: "Multigol" },
  { id: "matchup", nome: "Matchup" },
  { id: "proiezioni", nome: "Proiezioni" },
  { id: "arbitro", nome: "Arbitro" },
  { id: "lega", nome: "Lega" },
  { id: "h2h", nome: "H2H" },
  { id: "quote", nome: "Quote" },
  { id: "value", nome: "Value" },
  { id: "consigli", nome: "Insight" },
] as const;

const METRIC_LABELS: Record<string, string> = {
  total_shots: "Tiri",
  shots_on_target: "Tiri in porta",
  corner_kicks: "Corner",
  fouls: "Falli",
  yellow_cards: "Gialli",
  offsides: "Fuorigioco",
  goalkeeper_saves: "Parate",
  shots: "Tiri",
  sot: "Tiri in porta",
  corners: "Corner",
  yellows: "Gialli",
  saves: "Parate",
};

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

function as01(n: number | null | undefined): number | null {
  if (n == null) return null;
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

function edgeLabel(edge: number | null): string {
  if (edge === null) return "n/d";
  if (edge >= 0.08) return "edge forte";
  if (edge >= 0.03) return "edge positivo";
  if (edge > 0) return "edge basso";
  return "nessun edge";
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
  const [prediction, odds, proiezioniRaw, referee] = await Promise.all([
    getMatchPrediction(eventId),
    getMatchOdds(eventId),
    proiezioniDellaGara(detail),
    detail.refereeId ? getReferee(detail.refereeId) : Promise.resolve(null),
  ]);

  const engine = getStatEngineReading({
    leagueId: detail.leagueId,
    homeTeamId: detail.homeTeamId,
    awayTeamId: detail.awayTeamId,
    refereeId: detail.refereeId,
  });

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
  const pDraw = as01(prediction?.probDraw ?? null);
  const pAway = as01(prediction?.probAway ?? null);
  const pOver25 = as01(prediction?.probOver25 ?? mercatiFt?.overUnder.find((l) => l.linea === 2.5)?.sopra ?? null);
  const pBtts = as01(prediction?.probBtts ?? mercatiFt?.gg ?? null);

  const esito1x2 = [
    { k: "1", p: pHome, nome: detail.homeTeam },
    { k: "X", p: pDraw, nome: "Pareggio" },
    { k: "2", p: pAway, nome: detail.awayTeam },
  ].filter((x) => x.p !== null).sort((a, b) => (b.p ?? 0) - (a.p ?? 0))[0] ?? null;

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

  const bersagli = proiezioni?.bersagli ?? [];
  const matchupRows = [
    { key: "total_shots", casa: attesoBersaglio(bersagli, "total_shots", "casa"), away: attesoBersaglio(bersagli, "total_shots", "trasferta") },
    { key: "shots_on_target", casa: attesoBersaglio(bersagli, "shots_on_target", "casa"), away: attesoBersaglio(bersagli, "shots_on_target", "trasferta") },
    { key: "corner_kicks", casa: attesoBersaglio(bersagli, "corner_kicks", "casa"), away: attesoBersaglio(bersagli, "corner_kicks", "trasferta") },
    { key: "fouls", casa: attesoBersaglio(bersagli, "fouls", "casa"), away: attesoBersaglio(bersagli, "fouls", "trasferta") },
    { key: "yellow_cards", casa: attesoBersaglio(bersagli, "yellow_cards", "casa"), away: attesoBersaglio(bersagli, "yellow_cards", "trasferta") },
    { key: "offsides", casa: attesoBersaglio(bersagli, "offsides", "casa"), away: attesoBersaglio(bersagli, "offsides", "trasferta") },
    { key: "goalkeeper_saves", casa: attesoBersaglio(bersagli, "goalkeeper_saves", "casa"), away: attesoBersaglio(bersagli, "goalkeeper_saves", "trasferta") },
  ].filter((r) => r.casa !== null || r.away !== null);

  const segnali: { titolo: string; motivo: string; forza: string }[] = [];
  if (mercati1t) {
    const o05 = 1 - Math.exp(-mercati1t.attesiTotali);
    if (o05 >= 0.62) {
      segnali.push({
        titolo: "Gol nel primo tempo",
        motivo: `Over 0,5 1T al ${pct(o05)} dal taglio 44% dei lambda di gara.`,
        forza: o05 >= 0.72 ? "forte" : "media",
      });
    }
  }
  if (mercati2t) {
    const o052t = 1 - Math.exp(-mercati2t.attesiTotali);
    if (o052t >= 0.68) {
      segnali.push({
        titolo: "Gol nel secondo tempo",
        motivo: `Over 0,5 2T al ${pct(o052t)} (quota 56% del totale).`,
        forza: o052t >= 0.78 ? "forte" : "media",
      });
    }
  }
  if (pBtts !== null && pBtts >= 0.55) {
    segnali.push({
      titolo: "Entrambe segnano",
      motivo: `BTTS al ${pct(pBtts)} dal modello gol.`,
      forza: pBtts >= 0.62 ? "forte" : "media",
    });
  }
  if (pOver25 !== null && pOver25 >= 0.55) {
    segnali.push({
      titolo: "Over 2,5",
      motivo: `Fine gara al ${pct(pOver25)}.`,
      forza: pOver25 >= 0.62 ? "forte" : "media",
    });
  }
  const sotCasa = attesoBersaglio(bersagli, "shots_on_target", "casa");
  const sotAway = attesoBersaglio(bersagli, "shots_on_target", "trasferta");
  if (sotCasa !== null && sotCasa >= 5) {
    segnali.push({
      titolo: `Tiri in porta ${detail.homeTeam}`,
      motivo: `${fmt(sotCasa, 1)} attesi dal Projection Engine.`,
      forza: sotCasa >= 6.5 ? "forte" : "media",
    });
  }
  if (sotAway !== null && sotAway >= 4.5) {
    segnali.push({
      titolo: `Tiri in porta ${detail.awayTeam}`,
      motivo: `${fmt(sotAway, 1)} attesi dal Projection Engine.`,
      forza: "media",
    });
  }

  const valueRows = market?.rows.map((r) => {
    const model = r.model !== null ? (r.model > 1 ? r.model / 100 : r.model) : null;
    const implied = r.odds !== null && r.odds > 1 ? 1 / r.odds : (r.market !== null ? (r.market > 1 ? r.market / 100 : r.market) : null);
    const edge = model !== null && implied !== null ? model - implied : null;
    return { ...r, edge };
  }) ?? [];
  const bestValue = [...valueRows].filter((r) => r.edge !== null).sort((a, b) => (b.edge ?? -99) - (a.edge ?? -99))[0] ?? null;

  const quando = detail.kickoff ? kickoffFormatter.format(new Date(detail.kickoff)).replace(",", " ·") : "orario n/d";
  const fonteGol = gol ? "Projection Engine (osservazioni)" : prediction?.xgHome != null ? "endpoint /prediction/" : "assente";
  const h2h = detail.headToHead;

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
              <span>{detail.roundName ?? "Gara"} · laboratorio preview</span>
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
          <DossierCapitolo id="quadro" nome="Match overview" descrizione={`Gol: ${fonteGol}. BSD prediction usata come benchmark, non come verità.`} />
          <p className="contesto-favorito">
            {esito1x2?.p != null ? `${esito1x2.nome} ${pct(esito1x2.p)}` : "Esito non coperto"}
          </p>
          <ul className="contesto-righe">
            <li className="contesto-riga">
              <span className="contesto-fam">1X2</span>
              <span className="contesto-atteso">{pHome !== null ? pct(pHome) : "—"}</span>
              <span className="contesto-metro">{pDraw !== null ? `X ${pct(pDraw)}` : "X —"} · {pAway !== null ? `2 ${pct(pAway)}` : "2 —"}</span>
            </li>
            <li className="contesto-riga">
              <span className="contesto-fam">xG</span>
              <span className="contesto-atteso">{totAttesi !== null ? fmt(totAttesi) : "—"}</span>
              <span className="contesto-metro">{casaAttesi !== null && fuoriAttesi !== null ? `${fmt(casaAttesi)} / ${fmt(fuoriAttesi)}` : "assente"}</span>
            </li>
            <li className="contesto-riga">
              <span className="contesto-fam">BTTS</span>
              <span className="contesto-atteso">{pBtts !== null ? pct(pBtts) : "—"}</span>
              <span className="contesto-metro">Over 2,5 {pOver25 !== null ? pct(pOver25) : "—"}</span>
            </li>
            <li className="contesto-riga">
              <span className="contesto-fam">1T / 2T</span>
              <span className="contesto-atteso">{mercati1t && mercati2t ? `${fmt(mercati1t.attesiTotali)} / ${fmt(mercati2t.attesiTotali)}` : "—"}</span>
              <span className="contesto-metro">split 44 / 56</span>
            </li>
          </ul>
          <p className="contesto-riserva">
            {prediction?.modelVersion ? `Benchmark BSD ${prediction.modelVersion}. ` : ""}
            {gol ? `${gol.campioneCasa} gare casa, ${gol.campioneTrasferta} fuori, ${gol.campioneLega} righe di lega. ` : ""}
            Altra gara: /laboratorio?id=EVENT_ID
          </p>
        </section>

        <section className="dossier-panel" aria-labelledby="segnali">
          <DossierCapitolo id="segnali" nome="Signal radar" descrizione="Convergenze automatiche. Mai «sicuro»." />
          {segnali.length === 0 ? (
            <p className="dossier-src">Nessuna convergenza sopra soglia su questa gara.</p>
          ) : (
            <ol className="analisi-voci">
              {segnali.map((s) => (
                <li key={s.titolo}>
                  <span className="analisi-titoletto">{s.titolo} · {s.forza}</span>{" "}
                  <span>{s.motivo}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {mercati1t ? (
          <section className="dossier-panel" aria-labelledby="primo-tempo">
            <DossierCapitolo id="primo-tempo" nome="First half dossier" descrizione="Stessi lambda di gara, quota europea 44%. Non è un secondo motore." />
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
                <p className="engine-metric">1X2 primo tempo</p>
                <ul className="engine-ladder">
                  <li className="engine-step"><span className="engine-step-line">1</span><span className="engine-step-prob">{pct(mercati1t.esito.uno)}</span></li>
                  <li className="engine-step"><span className="engine-step-line">X</span><span className="engine-step-prob">{pct(mercati1t.esito.x)}</span></li>
                  <li className="engine-step"><span className="engine-step-line">2</span><span className="engine-step-prob">{pct(mercati1t.esito.due)}</span></li>
                </ul>
              </li>
              <li className="engine-row">
                <p className="engine-metric">Over / BTTS 1T</p>
                <ul className="engine-ladder">
                  <li className="engine-step is-central"><span className="engine-step-line">Over 0,5</span><span className="engine-step-prob">{pct(1 - Math.exp(-mercati1t.attesiTotali))}</span></li>
                  <li className="engine-step"><span className="engine-step-line">Over 1,5</span><span className="engine-step-prob">{pct(mercati1t.overUnder.find((l) => l.linea === 1.5)?.sopra ?? 0)}</span></li>
                  <li className="engine-step"><span className="engine-step-line">BTTS 1T</span><span className="engine-step-prob">{pct(mercati1t.gg)}</span></li>
                </ul>
              </li>
            </ul>
          </section>
        ) : null}

        {mercati2t ? (
          <section className="dossier-panel" aria-labelledby="secondo-tempo">
            <DossierCapitolo id="secondo-tempo" nome="Second half dossier" descrizione="Quota 56%. Late-goal come intensità del secondo tempo, non come minuto preciso." />
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
                  <li className="engine-step"><span className="engine-step-line">Quota gol 2T</span><span className="engine-step-prob">56%</span></li>
                </ul>
              </li>
            </ul>
          </section>
        ) : null}

        {mercatiFt ? (
          <section className="dossier-panel" aria-labelledby="over">
            <DossierCapitolo id="over" nome="Over / under fine gara" descrizione="Linee del modello gol già esistente." />
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

        {mercatiFt ? (
          <section className="dossier-panel" aria-labelledby="multigol">
            <DossierCapitolo id="multigol" nome="Multigol engine" descrizione="Fasce della stessa distribuzione Poisson. Non medie aritmetiche di percentuali." />
            <ul className="engine-rows">
              <li className="engine-row">
                <p className="engine-metric">Gara</p>
                <ul className="engine-ladder">
                  {mercatiFt.multigolPartita.map((i) => (
                    <li key={`${i.da}-${i.a}`} className="engine-step">
                      <span className="engine-step-line">{i.da}–{i.a}</span>
                      <span className="engine-step-prob">{pct(i.probabilita)}</span>
                    </li>
                  ))}
                </ul>
              </li>
              <li className="engine-row">
                <p className="engine-metric">{detail.homeTeam}</p>
                <ul className="engine-ladder">
                  {mercatiFt.casa.multigol.slice(0, 4).map((i) => (
                    <li key={`c-${i.da}-${i.a}`} className="engine-step">
                      <span className="engine-step-line">{i.da}–{i.a}</span>
                      <span className="engine-step-prob">{pct(i.probabilita)}</span>
                    </li>
                  ))}
                </ul>
              </li>
              <li className="engine-row">
                <p className="engine-metric">{detail.awayTeam}</p>
                <ul className="engine-ladder">
                  {mercatiFt.trasferta.multigol.slice(0, 4).map((i) => (
                    <li key={`a-${i.da}-${i.a}`} className="engine-step">
                      <span className="engine-step-line">{i.da}–{i.a}</span>
                      <span className="engine-step-prob">{pct(i.probabilita)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </section>
        ) : null}

        <section className="dossier-panel" aria-labelledby="matchup">
          <DossierCapitolo id="matchup" nome="Statistical matchup" descrizione="Numeri del Projection Engine. Nessun ricalcolo." />
          {matchupRows.length === 0 ? (
            <p className="dossier-src">Proiezione bersagli assente su questa gara. Resta ENG-1 sotto, se calibrato.</p>
          ) : (
            <div className="market-table">
              <div className="market-head" aria-hidden="true">
                <span>Metrica</span><span>{detail.homeTeam}</span><span>{detail.awayTeam}</span><span>Totale</span>
              </div>
              {matchupRows.map((r) => (
                <div className="market-row" key={r.key}>
                  <span className="market-label">{METRIC_LABELS[r.key] ?? r.key}</span>
                  <span className="market-val">{r.casa !== null ? fmt(r.casa, 1) : "—"}</span>
                  <span className="market-val">{r.away !== null ? fmt(r.away, 1) : "—"}</span>
                  <span className="market-val">{r.casa !== null && r.away !== null ? fmt(r.casa + r.away, 1) : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dossier-panel" aria-labelledby="proiezioni">
          <DossierCapitolo id="proiezioni" nome="ENG-1 · 5 linee" descrizione="Motore storico sulle osservazioni. Non è un nuovo Projection Engine." />
          <StatEngineSection reading={engine} homeTeam={detail.homeTeam} awayTeam={detail.awayTeam} />
        </section>

        <section className="dossier-panel" aria-labelledby="arbitro">
          <DossierCapitolo id="arbitro" nome="Referee dossier" descrizione="Profilo fonte vs blend ENG-1. Sotto soglia non si usa come feature." />
          {referee ? (
            <ul className="contesto-righe">
              <li className="contesto-riga">
                <span className="contesto-fam">{referee.name}</span>
                <span className="contesto-atteso">{referee.matches ?? referee.careerGames ?? "—"}</span>
                <span className="contesto-metro">gare profilo</span>
              </li>
              <li className="contesto-riga">
                <span className="contesto-fam">Gialli / gara</span>
                <span className="contesto-atteso">{referee.avgYellowPerMatch !== null ? fmt(referee.avgYellowPerMatch, 2) : "—"}</span>
                <span className="contesto-metro">rossi {referee.avgRedPerMatch !== null ? fmt(referee.avgRedPerMatch, 2) : "—"}</span>
              </li>
              <li className="contesto-riga">
                <span className="contesto-fam">Falli / gara</span>
                <span className="contesto-atteso">{referee.avgFoulsPerMatch !== null ? fmt(referee.avgFoulsPerMatch, 1) : "—"}</span>
                <span className="contesto-metro">{engine.available && engine.referee ? `ENG-1 ${engine.referee.tier} · ${engine.referee.currentMatches} gare` : "ENG-1 senza blend"}</span>
              </li>
            </ul>
          ) : (
            <p className="dossier-src">Arbitro non dichiarato su events/{eventId}/.</p>
          )}
        </section>

        <section className="dossier-panel" aria-labelledby="lega">
          <DossierCapitolo id="lega" nome="League context" descrizione="Baseline ENG-1 del campionato, se calibrato." />
          {engine.available ? (
            <>
              <p className="dossier-src">
                Copertura {engine.coverage.tier}{engine.coverage.seasonName ? ` · ${engine.coverage.seasonName}` : ""}.
                Campione storico {detail.homeTeam}: {engine.coverage.home.historicalMatches} · {detail.awayTeam}: {engine.coverage.away.historicalMatches}.
              </p>
              <div className="market-table">
                <div className="market-head" aria-hidden="true">
                  <span>Metrica</span><span>Atteso casa</span><span>Atteso fuori</span><span>Totale</span>
                </div>
                {engine.metrics.map((m) => (
                  <div className="market-row" key={m.metric}>
                    <span className="market-label">{METRIC_LABELS[m.metric] ?? m.metric}</span>
                    <span className="market-val">{fmt(m.expectedHome, 1)}</span>
                    <span className="market-val">{fmt(m.expectedAway, 1)}</span>
                    <span className="market-val">{fmt(m.expectedTotal, 1)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="dossier-src">Lega non calibrata o rating assente ({engine.reason}). Nessun valore inventato.</p>
          )}
        </section>

        <section className="dossier-panel" aria-labelledby="h2h">
          <DossierCapitolo id="h2h" nome="Scontri diretti" descrizione="Solo se la fonte li dà. Peso nullo se il campione è magro." />
          {h2h && (h2h.totalMatches ?? 0) >= 3 ? (
            <>
              <ul className="contesto-righe">
                <li className="contesto-riga">
                  <span className="contesto-fam">Campione</span>
                  <span className="contesto-atteso">{h2h.totalMatches}</span>
                  <span className="contesto-metro">{h2h.homeWins ?? "—"}-{h2h.draws ?? "—"}-{h2h.awayWins ?? "—"}</span>
                </li>
                <li className="contesto-riga">
                  <span className="contesto-fam">Gol medi</span>
                  <span className="contesto-atteso">{h2h.avgTotalGoals !== null ? fmt(h2h.avgTotalGoals, 2) : "—"}</span>
                  <span className="contesto-metro">{h2h.homeGoals ?? "—"} / {h2h.awayGoals ?? "—"}</span>
                </li>
              </ul>
              {h2h.recent.length > 0 ? (
                <ul className="analisi-voci">
                  {h2h.recent.slice(0, 5).map((g, i) => (
                    <li key={`${g.date}-${i}`}>
                      <span className="analisi-titoletto">{g.date ?? "data n/d"}</span>{" "}
                      <span>{g.home} {g.score ?? ""} {g.away}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="dossier-src">H2H assente o sotto 3 gare: non entra nei segnali.</p>
          )}
        </section>

        <section className="dossier-panel" aria-labelledby="quote">
          <DossierCapitolo id="quote" nome="Odds center" descrizione="odds/comparison/. Solo mercati realmente presenti." />
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
              <p className="dossier-src">Consenso su {odds?.bookmakers ?? 0} operatori. Movimento quote: assente se l'endpoint non lo espone.</p>
            </>
          ) : (
            <p className="dossier-src">Endpoint quote assente su questa gara.</p>
          )}
        </section>

        <section className="dossier-panel" aria-labelledby="value">
          <DossierCapitolo id="value" nome="Value e convergenza" descrizione="Edge = p modello − p implicita. Soglia 3%. Non è un consiglio automatico." />
          {valueRows.length === 0 ? (
            <p className="dossier-src">Niente da confrontare senza quote.</p>
          ) : (
            <div className="market-table">
              <div className="market-head" aria-hidden="true">
                <span>Mercato</span><span>Edge</span><span>Classe</span><span>Quota</span>
              </div>
              {valueRows.map((r) => (
                <div className="market-row" key={`v-${r.label}`}>
                  <span className="market-label">{r.label}</span>
                  <span className="market-val">{r.edge !== null ? `${r.edge >= 0 ? "+" : ""}${Math.round(r.edge * 100)} pp` : "—"}</span>
                  <span className="market-val">{edgeLabel(r.edge)}</span>
                  <span className="market-val market-odds">{r.odds !== null ? fmt(r.odds) : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dossier-panel analisi" aria-labelledby="consigli">
          <DossierCapitolo id="consigli" nome="Final match insight" descrizione="Lettura, non pronostico." />
          <ol className="analisi-voci">
            <li>
              <span className="analisi-titoletto">Top signal</span>{" "}
              <span>{segnali[0] ? `${segnali[0].titolo}: ${segnali[0].motivo}` : "Nessun segnale sopra soglia."}</span>
            </li>
            <li>
              <span className="analisi-titoletto">Secondo signal</span>{" "}
              <span>{segnali[1] ? `${segnali[1].titolo}: ${segnali[1].motivo}` : "—"}</span>
            </li>
            <li>
              <span className="analisi-titoletto">Angolo statistico</span>{" "}
              <span>
                {mercatiFt
                  ? `Multigol più denso ${topMultigol(mercatiFt).da}–${topMultigol(mercatiFt).a} (${pct(topMultigol(mercatiFt).probabilita)}).`
                  : "Distribuzione gol assente."}
              </span>
            </li>
            <li>
              <span className="analisi-titoletto">Value candidate</span>{" "}
              <span>
                {bestValue && bestValue.edge !== null && bestValue.edge >= 0.03
                  ? `${bestValue.label} · ${edgeLabel(bestValue.edge)} (${Math.round(bestValue.edge * 100)} pp)`
                  : "Nessun mercato sopra soglia 3%."}
              </span>
            </li>
            <li>
              <span className="analisi-titoletto">Reliability</span>{" "}
              <span>
                {engine.available
                  ? `ENG-1 ${engine.coverage.tier}, formula ${engine.formulaVersion}.`
                  : `ENG-1 non disponibile (${engine.reason}).`}
                {gol ? ` Proiezione gol su ${gol.campioneCasa + gol.campioneTrasferta} osservazioni squadra.` : ""}
              </span>
            </li>
          </ol>
        </section>

        <p className="dossier-note">
          Preview laboratorio. Orchestrazione A+B+C, nessun nuovo Projection Engine.
          Player XI e movimento quote restano vuoti se l'endpoint non li dà. Gara {eventId}.
        </p>
      </div>
    </ProductShell>
  );
}
