// Il consuntivo del valore: il valore contro il prezzo predice davvero i risultati?
//
// **Perche' esiste.** Il dossier scrive «valore +N» dove la nostra probabilita' sta sopra
// quella implicita nel prezzo del banco (`valoreSoglia`). Prima di usarlo per ordinare la
// home bisogna sapere se le linee con valore escono piu' spesso di quanto il prezzo dica, e
// se a quella quota avrebbero reso.
//
// Sola lettura. Per ogni gara chiusa che si aggancia all'archivio delle quote si prende
// l'**ultima lettura del palinsesto anteriore al calcio d'inizio**, si ricostruisce la
// proiezione con le sole righe anteriori - lo stesso taglio di `consuntivo-soglie.ts` - e
// per ogni linea quotata delle sette famiglie si calcola la nostra probabilita' come
// `quoteDellaGara` e il valore grezzo, nostra meno l'implicita di `valoreSoglia`; per i gol le
// tre voci della sezione Gol (1X2, Over/Under, Gol/NoGol). Accanto: che cosa e' successo e quanto
// avrebbe reso una puntata da 1 alla quota del banco.
//
// L'incertezza: frequenza con l'intervallo di Wilson al 95%; resa con un bootstrap che
// ricampiona le **gare**, non le linee, perche' le linee della stessa gara non sono
// indipendenti.
//
// Uso, con il livello dati in ascolto:
//   node --env-file=.env.local --conditions=react-server --import ./test/risolutore-ts.mjs \
//     --experimental-strip-types scripts/consuntivo-valore.ts [--insieme 8] [--letture file.json]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { constants, gunzipSync } from "node:zlib";

import { connessione } from "../src/server/iqstats/lettura.ts";
import { ARTEFATTI_DI_PRODUZIONE } from "../src/server/iqstats/projection-artefatti.ts";
import { proiezioniDellaGara } from "../src/server/iqstats/projection-runtime.ts";
import { distribuzioniDeiGol, quotaFra } from "../src/server/iqstats/projection/gol.ts";
import { type ProiezioneDiGara, soglieDi } from "../src/server/iqstats/projection/match.ts";
import { probabilitaSopra } from "../src/server/iqstats/projection/predictor.ts";
import {
  agganciaGara,
  chiaveDiLinea,
  eventoQuotato,
  type EventoGrezzo,
  type EventoQuotato,
} from "../src/server/iqstats/projection/quote.ts";
import { TETTO_VALORE, implicitaInGruppo, implicitaSoglia } from "../src/server/iqstats/projection/valore.ts";
import { realeDellaGara } from "../src/server/iqstats/verifica.ts";

type Lato = "casa" | "trasferta" | "totale";

const COLONNA: Readonly<Record<string, string>> = {
  total_shots: "total_shots",
  shots_on_target: "shots_on_target",
  corner_kicks: "corner_kicks",
  fouls: "fouls",
  yellow_cards: "yellow_cards",
  offsides: "offsides",
  goalkeeper_saves: "goalkeeper_saves",
};

interface RigaDiGara {
  readonly gara: string;
  readonly casa: string;
  readonly fuori: string;
  readonly nome_casa: string;
  readonly nome_fuori: string;
  readonly stagione: string;
  readonly arbitro: string | null;
  readonly kickoff: string;
  readonly allenatore_casa: string | null;
  readonly allenatore_fuori: string | null;
  readonly giornata: string | null;
  readonly derby: boolean | null;
  readonly gol_casa: number | null;
  readonly gol_fuori: number | null;
}

interface Lettura {
  readonly gara: string;
  readonly kickoff: string;
  readonly bersaglio: string;
  readonly lato: Lato;
  readonly soglia: number;
  /** «Over»/«Under» sulle linee; l'esito («1», «Sì», …) sui mercati dei gol. */
  readonly verso: string;
  readonly quota: number;
  readonly dueLati: boolean;
  readonly fuoriFinestra: boolean;
  readonly probabilita: number;
  readonly implicita: number;
  /**
   * Il valore **grezzo**, nostra meno implicita: e' la grandezza che questa misura giudica.
   * Dall'8 ottobre 2026 il dossier mostra quello sulla probabilita' combinata
   * (`valoreSoglia`), nato da qui; rimisurarlo con `valoreSoglia` sarebbe circolare.
   */
  readonly valore: number;
  /** 1 presa, 0 persa, `null` restituita (soglia intera colpita in pieno). */
  readonly presa: 1 | 0 | null;
  /** Resa netta di una puntata da 1. */
  readonly resa: number;
}

