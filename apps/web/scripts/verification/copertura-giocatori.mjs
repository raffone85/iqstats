// Copertura dei dati per giocatore alla fonte. Solo lettura, nessuna scrittura.
// Uso, da apps/web:
//   node scripts/verification/copertura-giocatori.mjs <gare per lega>
//   COPERTURA_DA=2026-07-01 node scripts/verification/copertura-giocatori.mjs   (censimento)
//   COPERTURA_JSON=<percorso> per riavere le misure in JSON e non ricopiarle a mano
//
// Campiona le ultime N gare finite di OGNI campionato della fonte e misura quante portano
// davvero statistiche per giocatore. Il campione e' per lega e non per giorno: un campione
// globale premia i campionati che giocano di piu' e lascia gli altri con una o due gare, e su
// una o due gare nessuna soglia regge. Accanto a ogni quota c'e' l'intervallo di Wilson al
// 95%: dice quanto stretta e' la misura, e senza quello la percentuale da sola non decide
// niente.
import { readFileSync, writeFileSync } from "node:fs";
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

const PER_LEGA = Number(process.argv[2] ?? 20);
const PARALLELE = 6;

async function chiedi(path) {
  for (let tentativo = 0; tentativo < 3; tentativo += 1) {
    try {
      const r = await fetch(origine + path, { headers: { Authorization: `Token ${token}` } });
      if (r.ok) return r.json();
      if (r.status >= 500) continue;
      return null;
    } catch {
      // rete: si riprova, un buco di rete non e' un buco di copertura
    }
  }
  return null;
}

// Intervallo di Wilson al 95% per una proporzione: regge anche a 0/N e N/N, dove
// l'intervallo normale collassa a zero e farebbe sembrare certa una misura che non lo e'.
function wilson(x, n, z = 1.96) {
  if (n === 0) return [0, 1];
  const p = x / n;
  const d = 1 + (z * z) / n;
  const centro = (p + (z * z) / (2 * n)) / d;
  const raggio = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centro - raggio), Math.min(1, centro + raggio)];
}

// Se questa fallisce, ogni intervallo stampato sotto e' sbagliato.
{
  const [b20, a20] = wilson(20, 20);
  assert.ok(Math.abs(b20 - 0.8389) < 0.001, `Wilson 20/20 estremo basso ${b20}`);
  assert.equal(a20, 1);
  const [b0, a0] = wilson(0, 20);
  assert.equal(b0, 0);
  assert.ok(Math.abs(a0 - 0.1611) < 0.001, `Wilson 0/20 estremo alto ${a0}`);
  const [bm, am] = wilson(5, 10);
  assert.ok(bm < 0.5 && am > 0.5, "Wilson 5/10 deve contenere 0,5");
}

async function inParallelo(elementi, quante, fn) {
  const esiti = new Array(elementi.length);
  let prossimo = 0;
  await Promise.all(
    Array.from({ length: Math.min(quante, elementi.length) }, async () => {
      while (prossimo < elementi.length) {
        const i = prossimo;
        prossimo += 1;
        esiti[i] = await fn(elementi[i]);
      }
    }),
  );
  return esiti;
}

const IDENTIFICATIVI = new Set(["id", "player_id", "event_id", "team_id"]);

const elencoLeghe = await chiedi("/api/v2/leagues/?limit=500&offset=0");
const leghe = elencoLeghe?.results ?? [];
if (leghe.length === 0) throw new Error("nessuna lega dalla fonte");
console.error(`leghe alla fonte: ${leghe.length} · campione richiesto: ${PER_LEGA} gare finite per lega`);

const campiConValore = new Map();
const campiPresenti = new Set();
let fuoriOrdine = 0;

