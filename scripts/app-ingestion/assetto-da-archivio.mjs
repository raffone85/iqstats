// L'assetto in campo e la pressione per fascia, dall'archivio locale al livello dati.
//
// **Nessuna chiamata alla fonte.** Legge le risposte `/events/{id}/stats/` gia' sul
// disco in `scripts/calibration/data/raw/{lega}/{gara}.json`. Il motore, che le ha
// raccolte, usa solo `stats.home` e `stats.away`: `average_positions`, `momentum` e
// `xg_per_minute` restano inutilizzati, e sono quelli che servono qui.
//
// **Cosa esce:** un solo file SQL, dati compresi, da dare a psql. Idempotente.
//
// **Il portiere non entra in nessuna misura di assetto**: la sua posizione dice dove si
// difende, non come la squadra sta in campo. Sotto otto giocatori di movimento la riga
// non si scrive: non e' una squadra, e' quello che la fonte ha visto.
//
//   node scripts/app-ingestion/assetto-da-archivio.mjs
//   psql "$URL" -v ON_ERROR_STOP=1 -f scripts/app-ingestion/output/assetto.sql

import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARCHIVIO = path.join(RADICE, "scripts", "calibration", "data", "raw");
const USCITA = path.join(RADICE, "scripts", "app-ingestion", "output", "assetto.sql");

/** Sotto questi giocatori di movimento l'assetto non si misura. */
const GIOCATORI_MINIMI = 8;

const TESTA = `-- Generato da scripts/app-ingestion/assetto-da-archivio.mjs. Non modificare a mano.
--
-- Le gare che non stanno in football.matches restano fuori: l'archivio del motore e'
-- piu' largo del livello dati, e un innesto interno le scarta invece di inventarle.

begin;

create temporary table assetto_in_arrivo (
  event_id bigint not null,
  side text not null,
  linea_difensiva numeric(5, 2),
  baricentro numeric(5, 2),
  ampiezza numeric(5, 2),
  profondita numeric(5, 2),
  giocatori smallint not null
) on commit drop;

create temporary table bande_in_arrivo (
  event_id bigint not null,
  side text not null,
  band smallint not null,
  pressione numeric(8, 2),
  expected_goals numeric(6, 3)
) on commit drop;

copy assetto_in_arrivo (event_id, side, linea_difensiva, baricentro, ampiezza, profondita, giocatori) from stdin with (format csv);
`;

const MEZZO = `\\.

copy bande_in_arrivo (event_id, side, band, pressione, expected_goals) from stdin with (format csv);
`;

const CODA = `\\.

insert into football.team_match_shape (
  match_id, team_id, kickoff_at, linea_difensiva, baricentro, ampiezza, profondita, giocatori
)
select m.id,
       case a.side when 'home' then m.home_team_id else m.away_team_id end,
       m.kickoff_at,
       a.linea_difensiva, a.baricentro, a.ampiezza, a.profondita, a.giocatori
from assetto_in_arrivo a
join football.matches m on m.source_id = a.event_id
on conflict (match_id, team_id) do update set
  kickoff_at = excluded.kickoff_at,
  linea_difensiva = excluded.linea_difensiva,
  baricentro = excluded.baricentro,
  ampiezza = excluded.ampiezza,
  profondita = excluded.profondita,
  giocatori = excluded.giocatori,
  synced_at = now();

insert into football.team_match_bands (
  match_id, team_id, kickoff_at, band, pressione, expected_goals
)
select m.id,
       case b.side when 'home' then m.home_team_id else m.away_team_id end,
       m.kickoff_at,
       b.band, b.pressione, b.expected_goals
from bande_in_arrivo b
join football.matches m on m.source_id = b.event_id
on conflict (match_id, team_id, band) do update set
  kickoff_at = excluded.kickoff_at,
  pressione = excluded.pressione,
  expected_goals = excluded.expected_goals,
  synced_at = now();

commit;

select
  (select count(*) from football.team_match_shape) as righe_assetto,
  (select count(distinct match_id) from football.team_match_shape) as gare_assetto,
  (select count(*) from football.team_match_bands) as righe_bande,
  (select count(distinct match_id) from football.team_match_bands) as gare_bande;
`;

/** La fascia di quindici minuti a cui appartiene un minuto. Il recupero sta nel finale. */
function fascia(minuto) {
  return Math.min(6, Math.max(1, Math.ceil(minuto / 15)));
}

function numero(valore) {
  return typeof valore === "number" && Number.isFinite(valore) ? valore : null;
}