function argomento(nome: string, difetto: number): number {
  const indice = process.argv.indexOf("--" + nome);
  if (indice < 0) return difetto;
  const valore = Number(process.argv[indice + 1]);
  return Number.isFinite(valore) && valore > 0 ? valore : difetto;
}

/**
 * Per ogni gara del palinsesto, l'ultima lettura raccolta **prima** del calcio d'inizio.
 * Una lettura raccolta dopo non e' un prezzo che si poteva prendere.
 */
function archivio(): readonly EventoQuotato[] {
  const cartella = path.join(import.meta.dirname, "..", "..", "..", "scripts", "quote", "output");
  const file = readdirSync(cartella).filter((n) => /^fastbet-.*\.ndjson\.gz$/.test(n)).sort();
  const migliori = new Map<string, { raccolto: string; evento: EventoQuotato }>();
  for (const nome of file) {
    const testo = gunzipSync(readFileSync(path.join(cartella, nome)), {
      finishFlush: constants.Z_SYNC_FLUSH,
    }).toString("utf8");
    for (const riga of testo.split("\n")) {
      if (riga.trim() === "") continue;
      let grezzo: EventoGrezzo & { readonly raccolto_il?: string };
      try {
        grezzo = JSON.parse(riga) as EventoGrezzo & { readonly raccolto_il?: string };
      } catch {
        continue;
      }
      const raccolto = grezzo.raccolto_il;
      if (typeof raccolto !== "string") continue;
      if (Date.parse(raccolto) >= Date.parse(grezzo.inizio)) continue;
      const chiave = `${grezzo.casa}|${grezzo.fuori}|${grezzo.inizio}`;
      const gia = migliori.get(chiave);
      if (gia !== undefined && gia.raccolto >= raccolto) continue;
      migliori.set(chiave, { raccolto, evento: eventoQuotato(grezzo) });
    }
    console.log(`archivio: ${nome}, ${migliori.size} gare`);
  }
  return [...migliori.values()].map((m) => m.evento);
}

function valoreVero(
  reale: { casa: Record<string, number | null>; fuori: Record<string, number | null> },
  bersaglio: string,
  lato: Lato,
): number | null {
  const colonna = COLONNA[bersaglio];
  if (colonna === undefined) return null;
  const c = reale.casa[colonna] ?? null;
  const f = reale.fuori[colonna] ?? null;
  if (lato === "casa") return c;
  if (lato === "trasferta") return f;
  return c === null || f === null ? null : c + f;
}

/** Atteso e calibrazione della scala, con gli stessi controlli di `quoteDellaGara`. */
function calibrataDi(bersaglio: ProiezioneDiGara, lato: Lato) {
  const artefatto = ARTEFATTI_DI_PRODUZIONE.get(bersaglio.target);
  if (artefatto === undefined) return null;
  if (bersaglio.casa.stato !== "prevista" || bersaglio.trasferta.stato !== "prevista") return null;
  if (lato === "totale") {
    const totale = bersaglio.totale;
    if (totale === null || totale.linee === null) return null;
    if (artefatto.totale === null || artefatto.totale === undefined) return null;
    return {
      atteso: totale.valoreAtteso,
      distribuzione: artefatto.totale.distribuzione,
      dispersione: artefatto.totale.dispersione,
    };
  }
  const parte = lato === "casa" ? bersaglio.casa : bersaglio.trasferta;
  if (bersaglio.linee[lato] === null) return null;
  return {
    atteso: parte.valoreAtteso,
    distribuzione: artefatto.calibration.distribuzione_intervallo,
    dispersione: artefatto.calibration.dispersione,
  };
}

