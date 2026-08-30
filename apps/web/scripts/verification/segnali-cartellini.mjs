// Esiste un segnale per il «probabile ammonito»? Solo lettura, nessuna scrittura.
// Uso, da apps/web: node scripts/verification/segnali-cartellini.mjs <lega> <dal> <al>
//   node scripts/verification/segnali-cartellini.mjs 4 2025-08-01 2026-05-31
//
// Costruisce il retrospettivo di una stagione e misura quanto il passato di un giocatore
// anticipa il suo giallo. La media del giocatore e' calcolata SOLO sulle gare precedenti a
// quella da prevedere: usare anche la gara stessa gonfierebbe il segnale e il numero non
// varrebbe niente. Non stima probabilita' e non produce una lettura: dice soltanto se il
// segnale esiste e quanto e' forte, che e' la domanda che viene prima.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

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

const LEGA = process.argv[2] ?? "4";
const DAL = process.argv[3] ?? "2025-08-01";
const AL = process.argv[4] ?? "2026-05-31";
const MINIMO_PRECEDENTI = 5;

async function chiedi(path) {
  for (let t = 0; t < 3; t += 1) {
    try {
      const r = await fetch(origine + path, { headers: { Authorization: `Token ${token}` } });
      if (r.ok) return r.json();
      if (r.status >= 500) continue;
      return null;
    } catch { /* rete: si riprova */ }
  }
  return null;
}

// Divide in gruppi di uguale numerosita' sul valore, non su tagli scelti a mano: una soglia
// decisa a tavolino deciderebbe il risultato prima di misurarlo.
function quantili(valori, quanti) {
  const v = [...valori].sort((a, b) => a - b);
  const tagli = [];
  for (let i = 1; i < quanti; i += 1) tagli.push(v[Math.floor((i * v.length) / quanti)]);
  return tagli;
}
function gruppo(x, tagli) {
  let g = 0;
  while (g < tagli.length && x >= tagli[g]) g += 1;
  return g;
}