// Con COPERTURA_DA=AAAA-MM-GG il campione non e' piu' «le ultime N gare» ma TUTTE le gare
// finite da quella data: e' la misura che serve a una sezione con selettore di stagione,
// dove un campione a cavallo di due stagioni mescola una stagione coperta con una che non
// lo e' e nasconde proprio la differenza che decide.
const DA = process.env.COPERTURA_DA ?? "";
if (DA) console.error(`censimento completo delle gare finite dal ${DA}, il numero di gare per lega non e' scelto`);

const misure = await inParallelo(leghe, PARALLELE, async (lega) => {
  const quante = DA ? 200 : PER_LEGA;
  const elenco = await chiedi(`/api/v2/events/?league=${lega.id}&status=finished&limit=${quante}&offset=0`);
  const gare = (elenco?.results ?? []).filter((g) => !DA || (g.event_date ?? "").slice(0, 10) >= DA);
  const misura = {
    id: lega.id,
    nome: lega.name ?? String(lega.id),
    paese: lega.country_name ?? lega.country ?? "",
    finiteInArchivio: elenco?.count ?? 0,
    // con il censimento la lista si ferma a 200: se le passa tutte, il campione e' tagliato
    troncato: Boolean(DA) && (elenco?.results?.length ?? 0) === 200 && gare.length === 200,
    gare: gare.length,
    gareConStatistiche: 0,
    gareSenzaRighe: 0,
    righe: 0,
    righeConMinuti: 0,
    dal: null,
    al: null,
  };

  const date = gare.map((g) => (g.event_date ?? "").slice(0, 10)).filter(Boolean).sort();
  misura.dal = date[0] ?? null;
  misura.al = date[date.length - 1] ?? null;

  for (const gara of gare) {
    const stat = await chiedi(`/api/v2/events/${gara.id}/player-stats/`);
    const righe = stat?.results ?? stat?.player_stats ?? [];
    misura.righe += righe.length;
    if (righe.length === 0) misura.gareSenzaRighe += 1;
    const conMinuti = righe.filter((r) => Number(r.minutes_played) > 0).length;
    misura.righeConMinuti += conMinuti;
    if (conMinuti > 0) misura.gareConStatistiche += 1;
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
  }
  // La fonte ignora ?ordering=: che le ultime N siano davvero le ultime va verificato, non
  // dato per buono. Se le date non scendono, il campione non e' il piu' recente e va detto.
  const inOrdine = gare.every((g, i) => i === 0 || (gare[i - 1].event_date ?? "") >= (g.event_date ?? ""));
  if (!inOrdine) fuoriOrdine += 1;
  console.error(`  ${misura.nome}: ${misura.gareConStatistiche}/${misura.gare}`);
  return misura;
});

const quota = (m) => (m.gare === 0 ? -1 : m.gareConStatistiche / m.gare);
const ordinate = [...misure].sort((a, b) => quota(b) - quota(a) || b.gare - a.gare);

const gareViste = misure.reduce((s, m) => s + m.gare, 0);
const gareCoperte = misure.reduce((s, m) => s + m.gareConStatistiche, 0);
const righeTotali = misure.reduce((s, m) => s + m.righe, 0);
const righeConMinuti = misure.reduce((s, m) => s + m.righeConMinuti, 0);

console.log("\n== COPERTURA PER GIOCATORE, CAMPIONE PER LEGA ==");
console.log(`leghe interrogate: ${misure.length} · gare campionate: ${gareViste} · righe giocatore: ${righeTotali}`);
console.log(`gare con almeno un giocatore con minuti: ${gareCoperte} (${(100 * gareCoperte / Math.max(1, gareViste)).toFixed(1)}%)`);
console.log(`righe con minuti giocati > 0: ${righeConMinuti} (${(100 * righeConMinuti / Math.max(1, righeTotali)).toFixed(1)}%)`);
console.log(`leghe con il campione fuori ordine di data: ${fuoriOrdine}`);

