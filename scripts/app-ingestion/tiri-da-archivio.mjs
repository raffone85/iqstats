// La forma delle conclusioni, dal dataset del motore al livello dati.
//
// **Nessuna chiamata alla fonte e nessuna rilettura dell'archivio.** A differenza di
// `tempi-da-archivio.mjs` e `assetto-da-archivio.mjs`, qui il lavoro pesante e' gia'
// stato fatto: `scripts/projection/dataset/build_shots.py` ha letto le mappe dei tiri
// e prodotto `tiri.csv` - 19.739 righe squadra-gara da 255.156 tiri. Questo script
// traduce quel file in SQL, e basta.
//
// **Cosa esce:** un solo file SQL, dati compresi, da dare a psql. Porta gli
// identificativi della fonte; la traduzione in identificativi interni la fa l'innesto
// su `football.matches` dentro quel file. E' idempotente: si puo' rieseguire.
//
// **Un campo assente resta vuoto, non diventa zero.** Le quote nulle nel CSV arrivano
// qui come `null`: una squadra che in quella gara non ha tirato non ha una quota di
// conclusioni in area pari a zero, non ce l'ha proprio.
//
//   node scripts/app-ingestion/tiri-da-archivio.mjs
//   psql "$URL" -v ON_ERROR_STOP=1 -f scripts/app-ingestion/output/tiri.sql

import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SORGENTE = path.join(RADICE, "scripts", "projection", "dataset", "output", "tiri.csv");
const USCITA = path.join(RADICE, "scripts", "app-ingestion", "output", "tiri.sql");

/** Colonna del CSV, colonna della tavola, e se e' un intero. */
const COLONNE = [
  ["tiro_totali", "shots_total", true],
  ["tiro_quota_in_area", "share_in_box", false],
  ["tiro_distanza_media", "avg_distance", false],
  ["tiro_xg_per_tiro", "xg_per_shot", false],
  ["tiro_quota_qualita", "share_quality", false],
  ["tiro_quota_bloccati", "share_blocked", false],
  ["tiro_quota_da_fermo", "share_set_piece", false],
];

const TESTA = `-- Generato da scripts/app-ingestion/tiri-da-archivio.mjs. Non modificare a mano.
--
-- Le gare che non stanno in football.matches restano fuori: l'archivio del motore e'
-- piu' largo del livello dati dell'applicazione, e un innesto interno le scarta invece
-- di inventare una gara.

begin;

create temporary table tiri_in_arrivo (
  event_id bigint not null,
  lato text not null,
${COLONNE.map(([, sql, intero]) => `  ${sql} ${intero ? "smallint" : "numeric"}`).join(",\n")}
) on commit drop;

insert into tiri_in_arrivo (event_id, lato, ${COLONNE.map(([, s]) => s).join(", ")}) values
`;

const CODA = `
insert into football.team_match_shots (
  match_id, team_id, kickoff_at, ${COLONNE.map(([, s]) => s).join(", ")}
)
select m.id,
       case a.lato when 'home' then m.home_team_id else m.away_team_id end,
       m.kickoff_at,
       ${COLONNE.map(([, s]) => `a.${s}`).join(",\n       ")}
from tiri_in_arrivo a
join football.matches m on m.source_id = a.event_id
where a.lato in ('home', 'away')
  -- Una riga senza tiri non descrive da dove tira nessuno: resta fuori.
  and a.shots_total > 0
on conflict (match_id, team_id) do update set
  kickoff_at = excluded.kickoff_at,
  ${COLONNE.map(([, s]) => `${s} = excluded.${s}`).join(",\n  ")},
  synced_at = now();

commit;
`;

/** Il valore per l'SQL: vuoto e non numerico diventano `null`, mai zero. */
function valore(grezzo, intero) {
  if (grezzo === undefined || grezzo === "" || grezzo === "None") return "null";
  const n = Number(grezzo);
  if (!Number.isFinite(n)) return "null";
  return intero ? String(Math.round(n)) : n.toFixed(4);
}

const testo = await readFile(SORGENTE, "utf8");
const righe = testo.split(/\r?\n/).filter((r) => r.length > 0);
const intestazione = righe[0].split(",");
const indice = Object.fromEntries(intestazione.map((nome, i) => [nome, i]));

await mkdir(path.dirname(USCITA), { recursive: true });
const fuori = createWriteStream(USCITA, { encoding: "utf8" });
fuori.write(TESTA);

let scritte = 0;
for (let i = 1; i < righe.length; i++) {
  const campi = righe[i].split(",");
  const evento = campi[indice.event_id];
  const lato = campi[indice.lato];
  if (evento === undefined || (lato !== "home" && lato !== "away")) continue;
  const valori = COLONNE.map(([csv, , intero]) => valore(campi[indice[csv]], intero));
  fuori.write(`${scritte === 0 ? "" : ",\n"}(${evento}, '${lato}', ${valori.join(", ")})`);
  scritte += 1;
}

fuori.write(";\n");
fuori.write(CODA);
fuori.end();

console.log(`righe lette: ${righe.length - 1}`);
console.log(`righe scritte: ${scritte}`);
console.log(`uscita: ${path.relative(RADICE, USCITA)}`);
