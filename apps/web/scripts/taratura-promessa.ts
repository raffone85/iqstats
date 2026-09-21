// La taratura della promessa: quanti punti la probabilita' di una lettura sbaglia, in
// media, secondo quanto la lettura si stacca dalla norma del suo campionato.
//
// **Perche' esiste.** Misurato il 20 settembre 2026 su 2.674 letture di gare chiuse:
// l'insieme delle letture e' calibrato (71,3% promesso contro 70,6% reso), ma non le sue
// parti. Sotto la norma il motore promette meno di quanto rende, oltre i dieci punti di
// scarto promette molto di piu': l'errore medio di calibrazione era 4,31 punti, e sul
// consigliato la promessa stava 5,8 punti sopra la realta'. La correzione stimata sulle
// gare vecchie e applicata a quelle nuove porta l'errore a 2,61 punti e la distanza del
// consigliato a zero, senza togliere una gara. Verificata a tre tagli diversi del
// campione: la direzione non cambia.
//
// **Che cosa non fa.** Non tocca il criterio: l'ordine delle letture e la scelta del
// consigliato restano sulla probabilita' del motore. Qui si corregge solo il numero che
// la pagina mostra.
//
// Uso, dopo una corsa del consuntivo con `--dettaglio`:
//   node --experimental-strip-types scripts/taratura-promessa.ts <dettaglio.json>
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface Riga {
  readonly kickoff: string;
  readonly probabilita: number;
  readonly presa: boolean;
  readonly fuoriFascia: boolean;
  readonly scarto: number | null;
}

/** Le fasce di scarto, in punti di probabilita' sulla norma del campionato. */
const FASCE = [
  { nome: "sotto la norma", da: null, a: 0 },
  { nome: "0-5", da: 0, a: 5 },
  { nome: "5-10", da: 5, a: 10 },
  { nome: "10-15", da: 10, a: 15 },
  { nome: "oltre 15", da: 15, a: null },
] as const;

/** Sotto questo numero di letture la fascia non detta nessuna correzione. */
const MINIMO = 30;

function fasciaDi(scarto: number): string | null {
  const f = FASCE.find((v) => (v.da === null || scarto >= v.da) && (v.a === null || scarto < v.a));
  return f?.nome ?? null;
}

function correzioneDi(righe: readonly Riga[]): number | null {
  if (righe.length < MINIMO) return null;
  const promesso = righe.reduce((s, r) => s + r.probabilita, 0) / righe.length;
  const reso = righe.filter((r) => r.presa).length / righe.length;
  return Number((reso - promesso).toFixed(4));
}

const percorsoDettaglio = process.argv[2];
if (!percorsoDettaglio) {
  console.error("serve il percorso del dettaglio prodotto da consuntivo-letture.ts --dettaglio");
  process.exit(1);
}

const tutte: readonly Riga[] = (JSON.parse(readFileSync(percorsoDettaglio, "utf8")) as Riga[])
  .filter((r) => !r.fuoriFascia && r.scarto !== null);
if (tutte.length < MINIMO * FASCE.length) {
  console.error(`campione troppo piccolo: ${tutte.length} letture con base di lega`);
  process.exit(1);
}

const kickoff = tutte.map((r) => r.kickoff).sort();
const fasce = FASCE.map((f) => {
  const righe = tutte.filter((r) => fasciaDi(r.scarto as number) === f.nome);
  const correzione = correzioneDi(righe);
  return {
    nome: f.nome,
    da: f.da,
    a: f.a,
    letture: righe.length,
    promesso: Number((righe.reduce((s, r) => s + r.probabilita, 0) / Math.max(1, righe.length)).toFixed(4)),
    reso: Number((righe.filter((r) => r.presa).length / Math.max(1, righe.length)).toFixed(4)),
    // `null` quando la fascia non ha abbastanza letture: la promessa resta quella del motore.
    correzione,
  };
});

const taratura = {
  schema: "taratura-promessa/1",
  calcolata_il: new Date().toISOString(),
  come_e_stata_stimata: (
    "sulle letture ricostruite da consuntivo-letture.ts su gare gia' chiuse: per ogni "
    + "fascia di scarto dalla norma del campionato, la differenza fra quanto la lettura ha "
    + "reso e quanto prometteva. Corregge solo il numero mostrato: l'ordine delle letture e "
    + "la scelta del consigliato restano sulla probabilita' del motore."
  ),
  campione: {
    letture: tutte.length,
    dal: kickoff[0]?.slice(0, 10) ?? null,
    al: kickoff[kickoff.length - 1]?.slice(0, 10) ?? null,
    minimo_per_fascia: MINIMO,
  },
  fasce,
};

const percorso = path.join(
  import.meta.dirname, "..", "src", "server", "iqstats", "artefatti", "taratura-promessa.json",
);
writeFileSync(percorso, JSON.stringify(taratura, null, 2) + "\n", "utf8");
for (const f of fasce) {
  const c = f.correzione;
  console.log(`${f.nome.padEnd(15)} n=${String(f.letture).padStart(4)}`
    + ` · promesso ${(f.promesso * 100).toFixed(1)}% · reso ${(f.reso * 100).toFixed(1)}%`
    + ` · correzione ${c === null ? "nessuna (campione corto)" : `${c > 0 ? "+" : ""}${(c * 100).toFixed(1)} punti`}`);
}
console.log(percorso);
