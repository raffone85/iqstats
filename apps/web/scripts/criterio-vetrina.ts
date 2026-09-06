// Quale criterio puo' reggere una vetrina? Cinque regole d'ordinamento, misurate insieme
// sulle stesse gare chiuse.
//
// **Perche' esiste.** Il criterio di oggi - `|probabilita - base di lega| x affidabilita` -
// seleziona per costruzione gli scostamenti piu' grandi, e il 6 settembre 2026 si e' visto
// dove porta: sei letture su sette stavano sopra sia alla base di lega sia alla storia
// della squadra, e il consuntivo diceva 72,9% preso contro 81,6% promesso nella fascia dove
// la vetrina abita. La vetrina non si pubblica finche' un criterio non regge, e «regge»
// vuol dire una cosa sola: **quello che promette e quello che rende coincidono, fuori
// campione**.
//
// **Come si misura senza barare.** Le proiezioni si calcolano una volta per gara, con lo
// stesso taglio temporale del consuntivo: il motore legge solo cio' che esisteva prima del
// calcio d'inizio. Sulle stesse candidate si applicano i cinque criteri, quindi il confronto
// e' fra regole diverse sullo stesso materiale e non fra campioni diversi.
//
// **Due metri, e servono tutti e due.** «tutte» conta ogni lettura che il criterio avrebbe
// mostrato; «prima» conta solo quella in cima a ogni gara, che e' cio' che finisce davvero
// in vetrina. Un criterio puo' reggere sulle molte e sbagliare proprio sulla prima.
//
// Uso, con il livello dati locale in ascolto:
//   IQSTATS_PROJECTION_DATABASE_URL=... node --conditions=react-server \
//     --import ./test/risolutore-ts.mjs --experimental-strip-types \
//     scripts/criterio-vetrina.ts [--gare 400] [--insieme 8]
import { writeFileSync } from "node:fs";
import path from "node:path";

import { baseDiLega, baseDiSquadra } from "../src/server/iqstats/base-di-lega.ts";
import { connessione } from "../src/server/iqstats/lettura.ts";
import { proiezioniDellaGara } from "../src/server/iqstats/projection-runtime.ts";
import { arricchisci, candidateDiGara } from "../src/server/iqstats/projection/letture-forti.ts";
import type { LetturaForte } from "../src/server/iqstats/projection/letture-forti.ts";
import { realeDellaGara } from "../src/server/iqstats/verifica.ts";

const FASCE = [
  { da: 0.5, a: 0.6, nome: "50-60%" },
  { da: 0.6, a: 0.7, nome: "60-70%" },
  { da: 0.7, a: 0.8, nome: "70-80%" },
  { da: 0.8, a: 0.9, nome: "80-90%" },
  { da: 0.9, a: 1.01, nome: "90-100%" },
] as const;

const COLONNA: Readonly<Record<string, string>> = {
  total_shots: "total_shots",
  shots_on_target: "shots_on_target",
  corner_kicks: "corner_kicks",
  fouls: "fouls",
  yellow_cards: "yellow_cards",
  offsides: "offsides",
  goalkeeper_saves: "goalkeeper_saves",
};

/** Quante letture per gara, come la vetrina di produzione. */
const QUANTE = 4;
/** La forza minima del criterio di oggi, ripetuta qui perche' e' un parametro del criterio. */
const FORZA_MINIMA = 0.04;

/**
 * Quanto una lettura puo' scostarsi dalla storia della squadra restando credibile.
 *
 * Venti punti non sono una scelta di gusto: sulle sette letture del 6 settembre le due che
 * hanno fatto bocciare la vetrina stavano a quaranta e a quarantasette punti dalla frequenza
 * delle loro squadre.
 */
const SCOSTAMENTO_MASSIMO = 0.2;

/** Quanto la squadra deve avere giocato perche' la sua frequenza faccia da controllo. */
const GARE_MINIME_DI_SQUADRA = 8;

