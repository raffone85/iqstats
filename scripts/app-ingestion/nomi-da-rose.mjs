// I nomi dei giocatori, dalle rose gia' archiviate al livello dati.
//
// **Nessuna chiamata alla fonte.** Le 593 rose in `scripts/projection/harvest/data/squads/`
// sono state raccolte a luglio 2026 per il ruolo in campo, e portano gia' il nome di ogni
// giocatore. Questo script le legge e le traduce in SQL, e basta.
//
// **Il limite, dichiarato.** La rosa e' quella del giorno della raccolta: chi ha cambiato
// squadra o ha smesso non c'e'. Misurato il 20 settembre 2026 contro il livello dati:
// 16.399 dei 22.003 giocatori osservati, cioe' l'85,4% delle righe e il 96,1% di quelle
// delle ultime centoventi giornate. Per gli altri la tavola non ha una riga: l'assenza si
// dichiara in pagina, non si riempie con un segnaposto.
//
// **Cosa esce:** un solo file SQL, dati compresi, idempotente, da dare a psql.
//
//   node scripts/app-ingestion/nomi-da-rose.mjs
//   psql "$URL" -v ON_ERROR_STOP=1 -f scripts/app-ingestion/output/nomi-giocatori.sql

import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROSE = path.join(RADICE, "scripts", "projection", "harvest", "data", "squads");
const USCITA = path.join(RADICE, "scripts", "app-ingestion", "output", "nomi-giocatori.sql");

const TESTA = `-- Generato da scripts/app-ingestion/nomi-da-rose.mjs. Non modificare a mano.
--
-- Un nome che cambia sulla fonte vince su quello gia' scritto: l'ultima lettura e' la
-- piu' vicina alla realta'. Rieseguibile senza doppioni.

begin;

create temporary table nomi_in_arrivo (
  source_id bigint not null,
  name text not null
) on commit drop;

insert into nomi_in_arrivo (source_id, name) values
`;

const CODA = `
insert into football.players (source_id, name)
select distinct on (a.source_id) a.source_id, a.name
from nomi_in_arrivo a
where length(btrim(a.name)) > 0
order by a.source_id, a.name
on conflict (source_id) do update set
  name = excluded.name,
  synced_at = now();

commit;
`;

/** Apostrofi raddoppiati: i nomi veri hanno O'Brien e D'Ambrosio. */
function testo(valore) {
  return `'${valore.replace(/'/g, "''")}'`;
}

await mkdir(path.dirname(USCITA), { recursive: true });
const file = createWriteStream(USCITA, { encoding: "utf8" });
file.write(TESTA);

const nomi = new Map();
let rose = 0;
let illeggibili = 0;
for (const voce of await readdir(ROSE)) {
  if (!voce.endsWith(".json")) continue;
  let rosa;
  try {
    rosa = JSON.parse(await readFile(path.join(ROSE, voce), "utf8"));
  } catch {
    // Una rosa illeggibile si conta e si dichiara: non e' un giocatore in meno per caso.
    illeggibili += 1;
    continue;
  }
  rose += 1;
  for (const giocatore of rosa.players ?? []) {
    const id = Number(giocatore?.id);
    const nome = typeof giocatore?.name === "string" ? giocatore.name.trim() : "";
    if (!Number.isInteger(id) || id <= 0 || nome === "") continue;
    nomi.set(id, nome);
  }
}

const righe = [...nomi].map(([id, nome]) => `(${id}, ${testo(nome)})`);
file.write(righe.join(",\n"));
file.write(";\n");
file.write(CODA);
await new Promise((risolvi) => file.end(risolvi));

console.log(
  `${nomi.size} nomi da ${rose} rose`
  + (illeggibili > 0 ? `, ${illeggibili} rose illeggibili` : "")
  + `\n${USCITA}`,
);
