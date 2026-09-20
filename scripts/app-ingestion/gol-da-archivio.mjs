// I gol per giocatore, dall'archivio delle statistiche di gara al livello dati.
//
// **Nessuna chiamata alla fonte.** Le righe stanno gia' in
// `scripts/projection/harvest/data/player-stats/`, una cartella per blocco e un file per
// gara, raccolte per il motore: qui si prende il solo campo `goals`, che la tavola non ha.
//
// **Si aggiorna, non si inserisce.** Una riga per giocatore-gara esiste gia' in
// `football.player_match_observations`; questo script le mette accanto i gol. Le gare
// dell'archivio che il livello dati non ha restano fuori, e si contano.
//
// **Zero e assenza non sono la stessa cosa.** Un convocato che non ha segnato ha `goals`
// zero nell'archivio, ed e' un fatto: si scrive. Una gara che l'archivio non copre lascia
// `null`, e chi legge dichiara che non lo sa.
//
// **Cosa esce:** un solo file SQL, dati compresi, idempotente, da dare a psql.
//
//   node scripts/app-ingestion/gol-da-archivio.mjs
//   psql "$URL" -v ON_ERROR_STOP=1 -f scripts/app-ingestion/output/gol-giocatori.sql

import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARCHIVIO = path.join(RADICE, "scripts", "projection", "harvest", "data", "player-stats");
const USCITA = path.join(RADICE, "scripts", "app-ingestion", "output", "gol-giocatori.sql");

const TESTA = `-- Generato da scripts/app-ingestion/gol-da-archivio.mjs. Non modificare a mano.
--
-- Rieseguibile: riscrive lo stesso valore sulle stesse righe.

begin;

create temporary table gol_in_arrivo (
  event_id bigint not null,
  player_source_id bigint not null,
  goals smallint not null
) on commit drop;

insert into gol_in_arrivo (event_id, player_source_id, goals) values
`;

const CODA = `
create index on gol_in_arrivo (event_id, player_source_id);

update football.player_match_observations o
set goals = a.goals
from gol_in_arrivo a
join football.matches m on m.source_id = a.event_id
where o.match_id = m.id
  and o.player_source_id = a.player_source_id
  and (o.goals is distinct from a.goals);

commit;
`;

await mkdir(path.dirname(USCITA), { recursive: true });
const file = createWriteStream(USCITA, { encoding: "utf8" });
file.write(TESTA);

let gare = 0;
let illeggibili = 0;
let righe = 0;
let gol = 0;
let prima = true;
for (const blocco of await readdir(ARCHIVIO)) {
  const cartella = path.join(ARCHIVIO, blocco);
  let voci;
  try {
    voci = await readdir(cartella);
  } catch {
    continue;
  }
  for (const voce of voci) {
    if (!voce.endsWith(".json")) continue;
    let gara;
    try {
      gara = JSON.parse(await readFile(path.join(cartella, voce), "utf8"));
    } catch {
      illeggibili += 1;
      continue;
    }
    const evento = Number(gara?.event_id);
    if (!Number.isInteger(evento) || evento <= 0) continue;
    gare += 1;
    for (const riga of gara.player_stats ?? []) {
      const giocatore = Number(riga?.player_id);
      const segnati = Number(riga?.goals);
      // Un campo assente o non numerico non diventa zero: quella riga non si scrive.
      if (!Number.isInteger(giocatore) || giocatore <= 0) continue;
      if (!Number.isInteger(segnati) || segnati < 0 || segnati > 20) continue;
      file.write(`${prima ? "" : ",\n"}(${evento}, ${giocatore}, ${segnati})`);
      prima = false;
      righe += 1;
      gol += segnati;
    }
  }
}
file.write(";\n");
file.write(CODA);
await new Promise((risolvi) => file.end(risolvi));

console.log(
  `${righe} righe da ${gare} gare, ${gol} gol`
  + (illeggibili > 0 ? `, ${illeggibili} file illeggibili` : "")
  + `\n${USCITA}`,
);
