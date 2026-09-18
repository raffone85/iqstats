// Il consuntivo delle soglie: la calibrazione regge anche fuori dalle nostre cinque?
//
// **Perche' esiste.** Il motore costruisce cinque soglie attorno al proprio atteso, e il
// consigliato sceglie fra quelle. Il banco apre altre soglie, spesso piu' alte - per
// Sassuolo-Monza del 18 settembre 2026 i falli dell'ospite partivano da 11,5 mentre le
// nostre cinque si fermavano prima - e su quelle righe l'artefatto scrive
// `fuoriFinestra: true`, perche' la dispersione e' stata misurata sulle cinque e non
// altrove. Finche' non si sa se quella probabilita' regge, quelle linee restano fuori dal
// consigliato: un numero non verificato sarebbe un numero inventato.
//
// Questo script lo misura, senza toccare il modello. Per ogni gara chiusa ricostruisce la
// proiezione con le sole righe anteriori al calcio d'inizio - lo stesso taglio di
// `consuntivo-letture.ts` - e poi, per ogni bersaglio e per ogni lato, calcola la nostra
// probabilita' su una scala **allargata**: le cinque di sempre piu' quattro passi sotto e
// quattro sopra. Accanto mette cosa e' successo davvero.
//
// Il risultato dice, per distanza dalla finestra, quanto la promessa si scosta dalla
// frequenza vera. Se a un passo fuori lo scostamento e' quello di dentro, quella riga si
// puo' ammettere; dove lo scostamento cresce, si dichiara il limite e si resta fuori.
//
// Nessuna chiamata alla fonte: tutto viene dalle nostre righe.
//
// Uso, con il livello dati in ascolto:
//   IQSTATS_PROJECTION_DATABASE_URL=... node --conditions=react-server \
//     --import ./test/risolutore-ts.mjs --experimental-strip-types \
//     scripts/consuntivo-soglie.ts [--gare 400] [--insieme 8]
import { writeFileSync } from "node:fs";
import path from "node:path";

import { connessione } from "../src/server/iqstats/lettura.ts";
import { ARTEFATTI_DI_PRODUZIONE } from "../src/server/iqstats/projection-artefatti.ts";
import { proiezioniDellaGara } from "../src/server/iqstats/projection-runtime.ts";
import { type ProiezioneDiGara, soglieDi } from "../src/server/iqstats/projection/match.ts";
import type { DistribuzioneIntervallo } from "../src/server/iqstats/projection/artifact-schema.ts";
import { probabilitaSopra } from "../src/server/iqstats/projection/predictor.ts";
import { realeDellaGara } from "../src/server/iqstats/verifica.ts";

/** Quanti passi oltre la finestra si guarda, sotto e sopra. */
const PASSI_FUORI = 4;

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
  readonly stagione: string;
  readonly competizione: string;
  readonly arbitro: string | null;
  readonly kickoff: string;
  readonly allenatore_casa: string | null;
  readonly allenatore_fuori: string | null;
  readonly giornata: string | null;
  readonly derby: boolean | null;
}

type Lato = "casa" | "trasferta" | "totale";