/** La frequenza storica della squadra su quella linea, o `null` se il campione non regge. */
function frequenzaDiSquadra(lettura: LetturaForte): number | null {
  const utili = lettura.squadre.filter((s) => s.gare >= GARE_MINIME_DI_SQUADRA);
  if (utili.length === 0) return null;
  return utili.reduce((somma, s) => somma + s.quota / 100, 0) / utili.length;
}

interface Criterio {
  readonly nome: string;
  readonly spiegazione: string;
  readonly scegli: (letture: readonly LetturaForte[]) => readonly LetturaForte[];
}

function unaPerBersaglio(letture: readonly LetturaForte[]): readonly LetturaForte[] {
  const visti = new Set<string>();
  return letture
    .filter((l) => {
      if (visti.has(l.bersaglio)) return false;
      visti.add(l.bersaglio);
      return true;
    })
    .slice(0, QUANTE);
}

const CRITERI: readonly Criterio[] = [
  {
    nome: "forza",
    spiegazione: "quello di produzione: |probabilita - base di lega| x affidabilita",
    scegli: (letture) =>
      unaPerBersaglio(
        letture
          .filter((l) => l.forza >= FORZA_MINIMA)
          .slice()
          .sort((a, b) => (b.forza - a.forza) || (b.affidabilita - a.affidabilita)),
      ),
  },
  {
    nome: "probabilita",
    spiegazione: "la probabilita' piu' alta, senza guardare quanto si scosta dalla lega",
    scegli: (letture) =>
      unaPerBersaglio(
        letture.slice().sort((a, b) => (b.probabilita - a.probabilita) || (b.affidabilita - a.affidabilita)),
      ),
  },
  {
    nome: "probabilita-per-affidabilita",
    spiegazione: "probabilita' x affidabilita': alta e sul bersaglio che sbaglia meno",
    scegli: (letture) =>
      unaPerBersaglio(
        letture
          .slice()
          .sort((a, b) => (b.probabilita * b.affidabilita) - (a.probabilita * a.affidabilita)),
      ),
  },
  {
    nome: "fascia-tarata",
    spiegazione: "solo fino all'80%, dove il consuntivo dice che promesso e reso coincidono",
    scegli: (letture) =>
      unaPerBersaglio(
        letture
          .filter((l) => l.probabilita <= 0.8)
          .slice()
          .sort((a, b) => (b.probabilita - a.probabilita) || (b.affidabilita - a.affidabilita)),
      ),
  },
  {
    nome: "concorde-con-la-squadra",
    spiegazione:
      "scarta chi si scosta oltre venti punti dalla frequenza storica delle squadre in campo, poi ordina per probabilita'",
    scegli: (letture) =>
      unaPerBersaglio(
        letture
          .filter((l) => {
            const storia = frequenzaDiSquadra(l);
            return storia === null ? false : Math.abs(l.probabilita - storia) <= SCOSTAMENTO_MASSIMO;
          })
          .slice()
          .sort((a, b) => (b.probabilita - a.probabilita) || (b.affidabilita - a.affidabilita)),
      ),
  },
];

interface RigaDiGara {
  readonly gara: string;
  readonly casa: string;
  readonly fuori: string;
  readonly stagione: string;
  readonly competizione: string;
  readonly arbitro: string | null;
  readonly kickoff: string;
  readonly allenatore_casa: string | null;
  readonly allenatore_fuori: string | null;
  readonly giornata: string | null;
  readonly derby: boolean | null;
}

interface Esito {
  readonly criterio: string;
  readonly probabilita: number;
  readonly presa: boolean;
  /** Vero solo per la lettura in cima alla gara: e' quella che finirebbe in vetrina. */
  readonly prima: boolean;
  /**
   * Quanto la lettura si scosta dalla frequenza storica delle squadre in campo, in punti.
   * `null` dove nessuna delle due ha campione. E' il controllo che ha bocciato la vetrina
   * il 6 settembre: sei letture su sette stavano sopra sia alla lega sia alla squadra.
   */
  readonly scostamentoDallaSquadra: number | null;
  /** Vero quando la lettura sta sopra sia alla base di lega sia alla storia della squadra. */
  readonly sopraEntrambe: boolean;
}