async function lettureDi(riga: RigaDiGara, eventi: readonly EventoQuotato[]): Promise<readonly Lettura[]> {
  const evento = agganciaGara(riga.nome_casa, riga.nome_fuori, riga.kickoff, eventi);
  if (evento === null) return [];
  const proiezioni = await proiezioniDellaGara({
    homeTeamId: Number(riga.casa),
    awayTeamId: Number(riga.fuori),
    seasonId: Number(riga.stagione),
    refereeId: riga.arbitro === null ? null : Number(riga.arbitro),
    kickoff: riga.kickoff,
    homeCoachId: riga.allenatore_casa === null ? null : Number(riga.allenatore_casa),
    awayCoachId: riga.allenatore_fuori === null ? null : Number(riga.allenatore_fuori),
    roundNumber: riga.giornata === null ? null : Number(riga.giornata),
    roundName: null,
    isLocalDerby: riga.derby,
  });
  if (typeof proiezioni === "string") return [];
  const reale = await realeDellaGara(Number(riga.gara));
  if (reale === null) return [];

  const letture: Lettura[] = [];
  for (const bersaglio of proiezioni.bersagli) {
    for (const lato of ["casa", "trasferta", "totale"] as const) {
      const esiti = evento.linee.get(chiaveDiLinea(bersaglio.target, lato));
      if (esiti === undefined || esiti.length === 0) continue;
      const scala = calibrataDi(bersaglio, lato);
      if (scala === null) continue;
      const vero = valoreVero(reale, bersaglio.target, lato);
      if (vero === null) continue;
      const nostre = soglieDi(scala.atteso);
      for (const esito of esiti) {
        const sopra = probabilitaSopra(scala.distribuzione, scala.dispersione, scala.atteso, esito.soglia);
        if (sopra === null) continue;
        const probabilita = esito.verso === "Over" ? sopra : 1 - sopra;
        const altro = esiti.find((e) => e.soglia === esito.soglia && e.verso !== esito.verso)?.quota ?? null;
        const implicita = implicitaSoglia(esito.quota, altro);
        if (implicita === null) continue;
        const valore = Math.round((probabilita - implicita) * 100);
        const presa = vero === esito.soglia
          ? null
          : (esito.verso === "Over" ? vero > esito.soglia : vero < esito.soglia) ? 1 : 0;
        letture.push({
          gara: riga.gara,
          kickoff: riga.kickoff,
          bersaglio: bersaglio.target,
          lato,
          soglia: esito.soglia,
          verso: esito.verso,
          quota: esito.quota,
          dueLati: altro !== null,
          fuoriFinestra: esito.soglia < nostre[0] || esito.soglia > nostre[nostre.length - 1],
          probabilita,
          implicita,
          valore,
          presa,
          resa: presa === null ? 0 : presa === 1 ? esito.quota - 1 : -1,
        });
      }
    }
  }

  // I mercati dei gol, come la sezione Gol del dossier sul prezzo Fastbet (`voci-dei-gol.ts`):
  // il margine si toglie dentro il gruppo dello stesso banco.
  const gol = proiezioni.gol;
  if (gol !== null && riga.gol_casa !== null && riga.gol_fuori !== null) {
    const c = riga.gol_casa;
    const f = riga.gol_fuori;
    const g = evento.gol;
    const voce = (mercato: string, verso: string, soglia: number, prob: number,
      quota: number | null, gruppo: readonly (number | null)[], presa: 1 | 0 | null) => {
      if (quota === null) return;
      const implicita = implicitaInGruppo(quota, gruppo);
      if (implicita === null) return;
      letture.push({
        gara: riga.gara, kickoff: riga.kickoff, bersaglio: mercato, lato: "totale", soglia, verso,
        quota, dueLati: gruppo.every((q) => q !== null), fuoriFinestra: false,
        probabilita: prob, implicita, valore: Math.round((prob - implicita) * 100), presa,
        resa: presa === null ? 0 : presa === 1 ? quota - 1 : -1,
      });
    };
    const m = gol.mercati;
    if (g.esito !== null) {
      const q = [g.esito.uno, g.esito.x, g.esito.due];
      const vero = c > f ? 0 : c === f ? 1 : 2;
      [["1", m.esito.uno], ["X", m.esito.x], ["2", m.esito.due]].forEach(([e, p], i) =>
        voce("gol-1x2", e as string, 0, p as number, q[i], q, vero === i ? 1 : 0));
    }
    const ggq = [g.gol, g.noGol];
    const entrambe = c > 0 && f > 0;
    voce("gol-gg-ng", "Sì", 0, m.gg, g.gol, ggq, entrambe ? 1 : 0);
    voce("gol-gg-ng", "No", 0, m.ng, g.noGol, ggq, entrambe ? 0 : 1);
    const p = distribuzioniDeiGol(m.casa.attesi, m.trasferta.attesi);
    for (const linea of new Set(g.overUnder.map((q) => q.soglia))) {
      const sopra = quotaFra(p.totale, Math.ceil(linea), p.totale.length - 1);
      const qOver = g.overUnder.find((q) => q.soglia === linea && q.verso === "Over")?.quota ?? null;
      const qUnder = g.overUnder.find((q) => q.soglia === linea && q.verso === "Under")?.quota ?? null;
      const tot = c + f;
      const presa = (over: boolean) => (tot === linea ? null : (over ? tot > linea : tot < linea) ? 1 : 0);
      voce("gol-over-under", "Over", linea, sopra, qOver, [qOver, qUnder], presa(true));
      voce("gol-over-under", "Under", linea, 1 - sopra, qUnder, [qOver, qUnder], presa(false));
    }
  }
  return letture;
}