interface Misura {
  readonly bersaglio: string;
  readonly lato: Lato;
  /** 0 = dentro le cinque; 1, 2, … = passi sopra la massima; -1, -2, … sotto la minima. */
  readonly passi: number;
  readonly probabilita: number;
  readonly presa: boolean;
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

/** L'atteso e la calibrazione di una scala, come le legge `quoteDellaGara`. */
function scalaDi(bersaglio: ProiezioneDiGara, lato: Lato): {
  readonly atteso: number;
  readonly distribuzione: DistribuzioneIntervallo;
  readonly dispersione: number;
} | null {
  const artefatto = ARTEFATTI_DI_PRODUZIONE.get(bersaglio.target);
  if (artefatto === undefined) return null;
  if (lato === "totale") {
    const totale = bersaglio.totale;
    if (totale === null || totale === undefined || totale.linee === null) return null;
    if (artefatto.totale === null || artefatto.totale === undefined) return null;
    return {
      atteso: totale.valoreAtteso,
      distribuzione: artefatto.totale.distribuzione,
      dispersione: artefatto.totale.dispersione,
    };
  }
  const parte = lato === "casa" ? bersaglio.casa : bersaglio.trasferta;
  if (parte.stato !== "prevista" || bersaglio.linee[lato] === null) return null;
  return {
    atteso: parte.valoreAtteso,
    distribuzione: artefatto.calibration.distribuzione_intervallo,
    dispersione: artefatto.calibration.dispersione,
  };
}

async function misureDi(riga: RigaDiGara): Promise<readonly Misura[]> {
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

  const misure: Misura[] = [];
  for (const bersaglio of proiezioni.bersagli) {
    for (const lato of ["casa", "trasferta", "totale"] as const) {
      const scala = scalaDi(bersaglio, lato);
      if (scala === null) continue;
      const vero = valoreVero(reale, bersaglio.target, lato);
      if (vero === null) continue;

      const nostre = soglieDi(scala.atteso);
      const minima = nostre[0];
      const massima = nostre[nostre.length - 1];
      for (let soglia = minima - PASSI_FUORI; soglia <= massima + PASSI_FUORI; soglia += 1) {
        // Sotto lo zero non c'e' niente da misurare: «Over -0,5» e' sempre vero.
        if (soglia <= 0) continue;
        const sopra = probabilitaSopra(scala.distribuzione, scala.dispersione, scala.atteso, soglia);
        if (sopra === null) continue;
        const passi = soglia < minima
          ? Math.round(soglia - minima)
          : soglia > massima ? Math.round(soglia - massima) : 0;
        // Si misura sempre il verso piu' probabile, come fa la pagina: sotto la meta' la
        // lettura sarebbe l'Under, e contarla come Over direbbe il contrario del vero.
        const over = sopra >= 0.5;
        misure.push({
          bersaglio: bersaglio.target,
          lato,
          passi,
          probabilita: over ? sopra : 1 - sopra,
          presa: over ? vero > soglia : vero < soglia,
        });
      }
    }
  }
  return misure;
}

function riepilogo(misure: readonly Misura[]): Record<string, unknown> {
  const gruppi = new Map<number, Misura[]>();
  for (const m of misure) {
    const chiave = m.passi;
    const gia = gruppi.get(chiave);
    if (gia === undefined) gruppi.set(chiave, [m]);
    else gia.push(m);
  }
  const righe = [...gruppi]
    .sort((a, b) => a[0] - b[0])
    .map(([passi, dentro]) => {
      const promessa = dentro.reduce((s, m) => s + m.probabilita, 0) / dentro.length;
      const frequenza = dentro.filter((m) => m.presa).length / dentro.length;
      // La fascia che il consigliato usa davvero: sotto la meta' non e' una lettura, e
      // sopra l'ottanta per cento il tetto la tiene fuori comunque.
      const inFascia = dentro.filter((m) => m.probabilita >= 0.5 && m.probabilita <= 0.8);
      const promessaFascia = inFascia.length === 0
        ? null
        : inFascia.reduce((s, m) => s + m.probabilita, 0) / inFascia.length;
      const frequenzaFascia = inFascia.length === 0
        ? null
        : inFascia.filter((m) => m.presa).length / inFascia.length;
      return {
        passi,
        letture: dentro.length,
        promessa: Number((promessa * 100).toFixed(1)),
        frequenza: Number((frequenza * 100).toFixed(1)),
        scarto: Number(((frequenza - promessa) * 100).toFixed(1)),
        letture_50_80: inFascia.length,
        promessa_50_80: promessaFascia === null ? null : Number((promessaFascia * 100).toFixed(1)),
        frequenza_50_80: frequenzaFascia === null ? null : Number((frequenzaFascia * 100).toFixed(1)),
        scarto_50_80: promessaFascia === null || frequenzaFascia === null
          ? null
          : Number(((frequenzaFascia - promessaFascia) * 100).toFixed(1)),
      };
    });
  return { righe };
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
           (select r.source_id from football.referees r where r.id = o.referee_id)::text as arbitro,
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

  const tutte: Misura[] = [];
  let gareLette = 0;
  for (let inizio = 0; inizio < righe.length; inizio += insieme) {
    const lotto = righe.slice(inizio, inizio + insieme);
    const esiti = await Promise.all(lotto.map(misureDi));
    for (const misure of esiti) {
      if (misure.length > 0) gareLette += 1;
      tutte.push(...misure);
    }
    console.log(`${Math.min(inizio + insieme, righe.length)}/${righe.length} gare`);
  }

  const perBersaglio: Record<string, unknown> = {};
  for (const bersaglio of new Set(tutte.map((m) => m.bersaglio))) {
    perBersaglio[bersaglio] = riepilogo(tutte.filter((m) => m.bersaglio === bersaglio));
  }
  const rapporto = {
    generato_il: new Date().toISOString(),
    gare_chieste: quante,
    gare_lette: gareLette,
    letture: tutte.length,
    passi_fuori: PASSI_FUORI,
    tutti: riepilogo(tutte),
    per_bersaglio: perBersaglio,
  };
  const uscita = path.join(import.meta.dirname, "..", "..", "..", "scripts", "projection",
    "dataset", "output", "consuntivo-soglie.json");
  writeFileSync(uscita, `${JSON.stringify(rapporto, null, 2)}\n`, "utf8");

  console.log(`\n${gareLette} gare · ${tutte.length} letture · passi fuori: ${PASSI_FUORI}`);
  console.log("passi  letture  promessa  frequenza  scarto | 50-80%: letture promessa frequenza scarto");
  for (const r of (rapporto.tutti as { righe: readonly Record<string, number | null>[] }).righe) {
    console.log(
      `${String(r.passi).padStart(4)}  ${String(r.letture).padStart(8)}`
      + `  ${String(r.promessa).padStart(7)}%  ${String(r.frequenza).padStart(8)}%`
      + `  ${String(r.scarto).padStart(6)} |`
      + `  ${String(r.letture_50_80).padStart(6)}  ${String(r.promessa_50_80).padStart(6)}%`
      + `  ${String(r.frequenza_50_80).padStart(7)}%  ${String(r.scarto_50_80).padStart(5)}`,
    );
  }
  console.log(uscita);
  await sql.end();
  return 0;
}

process.exitCode = await main();
