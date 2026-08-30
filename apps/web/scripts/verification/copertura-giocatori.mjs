// Copertura dei dati per giocatore alla fonte. Solo lettura, nessuna scrittura.
// Uso, da apps/web: node scripts/verification/copertura-giocatori.mjs <giorni indietro> <gare per giorno>
//
// Misura, per un campione di gare finite, quanti campi statistici per giocatore portano
// davvero un valore. Un campo presente e sempre a zero non e' un campo coperto: e' un buco
// che sembra un dato, ed e' esattamente cio' che il criterio del piano vuole scoprire prima
// di costruire la sezione.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const testo = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
for (const riga of testo.split(/\r?\n/)) {
  const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m || process.env[m[1]]) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const token = (process.env.IQSTATS_PROVIDER_TOKEN ?? process.env.BSD_API_TOKEN ?? "").trim();
const base = (process.env.IQSTATS_PROVIDER_BASE_URL ?? process.env.BSD_API_BASE_URL ?? "https://sports.bzzoiro.com/api/v2/").trim();
if (!token) throw new Error("nessun token della fonte");
const origine = new URL(base).origin;

const GIORNI = Number(process.argv[2] ?? 5);
const PER_GIORNO = Number(process.argv[3] ?? 8);

async function chiedi(path) {
  const r = await fetch(origine + path, { headers: { Authorization: `Token ${token}` } });
  if (!r.ok) return null;
  return r.json();
}

function giornoIndietro(n) {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// I campi che contano davvero per una scheda giocatore, separati dagli identificativi.
const IDENTIFICATIVI = new Set(["id", "player_id", "event_id", "team_id"]);

// I nomi delle leghe arrivano da un indice a parte: l'evento porta solo league_id.
const indice = new Map();
{
  const l = await chiedi('/api/v2/leagues/?limit=500&offset=0');
  for (const v of (l?.results ?? [])) indice.set(v.id, v.name ?? String(v.id));
}
const perLega = new Map();
let gareViste = 0;
let righeTotali = 0;
let righeConMinuti = 0;
const campiConValore = new Map();
const campiPresenti = new Set();

for (let g = 1; g <= GIORNI; g += 1) {
  const giorno = giornoIndietro(g);
  const elenco = await chiedi(`/api/v2/events/?date=${giorno}&limit=200&offset=0`);
  const gare = (elenco?.results ?? []).filter((e) => (e.status ?? e.status_type) === "finished");
  const campione = gare.slice(0, PER_GIORNO);
  for (const gara of campione) {
    const lega = indice.get(gara.league_id) ?? ("lega " + gara.league_id);
    const stat = await chiedi(`/api/v2/events/${gara.id}/player-stats/`);
    const righe = stat?.results ?? stat?.player_stats ?? [];
    gareViste += 1;
    righeTotali += righe.length;
    const conMinuti = righe.filter((r) => Number(r.minutes_played) > 0).length;
    const conXg = righe.filter((r) => Number(r.expected_goals) > 0).length;
    righeConMinuti += conMinuti;

    for (const r of righe) {
      for (const [k, v] of Object.entries(r)) {
        if (IDENTIFICATIVI.has(k)) continue;
        campiPresenti.add(k);
        const n = Number(v);
        if (v !== null && v !== undefined && Number.isFinite(n) && n !== 0) {
          campiConValore.set(k, (campiConValore.get(k) ?? 0) + 1);
        }
      }
    }

    const v = perLega.get(lega) ?? { gare: 0, gareConMinuti: 0, righe: 0, righeConMinuti: 0 };
    v.gare += 1;
    v.righe += righe.length;
    v.righeConMinuti += conMinuti;
    v.righeConXg = (v.righeConXg ?? 0) + conXg;
    if (conMinuti > 0) v.gareConMinuti += 1;
    perLega.set(lega, v);
  }
  console.error(`giorno ${giorno}: ${campione.length} gare finite esaminate`);
}

console.log("\n== COPERTURA PER GIOCATORE, MISURATA ==");
console.log(`gare esaminate: ${gareViste} · righe giocatore: ${righeTotali}`);
console.log(`righe con minuti giocati > 0: ${righeConMinuti} (${(100 * righeConMinuti / Math.max(1, righeTotali)).toFixed(1)}%)`);

console.log("\n-- per campionato --");
console.log("campionato".padEnd(38) + "gare  con minuti  righe  righe con minuti");
for (const [lega, v] of [...perLega].sort((a, b) => b[1].gare - a[1].gare)) {
  console.log("  " + String(lega).slice(0, 34).padEnd(36) + String(v.gare).padStart(4) + String(v.gareConMinuti).padStart(11) + String(v.righe).padStart(7) + String(v.righeConMinuti).padStart(18));
}

console.log("\n-- campi con almeno un valore diverso da zero --");
const ordinati = [...campiConValore].sort((a, b) => b[1] - a[1]);
for (const [k, n] of ordinati) {
  console.log("  " + k.padEnd(34) + String(n).padStart(6) + `  (${(100 * n / Math.max(1, righeTotali)).toFixed(1)}% delle righe)`);
}
console.log(`\ncampi statistici presenti: ${campiPresenti.size}`);
console.log(`campi con almeno un valore vero: ${campiConValore.size}`);
console.log(`campi sempre a zero o nulli: ${campiPresenti.size - campiConValore.size}`);
