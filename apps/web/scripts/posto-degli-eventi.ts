// Che posto occupano i mercati dei gol nell'elenco degli eventi piu' probabili.
//
// **Perche' esiste.** L'elenco si ordina per probabilita', e i mercati dei gol hanno un
// tetto all'80% come le famiglie: se le famiglie stanno sistematicamente sopra, i gol
// finiscono sempre sotto la soglia delle righe in vista e la sezione li mostra solo a chi
// apre la tendina. Misurato su una gara sola - Athletico, 12 settembre 2026 - le tre righe
// in vista erano tutte di famiglia e tutti e tre i mercati stavano dietro la porta. Una
// gara non e' una misura: questo script conta la composizione su molte.
//
// Non decide niente e non tocca l'app: conta dove cadono le righe con il criterio che c'e'.
//
// Uso, con il livello dati locale in ascolto:
//   IQSTATS_PROJECTION_DATABASE_URL=... node --conditions=react-server \
//     --import ./test/risolutore-ts.mjs --experimental-strip-types \
//     scripts/posto-degli-eventi.ts [--gare 300] [--insieme 8] [--vista 3]
import { baseDiLega, baseDiSquadra } from "../src/server/iqstats/base-di-lega.ts";
import { connessione } from "../src/server/iqstats/lettura.ts";
import { eventiProbabili } from "../src/server/iqstats/projection/eventi-probabili.ts";
import { candidateDiGara, ordinaLetture } from "../src/server/iqstats/projection/letture-forti.ts";
import { proiezioniDellaGara } from "../src/server/iqstats/projection-runtime.ts";

interface RigaDiGara {
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

function argomento(nome: string, difetto: number): number {
  const indice = process.argv.indexOf("--" + nome);
  if (indice < 0) return difetto;
  const valore = Number(process.argv[indice + 1]);
  return Number.isFinite(valore) && valore > 0 ? valore : difetto;
}

/** La composizione dell'elenco di una gara: quante righe, e quante di gol dove. */
async function composizioneDi(riga: RigaDiGara, vista: number): Promise<{
  readonly righe: number;
  readonly golInVista: number;
  readonly golDietro: number;
  readonly conMercati: boolean;
} | null> {
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
  if (typeof proiezioni === "string") return null;

  const { candidate, senzaMisura } = candidateDiGara(proiezioni.bersagli);
  const richieste = candidate.map((c) => ({
    target: c.bersaglio, lato: c.lato, soglia: c.soglia, verso: c.verso,
  }));
  const lega = Number(riga.competizione);
  const [basi, basiCasa, basiFuori] = candidate.length === 0
    ? [null, null, null]
    : await Promise.all([
      baseDiLega(lega, Number(riga.stagione), richieste),
      baseDiSquadra(lega, Number(riga.casa), "home", richieste),
      baseDiSquadra(lega, Number(riga.fuori), "away", richieste),
    ]);

  const forti = ordinaLetture(candidate, senzaMisura, basi, basiCasa, basiFuori);
  const mercati = proiezioni.gol?.mercati ?? null;
  const elenco = eventiProbabili(forti.letture, mercati);
  const diGol = (da: number, a: number) => elenco
    .slice(da, a)
    .filter((e) => e.da === "gol").length;

  return {
    righe: elenco.length,
    golInVista: diGol(0, vista),
    golDietro: diGol(vista, elenco.length),
    conMercati: mercati !== null,
  };
}

async function main(): Promise<number> {
  const sql = connessione();
  if (sql === null) {
    console.error("serve IQSTATS_PROJECTION_DATABASE_URL");
    return 1;
  }
  const quante = argomento("gare", 300);
  const insieme = argomento("insieme", 8);
  const vista = argomento("vista", 3);

  const righe = await sql<RigaDiGara[]>`
    select th.source_id::text as casa, ta.source_id::text as fuori,
           s.source_id::text as stagione, c.source_id::text as competizione,
           (select r.source_id from football.referees r where r.id = o.referee_id)::text as arbitro,
           to_char(o.kickoff_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS."000Z"') as kickoff,
           o.coach_source_id::text as allenatore_casa,
           o.opponent_coach_source_id::text as allenatore_fuori,
           o.round_number::text as giornata,
           o.is_derby as derby
    from football.team_match_observations o
    join football.teams th on th.id = o.team_id
    join football.teams ta on ta.id = o.opponent_id
    join football.seasons s on s.id = o.season_id
    join football.competitions c on c.id = o.competition_id
    where o.side = 'home'
    order by o.kickoff_at desc
    limit ${quante}
  `;

  let conElenco = 0;
  let conMercati = 0;
  let almenoUnGolInVista = 0;
  let soloFamiglieInVista = 0;
  let golSoloDietro = 0;
  const golInVista: number[] = [];

  for (let inizio = 0; inizio < righe.length; inizio += insieme) {
    const lotto = righe.slice(inizio, inizio + insieme);
    const esiti = await Promise.all(
      lotto.map((r) => composizioneDi(r, vista).catch(() => null)),
    );
    for (const esito of esiti) {
      if (esito === null || esito.righe === 0) continue;
      conElenco += 1;
      if (esito.conMercati) conMercati += 1;
      golInVista.push(esito.golInVista);
      if (esito.golInVista > 0) almenoUnGolInVista += 1;
      else {
        soloFamiglieInVista += 1;
        if (esito.golDietro > 0) golSoloDietro += 1;
      }
    }
    process.stdout.write(`\r${Math.min(inizio + insieme, righe.length)}/${righe.length} gare`);
  }
  process.stdout.write("\n");

  const pc = (n: number) => conElenco === 0 ? "0,0" : (n / conElenco * 100).toFixed(1).replace(".", ",");
  console.log(`\ngare con un elenco: ${conElenco} su ${righe.length}`);
  console.log(`di queste, con i mercati dei gol: ${conMercati} (${pc(conMercati)}%)`);
  console.log(`\ncon le prime ${vista} righe in vista:`);
  console.log(`  almeno un mercato dei gol in vista: ${almenoUnGolInVista} (${pc(almenoUnGolInVista)}%)`);
  console.log(`  solo famiglie in vista:             ${soloFamiglieInVista} (${pc(soloFamiglieInVista)}%)`);
  console.log(`  gol presenti ma tutti dietro:       ${golSoloDietro} (${pc(golSoloDietro)}%)`);
  const somma = golInVista.reduce((s, n) => s + n, 0);
  console.log(`  mercati dei gol in vista, in media:  ${(somma / Math.max(conElenco, 1)).toFixed(2).replace(".", ",")}`);
  return 0;
}

process.exitCode = await main();