function argomento(nome: string, difetto: number): number {
  const indice = process.argv.indexOf("--" + nome);
  if (indice < 0) return difetto;
  const valore = Number(process.argv[indice + 1]);
  return Number.isFinite(valore) && valore > 0 ? valore : difetto;
}

function valoreVero(
  reale: { casa: Record<string, number | null>; fuori: Record<string, number | null> },
  bersaglio: string,
  lato: "casa" | "trasferta" | "totale",
): number | null {
  const colonna = COLONNA[bersaglio];
  if (colonna === undefined) return null;
  const c = reale.casa[colonna] ?? null;
  const f = reale.fuori[colonna] ?? null;
  if (lato === "casa") return c;
  if (lato === "trasferta") return f;
  return c === null || f === null ? null : c + f;
}

async function esitiDi(riga: RigaDiGara): Promise<readonly Esito[]> {
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

  const { candidate } = candidateDiGara(proiezioni.bersagli);
  if (candidate.length === 0) return [];
  const richieste = candidate.map((c) => ({
    target: c.bersaglio, lato: c.lato, soglia: c.soglia, verso: c.verso,
  }));
  const [basi, basiCasa, basiFuori, reale] = await Promise.all([
    baseDiLega(Number(riga.competizione), Number(riga.stagione), richieste),
    baseDiSquadra(Number(riga.competizione), Number(riga.casa), "home", richieste),
    baseDiSquadra(Number(riga.competizione), Number(riga.fuori), "away", richieste),
    realeDellaGara(Number(riga.gara)),
  ]);
  if (reale === null) return [];

  const arricchite = arricchisci(candidate, basi, basiCasa, basiFuori);
  const esiti: Esito[] = [];
  for (const criterio of CRITERI) {
    const scelte = criterio.scegli(arricchite);
    scelte.forEach((lettura, indice) => {
      const vero = valoreVero(reale, lettura.bersaglio, lettura.lato);
      if (vero === null) return;
      const sopra = vero > lettura.soglia;
      const storia = frequenzaDiSquadra(lettura);
      const lega = lettura.base === null ? null : lettura.base / 100;
      esiti.push({
        criterio: criterio.nome,
        probabilita: lettura.probabilita,
        presa: lettura.verso === "Over" ? sopra : !sopra,
        prima: indice === 0,
        scostamentoDallaSquadra: storia === null ? null : Math.abs(lettura.probabilita - storia),
        sopraEntrambe:
          storia !== null && lega !== null
          && lettura.probabilita > storia && lettura.probabilita > lega,
      });
    });
  }
  return esiti;
}

function conta(esiti: readonly Esito[]) {
  if (esiti.length === 0) return null;
  const prese = esiti.filter((e) => e.presa).length;
  const promessa = esiti.reduce((somma, e) => somma + e.probabilita, 0) / esiti.length;
  const scostamenti = esiti
    .map((e) => e.scostamentoDallaSquadra)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const mediana = scostamenti.length === 0 ? null
    : scostamenti[Math.floor(scostamenti.length / 2)];
  return {
    letture: esiti.length,
    prese,
    frequenza_osservata: Number((prese / esiti.length).toFixed(4)),
    probabilita_promessa: Number(promessa.toFixed(4)),
    scarto: Number((prese / esiti.length - promessa).toFixed(4)),
    // Il controllo del 6 settembre, contato invece che guardato a occhio.
    sopra_lega_e_squadra: Number(
      (esiti.filter((e) => e.sopraEntrambe).length / esiti.length).toFixed(4),
    ),
    scostamento_mediano_dalla_squadra: mediana === null ? null : Number(mediana.toFixed(4)),
    oltre_quaranta_punti_dalla_squadra: Number(
      (scostamenti.filter((v) => v > 0.4).length / Math.max(scostamenti.length, 1)).toFixed(4),
    ),
  };
}