const FASCE: readonly { readonly nome: string; readonly da: number; readonly a: number }[] = [
  { nome: "<= -11", da: -Infinity, a: -11 },
  { nome: "-10..-6", da: -10, a: -6 },
  { nome: "-5..0", da: -5, a: 0 },
  { nome: "+1..+5", da: 1, a: 5 },
  { nome: "+6..+10", da: 6, a: 10 },
  { nome: "+11..+15", da: 11, a: TETTO_VALORE },
  { nome: "> tetto", da: TETTO_VALORE + 1, a: Infinity },
];

function wilson(prese: number, n: number): [number, number] {
  if (n === 0) return [NaN, NaN];
  const z = 1.96;
  const p = prese / n;
  const centro = (p + z * z / (2 * n)) / (1 + z * z / n);
  const mezzo = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n);
  return [centro - mezzo, centro + mezzo];
}

/** Generatore deterministico: lo stesso archivio da' lo stesso intervallo. */
function casuale(seme: number): () => number {
  let s = seme >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Resa media per puntata, intervallo al 95% ricampionando le gare. */
function resaConIntervallo(letture: readonly Lettura[]): { resa: number; basso: number; alto: number } {
  const perGara = new Map<string, { somma: number; n: number }>();
  for (const l of letture) {
    const g = perGara.get(l.gara) ?? { somma: 0, n: 0 };
    g.somma += l.resa;
    g.n += 1;
    perGara.set(l.gara, g);
  }
  const gare = [...perGara.values()];
  const totale = gare.reduce((s, g) => s + g.somma, 0) / gare.reduce((s, g) => s + g.n, 0);
  const caso = casuale(20261006);
  const medie: number[] = [];
  for (let giro = 0; giro < 2000; giro += 1) {
    let somma = 0;
    let n = 0;
    for (let i = 0; i < gare.length; i += 1) {
      const g = gare[Math.floor(caso() * gare.length)];
      somma += g.somma;
      n += g.n;
    }
    medie.push(somma / n);
  }
  medie.sort((a, b) => a - b);
  return { resa: totale, basso: medie[Math.floor(0.025 * medie.length)], alto: medie[Math.floor(0.975 * medie.length)] };
}

const percento = (v: number) => Number((v * 100).toFixed(1));

function tabella(letture: readonly Lettura[]) {
  return FASCE.map((f) => {
    const dentro = letture.filter((l) => l.valore >= f.da && l.valore <= f.a);
    const decise = dentro.filter((l) => l.presa !== null);
    const prese = decise.filter((l) => l.presa === 1).length;
    const [basso, alto] = wilson(prese, decise.length);
    const resa = dentro.length === 0 ? null : resaConIntervallo(dentro);
    const media = (scegli: (l: Lettura) => number) =>
      decise.length === 0 ? null : percento(decise.reduce((s, l) => s + scegli(l), 0) / decise.length);
    return {
      fascia: f.nome,
      letture: dentro.length,
      gare: new Set(dentro.map((l) => l.gara)).size,
      restituite: dentro.length - decise.length,
      uscite: prese,
      frequenza: decise.length === 0 ? null : percento(prese / decise.length),
      frequenza_95: decise.length === 0 ? null : [percento(basso), percento(alto)],
      nostra: media((l) => l.probabilita),
      implicita: media((l) => l.implicita),
      quota_media: dentro.length === 0 ? null : Number((dentro.reduce((s, l) => s + l.quota, 0) / dentro.length).toFixed(2)),
      resa: resa === null ? null : percento(resa.resa),
      resa_95: resa === null ? null : [percento(resa.basso), percento(resa.alto)],
    };
  });
}

function stampa(titolo: string, righe: ReturnType<typeof tabella>): void {
  console.log(`\n${titolo}`);
  console.log("fascia     letture  gare  uscite  freq%  [IC95]        nostra% impl%  quota  resa%  [IC95]");
  for (const r of righe) {
    const ic = (v: number[] | null) => (v === null ? "-" : `[${v[0]}; ${v[1]}]`);
    console.log(
      `${r.fascia.padEnd(10)} ${String(r.letture).padStart(7)} ${String(r.gare).padStart(5)}`
      + ` ${String(r.uscite).padStart(7)} ${String(r.frequenza ?? "-").padStart(6)}  ${ic(r.frequenza_95).padEnd(13)}`
      + ` ${String(r.nostra ?? "-").padStart(6)} ${String(r.implicita ?? "-").padStart(6)}`
      + ` ${String(r.quota_media ?? "-").padStart(6)} ${String(r.resa ?? "-").padStart(6)}  ${ic(r.resa_95)}`,
    );
  }
}

async function main(): Promise<number> {
  const sql = connessione();
  if (sql === null) {
    console.error("serve IQSTATS_PROJECTION_DATABASE_URL");
    return 1;
  }
  const insieme = argomento("insieme", 8);
  const eventi = archivio();
  const primo = Math.min(...eventi.map((e) => e.istante).filter(Number.isFinite));

  const righe = await sql<RigaDiGara[]>`
    select g.source_id::text as gara,
           th.source_id::text as casa, ta.source_id::text as fuori,
           th.name as nome_casa, ta.name as nome_fuori,
           s.source_id::text as stagione,
           (select r.source_id from football.referees r where r.id = o.referee_id)::text as arbitro,
           to_char(o.kickoff_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS."000Z"') as kickoff,
           o.coach_source_id::text as allenatore_casa,
           o.opponent_coach_source_id::text as allenatore_fuori,
           o.round_number::text as giornata,
           o.is_derby as derby,
           -- Il punteggio in football.matches manca su 498 gare su 603 (8 ottobre 2026): l'osservazione
           -- di casa lo porta sempre, e dove ci sono entrambi coincidono.
           o.goals_for::int as gol_casa, o.goals_against::int as gol_fuori
    from football.team_match_observations o
    join football.matches g on g.id = o.match_id
    join football.teams th on th.id = o.team_id
    join football.teams ta on ta.id = o.opponent_id
    join football.seasons s on s.id = o.season_id
    where o.side = 'home' and o.kickoff_at >= ${new Date(primo - 86_400_000).toISOString()}
      and o.kickoff_at < now()
    order by o.kickoff_at
  `;

  const tutte: Lettura[] = [];
  let agganciate = 0;
  for (let inizio = 0; inizio < righe.length; inizio += insieme) {
    const lotto = righe.slice(inizio, inizio + insieme);
    const esiti = await Promise.all(lotto.map((r) => lettureDi(r, eventi).catch(() => [])));
    for (const letture of esiti) {
      if (letture.length > 0) agganciate += 1;
      tutte.push(...letture);
    }
    process.stdout.write(`\r${Math.min(inizio + insieme, righe.length)}/${righe.length} gare`);
  }
  process.stdout.write("\n");
  await sql.end();
  if (tutte.length === 0) {
    console.error("nessuna lettura: niente da misurare");
    return 1;
  }
  // Le letture una per una, per `consuntivo-valore-corretto.ts`: fuori da Git, sono MB.
  const dove = process.argv.indexOf("--letture");
  if (dove >= 0 && process.argv[dove + 1] !== undefined) {
    writeFileSync(process.argv[dove + 1], JSON.stringify(tutte), "utf8");
  }

  // Due periodi con lo stesso numero di gare, tagliati sul calcio d'inizio.
  // Le tabelle di sempre restano sulle sette famiglie; i gol hanno le loro, in fondo.
  const sonoGol = (l: Lettura) => l.bersaglio.startsWith("gol-");
  const deiGol = tutte.filter(sonoGol);
  const famiglie = tutte.filter((l) => !sonoGol(l));
  const giorni = [...new Set(famiglie.map((l) => `${l.kickoff}|${l.gara}`))].sort();
  const taglio = giorni[Math.floor(giorni.length / 2)].split("|")[0];
  const prima = famiglie.filter((l) => l.kickoff < taglio);
  const dopo = famiglie.filter((l) => l.kickoff >= taglio);
  const dentroFinestra = famiglie.filter((l) => !l.fuoriFinestra);

  const rapporto = {
    generato_il: new Date().toISOString(),
    gare_chiuse_nel_periodo: righe.length,
    gare_misurate: agganciate,
    letture: famiglie.length,
    taglio_dei_periodi: taglio,
    tutte: tabella(famiglie),
    periodo_1: tabella(prima),
    periodo_2: tabella(dopo),
    dentro_finestra: tabella(dentroFinestra),
    due_lati: tabella(famiglie.filter((l) => l.dueLati)),
    un_lato: tabella(famiglie.filter((l) => !l.dueLati)),
    gol: {
      letture: deiGol.length,
      tutte: tabella(deiGol),
      periodo_1: tabella(deiGol.filter((l) => l.kickoff < taglio)),
      periodo_2: tabella(deiGol.filter((l) => l.kickoff >= taglio)),
      per_mercato: Object.fromEntries([...new Set(deiGol.map((l) => l.bersaglio))]
        .map((m) => [m, tabella(deiGol.filter((l) => l.bersaglio === m))])),
    },
  };
  const uscita = path.join(import.meta.dirname, "..", "..", "..", "scripts", "projection",
    "dataset", "output", "consuntivo-valore.json");
  writeFileSync(uscita, `${JSON.stringify(rapporto, null, 2)}\n`, "utf8");

  console.log(`${righe.length} gare chiuse · ${agganciate} misurate · ${famiglie.length} letture · taglio ${taglio}`);
  stampa("TUTTE", rapporto.tutte);
  stampa(`PERIODO 1 (< ${taglio})`, rapporto.periodo_1);
  stampa(`PERIODO 2 (>= ${taglio})`, rapporto.periodo_2);
  stampa("DENTRO LA FINESTRA DELLE CINQUE", rapporto.dentro_finestra);
  stampa("DUE LATI (margine tolto)", rapporto.due_lati);
  stampa("UN LATO (1/quota)", rapporto.un_lato);
  stampa(`GOL (${deiGol.length} letture)`, rapporto.gol.tutte);
  stampa(`GOL PERIODO 1 (< ${taglio})`, rapporto.gol.periodo_1);
  stampa(`GOL PERIODO 2 (>= ${taglio})`, rapporto.gol.periodo_2);
  for (const [m, righeM] of Object.entries(rapporto.gol.per_mercato)) stampa(m.toUpperCase(), righeM);
  console.log(uscita);
  return 0;
}

process.exitCode = await main();