// Se questa fallisce, ogni gruppo stampato sotto e' sbagliato.
{
  const t = quantili([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
  assert.equal(t.length, 4);
  assert.equal(gruppo(1, t), 0);
  assert.equal(gruppo(10, t), 4);
  assert.ok(gruppo(5, t) > 0 && gruppo(5, t) < 4, `mediana finita nel gruppo ${gruppo(5, t)}`);
}

// La lista torna dalla piu' recente: si scorre finche' non si e' passato l'inizio della
// finestra. Fermarsi alla prima pagina prenderebbe mezza stagione e non lo direbbe.
const grezze = [];
for (let offset = 0; offset < 2000; offset += 200) {
  const pagina = await chiedi(`/api/v2/events/?league=${LEGA}&status=finished&limit=200&offset=${offset}`);
  const r = pagina?.results ?? [];
  grezze.push(...r);
  if (r.length < 200) break;
  if ((r[r.length - 1].event_date ?? "").slice(0, 10) < DAL) break;
}
const gare = grezze
  .filter((g) => { const d = (g.event_date ?? "").slice(0, 10); return d >= DAL && d <= AL; })
  .sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
console.error(`gare finite nella finestra: ${gare.length} (dal ${DAL} al ${AL}, lega ${LEGA})`);
if (gare.length === 0) throw new Error("finestra vuota");

// Un arbitro per gara, con le sue medie dichiarate dalla fonte.
const arbitri = new Map();
async function arbitro(id) {
  if (id === null || id === undefined) return null;
  if (!arbitri.has(id)) arbitri.set(id, await chiedi(`/api/v2/referees/${id}/`));
  return arbitri.get(id);
}

const storia = new Map(); // player_id -> { minuti, falli, gialli, subiti, contrasti, duelliPersi, gare }
const casi = [];
let righeGiocate = 0;
let senzaStatistiche = 0;

for (const gara of gare) {
  const stat = await chiedi(`/api/v2/events/${gara.id}/player-stats/`);
  const righe = (stat?.results ?? stat?.player_stats ?? []).filter((r) => Number(r.minutes_played) > 0);
  if (righe.length === 0) { senzaStatistiche += 1; continue; }
  const arb = await arbitro(gara.referee_id);

  for (const r of righe) {
    righeGiocate += 1;
    const p = storia.get(r.player_id);
    // Il caso si registra PRIMA di aggiornare la storia: cosi' la media non contiene la gara
    // che deve prevedere.
    if (p && p.gare >= MINIMO_PRECEDENTI && p.minuti > 0) {
      casi.push({
        giallo: Number(r.yellow_card) > 0 ? 1 : 0,
        gol: Number(r.goals) > 0 ? 1 : 0,
        falli90: (90 * p.falli) / p.minuti,
        gialli90: (90 * p.gialli) / p.minuti,
        contrasti90: (90 * p.contrasti) / p.minuti,
        duelliPersi90: (90 * p.duelliPersi) / p.minuti,
        subiti90: (90 * p.subiti) / p.minuti,
        tiri90: (90 * p.tiri) / p.minuti,
        inPorta90: (90 * p.inPorta) / p.minuti,
        xg90: (90 * p.xg) / p.minuti,
        gol90: (90 * p.gol) / p.minuti,
        occasioni90: (90 * p.occasioni) / p.minuti,
        arbitroGialli: Number(arb?.avg_yellow_per_match ?? NaN),
        derby: gara.is_local_derby ? 1 : 0,
        minuti: Number(r.minutes_played),
      });
    }
    const s = p ?? { minuti: 0, falli: 0, gialli: 0, subiti: 0, contrasti: 0, duelliPersi: 0, tiri: 0, inPorta: 0, xg: 0, gol: 0, occasioni: 0, gare: 0 };
    s.minuti += Number(r.minutes_played) || 0;
    s.falli += Number(r.fouls) || 0;
    s.gialli += Number(r.yellow_card) > 0 ? 1 : 0;
    s.subiti += Number(r.was_fouled) || 0;
    s.contrasti += Number(r.total_tackle) || 0;
    s.duelliPersi += Number(r.duel_lost) || 0;
    s.tiri += Number(r.total_shots) || 0;
    s.inPorta += Number(r.shots_on_target) || 0;
    // xG e' nullo esattamente quando i tiri sono zero: li' vale zero, mai mancante.
    s.xg += Number(r.expected_goals) || 0;
    s.gol += Number(r.goals) || 0;
    s.occasioni += Number(r.big_chance_missed) || 0;
    s.gare += 1;
    storia.set(r.player_id, s);
  }
}

// Due bersagli: il giallo e il gol. Cambia che cosa si conta, non come lo si conta.
const BERSAGLIO = process.env.SEGNALI_BERSAGLIO === "gol" ? "gol" : "giallo";
const base0 = casi.reduce((a, c) => a + c[BERSAGLIO], 0) / Math.max(1, casi.length);
console.log(`\n== SEGNALE DEL ${BERSAGLIO.toUpperCase()} — lega ${LEGA}, ${DAL} .. ${AL} ==`);
console.log(`gare usate: ${gare.length - senzaStatistiche} · gare senza statistiche: ${senzaStatistiche}`);
console.log(`righe con minuti > 0: ${righeGiocate} · casi con almeno ${MINIMO_PRECEDENTI} gare alle spalle: ${casi.length}`);
console.log(`frequenza di base del ${BERSAGLIO}, per giocatore in campo: ${(100 * base0).toFixed(1)}%`);

function separa(nome, chiave, quanti = 5) {
  const validi = casi.filter((c) => Number.isFinite(c[chiave]));
  if (validi.length < quanti * 20) { console.log(`\n${nome}: campione troppo piccolo (${validi.length})`); return; }
  const tagli = quantili(validi.map((c) => c[chiave]), quanti);
  const gruppi = Array.from({ length: quanti }, () => ({ n: 0, gialli: 0, somma: 0 }));
  for (const c of validi) { const g = gruppi[gruppo(c[chiave], tagli)]; g.n += 1; g.gialli += c[BERSAGLIO]; g.somma += c[chiave]; }
  const pieni = gruppi.filter((g) => g.n > 0).length;
  console.log(`\n-- ${nome}, per quinti --${pieni < quanti ? `  ATTENZIONE: solo ${pieni} gruppi su ${quanti}, il valore ha troppi pari merito per dividerlo in ${quanti}` : ""}`);
  for (const [i, g] of gruppi.entries()) {
    if (g.n === 0) continue;
    const q = g.gialli / g.n;
    const fetta = (100 * g.n) / validi.length;
    console.log(`  gruppo ${i + 1}  valore medio ${(g.somma / g.n).toFixed(2).padStart(6)}  casi ${String(g.n).padStart(5)} (${fetta.toFixed(0).padStart(3)}% del campione)  ${BERSAGLIO} ${String(g.gialli).padStart(4)}  = ${(100 * q).toFixed(1).padStart(5)}%  (base ${(100 * base0).toFixed(1)}%, rapporto ${(q / base0).toFixed(2)}x)`);
  }
}

if (BERSAGLIO === "giallo") {
  separa("falli per 90 del giocatore, prima di questa gara", "falli90");
  separa("gialli per 90 del giocatore, prima di questa gara", "gialli90");
  separa("contrasti per 90", "contrasti90");
  separa("duelli persi per 90", "duelliPersi90");
  separa("falli subiti per 90", "subiti90");
  separa("media gialli dell'arbitro, dichiarata dalla fonte", "arbitroGialli");
} else {
  separa("xG per 90 del giocatore, prima di questa gara", "xg90");
  separa("tiri per 90", "tiri90");
  separa("tiri in porta per 90", "inPorta90");
  separa("gol per 90", "gol90");
  separa("grandi occasioni sbagliate per 90", "occasioni90");
}

const derby = casi.filter((c) => c.derby === 1);
if (derby.length > 0) {
  const q = derby.reduce((a, c) => a + c[BERSAGLIO], 0) / derby.length;
  console.log(`\nderby: ${derby.length} casi, ${(100 * q).toFixed(1)}% (rapporto ${(q / base0).toFixed(2)}x)`);
}

const dove = process.env.SEGNALI_JSON;
if (dove) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(dove, JSON.stringify({ lega: LEGA, dal: DAL, al: AL, base: base0, casi }, null, 0));
  console.error(`casi scritti in ${dove}`);
}