function scrivi(valore, decimali) {
  return valore === null ? "" : valore.toFixed(decimali);
}

/** L'assetto di un lato, o `null` quando i giocatori di movimento non bastano. */
function assettoDi(giocatori) {
  const campo = giocatori.filter((g) => g && g.pos !== "G" && numero(g.x) !== null && numero(g.y) !== null);
  if (campo.length < GIOCATORI_MINIMI) return null;
  const mediaX = (righe) => righe.reduce((t, g) => t + g.x, 0) / righe.length;
  const difensori = campo.filter((g) => g.pos === "D");
  const attaccanti = campo.filter((g) => g.pos === "F");
  const ys = campo.map((g) => g.y);
  return {
    linea: difensori.length > 0 ? mediaX(difensori) : null,
    baricentro: mediaX(campo),
    ampiezza: Math.max(...ys) - Math.min(...ys),
    profondita: difensori.length > 0 && attaccanti.length > 0
      ? mediaX(attaccanti) - mediaX(difensori)
      : null,
    giocatori: campo.length,
  };
}

/**
 * Le sei fasce di una gara, per lato.
 *
 * La pressione della casa e' la somma dei valori positivi del momento, quella
 * dell'ospite la somma dei negativi cambiata di segno: il segno e' della casa, misurato.
 * I gol attesi arrivano da `xg_per_minute`, che li porta gia' separati per lato.
 */
function bandeDi(momentum, xgPerMinuto) {
  const vuote = () => Array.from({ length: 6 }, () => ({ pressione: 0, xg: 0, visto: false }));
  const casa = vuote();
  const fuori = vuote();

  if (Array.isArray(momentum)) {
    for (const p of momentum) {
      const m = numero(p?.m);
      const v = numero(p?.v);
      if (m === null || v === null) continue;
      const i = fascia(m) - 1;
      if (v >= 0) { casa[i].pressione += v; } else { fuori[i].pressione -= v; }
      casa[i].visto = true;
      fuori[i].visto = true;
    }
  }
  if (Array.isArray(xgPerMinuto)) {
    for (const p of xgPerMinuto) {
      const m = numero(p?.m);
      if (m === null) continue;
      const i = fascia(m) - 1;
      const h = numero(p?.xg_home);
      const a = numero(p?.xg_away);
      if (h !== null) { casa[i].xg += h; casa[i].visto = true; }
      if (a !== null) { fuori[i].xg += a; fuori[i].visto = true; }
    }
  }
  return { casa, fuori };
}

async function main() {
  await mkdir(path.dirname(USCITA), { recursive: true });
  const uscita = createWriteStream(USCITA, { encoding: "utf8" });
  uscita.write(TESTA);

  const bandeDaScrivere = [];
  let gare = 0;
  let conAssetto = 0;
  let conBande = 0;

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
      const eventId = nome.slice(0, -5);

      const posizioni = payload.average_positions;
      if (posizioni && Array.isArray(posizioni.home) && Array.isArray(posizioni.away)) {
        let scritto = false;
        for (const lato of ["home", "away"]) {
          const a = assettoDi(posizioni[lato]);
          if (a === null) continue;
          uscita.write([
            eventId, lato,
            scrivi(a.linea, 2), scrivi(a.baricentro, 2),
            scrivi(a.ampiezza, 2), scrivi(a.profondita, 2), String(a.giocatori),
          ].join(",") + "\n");
          scritto = true;
        }
        if (scritto) conAssetto += 1;
      }

      const { casa, fuori } = bandeDi(payload.momentum, payload.xg_per_minute);
      if (casa.some((b) => b.visto)) {
        conBande += 1;
        for (const [lato, fasce] of [["home", casa], ["away", fuori]]) {
          fasce.forEach((b, i) => {
            if (!b.visto) return;
            bandeDaScrivere.push([
              eventId, lato, String(i + 1), b.pressione.toFixed(2), b.xg.toFixed(3),
            ].join(","));
          });
        }
      }
    }
  }

  uscita.write(MEZZO);
  for (const riga of bandeDaScrivere) uscita.write(riga + "\n");
  uscita.write(CODA);
  await new Promise((risolvi) => uscita.end(risolvi));

  console.log(`gare lette: ${gare}`);
  console.log(`con assetto: ${conAssetto}`);
  console.log(`con fasce: ${conBande} (${bandeDaScrivere.length} righe)`);
  console.log(`scritto ${USCITA}`);
}

await main();
