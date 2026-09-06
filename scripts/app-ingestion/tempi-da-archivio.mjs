// I due tempi delle gare gia' archiviate, dall'archivio locale al livello dati.
//
// **Nessuna chiamata alla fonte.** Le risposte `/events/{id}/stats/` sono gia' sul
// disco in `scripts/calibration/data/raw/{lega}/{gara}.json`: le raccoglie la
// pipeline del motore, che pero' legge solo `stats.home` e `stats.away` e scarta
// `stats.first_half` e `stats.second_half`. Qui si prendono quei due blocchi.
//
// **Cosa esce:** un solo file SQL, dati compresi, da dare a psql. Porta gli
// identificativi della fonte; la traduzione in identificativi interni la fa
// l'innesto su `football.matches` dentro quel file, quindi nessuna corrispondenza
// viene indovinata qui. E' idempotente: si puo' rieseguire.
//
// **Un campo assente resta vuoto, non diventa zero.** Vale per tutte le metriche,
// e vale per i gol attesi quando la fonte dichiara di averli stimati.
//
//   node scripts/app-ingestion/tempi-da-archivio.mjs
//   psql "$URL" -v ON_ERROR_STOP=1 -f scripts/app-ingestion/output/tempi.sql

import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARCHIVIO = path.join(RADICE, "scripts", "calibration", "data", "raw");
const USCITA = path.join(RADICE, "scripts", "app-ingestion", "output", "tempi.sql");

const COLONNE = [
  "expected_goals",
  "total_shots",
  "shots_on_target",
  "corner_kicks",
  "fouls",
  "ball_possession",
];

const TESTA = `-- Generato da scripts/app-ingestion/tempi-da-archivio.mjs. Non modificare a mano.
--
-- Le gare che non stanno in football.matches restano fuori: l'archivio del motore
-- e' piu' largo del livello dati dell'applicazione, e un innesto interno le scarta
-- invece di inventare una gara.

begin;

create temporary table tempi_in_arrivo (
  event_id bigint not null,
  side text not null,
  half smallint not null,
  expected_goals numeric(6, 3),
  total_shots smallint,
  shots_on_target smallint,
  corner_kicks smallint,
  fouls smallint,
  ball_possession numeric(5, 2)
) on commit drop;

copy tempi_in_arrivo (event_id, side, half, ${COLONNE.join(", ")}) from stdin with (format csv);
`;

const CODA = `\\.

insert into football.team_match_halves (
  match_id, team_id, half, kickoff_at, ${COLONNE.join(", ")}
)
select
  m.id,
  case t.side when 'home' then m.home_team_id else m.away_team_id end,
  t.half,
  m.kickoff_at,
  ${COLONNE.map((c) => "t." + c).join(",\n  ")}
from tempi_in_arrivo t
join football.matches m on m.source_id = t.event_id
on conflict (match_id, team_id, half) do update set
  kickoff_at = excluded.kickoff_at,
  ${COLONNE.map((c) => c + " = excluded." + c).join(",\n  ")},
  synced_at = now();

commit;

select
  count(*) as righe,
  count(distinct match_id) as gare,
  count(expected_goals) as con_gol_attesi,
  count(fouls) as con_falli
from football.team_match_halves;
`;

/** Il numero, o vuoto: un campo che non c'e' non diventa zero. */
function numero(valore) {
  return typeof valore === "number" && Number.isFinite(valore) ? String(valore) : "";
}

function riga(eventId, lato, tempo, blocco, xgStimato) {
  return [
    eventId,
    lato,
    tempo,
    xgStimato ? "" : numero(blocco.expected_goals),
    numero(blocco.total_shots),
    numero(blocco.shots_on_target),
    numero(blocco.corner_kicks),
    numero(blocco.fouls),
    numero(blocco.ball_possession),
  ].join(",");
}

async function main() {
  await mkdir(path.dirname(USCITA), { recursive: true });
  const uscita = createWriteStream(USCITA, { encoding: "utf8" });
  uscita.write(TESTA);

  let gare = 0;
  let scritte = 0;
  let senzaTempi = 0;
  let stimate = 0;

  for (const lega of await readdir(ARCHIVIO)) {
    const cartella = path.join(ARCHIVIO, lega);
    if (!(await stat(cartella)).isDirectory()) continue;
    for (const nome of await readdir(cartella)) {
      if (!nome.endsWith(".json")) continue;
      gare += 1;
      let payload;
      try {
        payload = JSON.parse(await readFile(path.join(cartella, nome), "utf8"));
      } catch {
        continue;
      }
      const primo = payload?.stats?.first_half;
      const secondo = payload?.stats?.second_half;
      if (!primo?.home || !primo?.away || !secondo?.home || !secondo?.away) {
        senzaTempi += 1;
        continue;
      }
      const xgStimato = payload.xg_estimated === true;
      if (xgStimato) stimate += 1;
      const eventId = nome.slice(0, -5);
      for (const [tempo, blocco] of [[1, primo], [2, secondo]]) {
        for (const lato of ["home", "away"]) {
          uscita.write(riga(eventId, lato, tempo, blocco[lato], xgStimato) + "\n");
          scritte += 1;
        }
      }
    }
  }

  uscita.write(CODA);
  await new Promise((risolvi) => uscita.end(risolvi));
  console.log(`gare lette: ${gare}`);
  console.log(`senza i due tempi: ${senzaTempi}`);
  console.log(`con gol attesi stimati dalla fonte (lasciati vuoti): ${stimate}`);
  console.log(`righe scritte: ${scritte} in ${USCITA}`);
}

await main();