console.log("\n-- per campionato, ordinate per quota di gare coperte --");
console.log("  campionato".padEnd(34) + "paese".padEnd(18) + " gare  coperte    quota  IC 95%          righe  dal        al");
for (const m of ordinate) {
  const [basso, alto] = wilson(m.gareConStatistiche, m.gare);
  const q = m.gare === 0 ? "    n/d" : (100 * m.gareConStatistiche / m.gare).toFixed(1).padStart(7);
  const ic = m.gare === 0 ? "     n/d     " : `${(100 * basso).toFixed(1).padStart(5)}-${(100 * alto).toFixed(1).padStart(5)}`;
  console.log(
    "  " + String(m.nome).slice(0, 30).padEnd(32) +
    String(m.paese).slice(0, 16).padEnd(18) +
    String(m.gare).padStart(5) + String(m.gareConStatistiche).padStart(9) +
    q + "%  " + ic + "  " + String(m.righe).padStart(6) +
    "  " + (m.dal ?? "        ") + " " + (m.al ?? "        "),
  );
}

console.log("\n-- campi con almeno un valore diverso da zero --");
for (const [k, n] of [...campiConValore].sort((a, b) => b[1] - a[1])) {
  console.log("  " + k.padEnd(34) + String(n).padStart(7) + `  (${(100 * n / Math.max(1, righeTotali)).toFixed(1)}% delle righe)`);
}
console.log(`\ncampi statistici presenti: ${campiPresenti.size}`);
console.log(`campi con almeno un valore vero: ${campiConValore.size}`);
console.log(`campi sempre a zero o nulli: ${campiPresenti.size - campiConValore.size}`);

// Uno zero sulle gare recenti non dice «lega mai coperta»: puo' essere una copertura che la
// fonte ha interrotto. La differenza cambia la conclusione, quindi si misura invece di
// dedurla: tre gare piu' indietro nell'archivio bastano a separare «mai» da «non piu'».
const spente = ordinate.filter((m) => m.gare > 0 && m.gareConStatistiche === 0);
if (spente.length > 0) {
  console.log("\n-- le leghe a zero: mai coperte, o coperte e poi interrotte? --");
  for (const m of spente) {
    const e = await chiedi(`/api/v2/events/?league=${m.id}&status=finished&limit=3&offset=120`);
    const gare = e?.results ?? [];
    let coperte = 0;
    for (const g of gare) {
      const s = await chiedi(`/api/v2/events/${g.id}/player-stats/`);
      const righe = s?.results ?? s?.player_stats ?? [];
      if (righe.filter((r) => Number(r.minutes_played) > 0).length > 0) coperte += 1;
    }
    m.storico = { gare: gare.length, coperte, al: (gare[0]?.event_date ?? "").slice(0, 10) };
    const verdetto = gare.length === 0 ? "archivio troppo corto" : coperte > 0 ? "INTERROTTA, prima copriva" : "mai coperta sul campione";
    console.log(`  ${String(m.nome).slice(0, 32).padEnd(34)} indietro di 120 gare: ${coperte}/${gare.length} coperte (fino al ${m.storico.al || "n/d"}) — ${verdetto}`);
  }
}

const dove = process.env.COPERTURA_JSON;
if (dove) {
  writeFileSync(dove, JSON.stringify({ perLega: ordinate, campiConValore: [...campiConValore], campiPresenti: [...campiPresenti], gareViste, gareCoperte, righeTotali, righeConMinuti, fuoriOrdine }, null, 1));
  console.error(`misure scritte in ${dove}`);
}

console.log("\n-- dove cade il salto: quote ordinate e distanza dalla precedente --");
let precedente = null;
for (const m of ordinate.filter((x) => x.gare > 0)) {
  const q = m.gareConStatistiche / m.gare;
  const salto = precedente === null ? 0 : precedente - q;
  if (salto > 0.001) console.log(`  salto di ${(100 * salto).toFixed(1)} punti sopra ${m.nome} (${(100 * q).toFixed(1)}%)`);
  precedente = q;
}