async function main(): Promise<number> {
  const sql = connessione();
  if (sql === null) {
    console.error("serve IQSTATS_PROJECTION_DATABASE_URL");
    return 1;
  }
  const quante = argomento("gare", 400);
  const insieme = argomento("insieme", 8);

  const righe = await sql<RigaDiGara[]>`
    select g.source_id::text as gara,
           th.source_id::text as casa, ta.source_id::text as fuori,
           s.source_id::text as stagione, c.source_id::text as competizione,
           o.referee_id::text as arbitro,
           to_char(o.kickoff_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS."000Z"') as kickoff,
           o.coach_source_id::text as allenatore_casa,
           o.opponent_coach_source_id::text as allenatore_fuori,
           o.round_number::text as giornata,
           o.is_derby as derby
    from football.team_match_observations o
    join football.matches g on g.id = o.match_id
    join football.teams th on th.id = o.team_id
    join football.teams ta on ta.id = o.opponent_id
    join football.seasons s on s.id = o.season_id
    join football.competitions c on c.id = o.competition_id
    where o.side = 'home'
    order by o.kickoff_at desc
    limit ${quante}
  `;

  const tutti: Esito[] = [];
  for (let inizio = 0; inizio < righe.length; inizio += insieme) {
    const lotto = righe.slice(inizio, inizio + insieme);
    const esiti = await Promise.all(lotto.map((r) => esitiDi(r).catch(() => [])));
    for (const gruppo of esiti) tutti.push(...gruppo);
    process.stdout.write(`\r${Math.min(inizio + insieme, righe.length)}/${righe.length} gare`);
  }
  process.stdout.write("\n");

  const perCriterio = CRITERI.map((criterio) => {
    const suoi = tutti.filter((e) => e.criterio === criterio.nome);
    return {
      criterio: criterio.nome,
      spiegazione: criterio.spiegazione,
      tutte: conta(suoi),
      in_vetrina: conta(suoi.filter((e) => e.prima)),
      per_fascia: FASCE.map((f) => ({
        fascia: f.nome,
        ...conta(suoi.filter((e) => e.probabilita >= f.da && e.probabilita < f.a)),
      })).filter((v) => v.letture !== undefined),
    };
  });

  const rapporto = {
    schema: "criterio-vetrina/1",
    calcolato_il: new Date().toISOString(),
    gare_chieste: quante,
    come_e_stato_misurato: (
      "una sola passata sulle gare chiuse: le proiezioni si calcolano una volta e i cinque "
      + "criteri scelgono sulle stesse candidate, quindi il confronto e' fra regole e non fra "
      + "campioni. «tutte» conta ogni lettura mostrata, «in_vetrina» solo quella in cima a "
      + "ogni gara, che e' cio' che la vetrina pubblicherebbe."
    ),
    criteri: perCriterio,
  };

  const uscita = path.resolve(process.cwd(), "..", "..", "scripts", "projection", "dataset", "output", "criterio-vetrina.json");
  writeFileSync(uscita, JSON.stringify(rapporto, null, 2) + "\n", "utf8");

  console.log("\ncriterio                        | tutte: preso/promesso        | in vetrina: preso/promesso");
  for (const voce of perCriterio) {
    const t = voce.tutte;
    const v = voce.in_vetrina;
    const scrivi = (c: typeof t) => c === null ? "nessuna lettura        "
      : `${(c.frequenza_osservata * 100).toFixed(1)}% su ${(c.probabilita_promessa * 100).toFixed(1)}% (${c.letture})`.padEnd(24);
    console.log(`${voce.criterio.padEnd(31)} | ${scrivi(t)} | ${scrivi(v)}`);
  }
  console.log(`\nrapporto in ${uscita}`);
  return 0;
}

process.exitCode = await main();
