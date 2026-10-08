// Il valore con la probabilita' corretta: tolta la sovraconfidenza, resta un vantaggio?
//
// **Perche' esiste.** `consuntivo-valore.ts` ha misurato che sulle linee quotate il motore
// promette piu' di quanto esce (67,4% contro 58,4% nella fascia +11..+15), e che gran parte
// del «valore» e' quella sovraconfidenza. Qui la si toglie e si rimisura.
//
// **Come, senza barare.** La correzione e' logistica: logit(p') = a + b * logit(p), stimata
// su un periodo e applicata all'altro, e viceversa. Ogni probabilita' corretta viene quindi
// da una correzione che non ha visto quella gara. Tre varianti:
// - globale: una sola coppia (a, b);
// - per famiglia: una coppia per bersaglio, globale dove la famiglia ha meno di 300 righe;
// - con il prezzo: logit(p') = a + b * logit(p) + c * logit(implicita). Il peso b dice se
//   la nostra probabilita' aggiunge qualcosa a quella del banco: b vicino a zero = no.
//
// Accanto: Brier e log-loss di ogni probabilita', le fasce del valore corretto e la scelta
// di una linea per gara, che e' quello che farebbe la home.
//
// Uso, dopo `consuntivo-valore.ts --letture letture.json`:
//   node --experimental-strip-types scripts/consuntivo-valore-corretto.ts letture.json
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface Lettura {
  readonly gara: string;
  readonly kickoff: string;
  readonly bersaglio: string;
  readonly quota: number;
  readonly probabilita: number;
  readonly implicita: number;
  readonly valore: number;
  readonly presa: 1 | 0 | null;
  readonly resa: number;
}

const TETTO_VALORE = 15;
const RIGHE_PER_FAMIGLIA = 300;

const logit = (p: number) => {
  const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4);
  return Math.log(q / (1 - q));
};
const sigmoide = (x: number) => 1 / (1 + Math.exp(-x));

/** Regressione logistica con Newton: pochi parametri, poche iterazioni. */
function logistica(x: readonly (readonly number[])[], y: readonly number[]): number[] {
  const k = x[0].length;
  let w = new Array<number>(k).fill(0);
  for (let giro = 0; giro < 50; giro += 1) {
    const g = new Array<number>(k).fill(0);
    const h = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    for (let i = 0; i < x.length; i += 1) {
      const p = sigmoide(x[i].reduce((s, v, j) => s + v * w[j], 0));
      for (let j = 0; j < k; j += 1) {
        g[j] += (y[i] - p) * x[i][j];
        for (let m = 0; m < k; m += 1) h[j][m] += p * (1 - p) * x[i][j] * x[i][m];
      }
    }
    const passo = risolvi(h, g);
    w = w.map((v, j) => v + passo[j]);
    if (Math.max(...passo.map(Math.abs)) < 1e-8) break;
  }
  return w;
}

/** Gauss con pivot: h * x = g, h piccola e definita positiva. */
function risolvi(h: number[][], g: number[]): number[] {
  const n = g.length;
  const a = h.map((riga, i) => [...riga, g[i]]);
  for (let c = 0; c < n; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let j = c; j <= n; j += 1) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((riga, i) => riga[n] / riga[i]);
}

type Metodo = "nostra" | "globale" | "famiglia" | "conPrezzo" | "implicita";

/** Le probabilita' corrette di `prova`, con correzioni stimate solo su `stima`. */
function corrette(stima: readonly Lettura[], prova: readonly Lettura[]) {
  const decise = stima.filter((l) => l.presa !== null);
  const y = decise.map((l) => l.presa as number);
  const globale = logistica(decise.map((l) => [1, logit(l.probabilita)]), y);
  const conPrezzo = logistica(decise.map((l) => [1, logit(l.probabilita), logit(l.implicita)]), y);
  const perFamiglia = new Map<string, number[]>();
  for (const b of new Set(decise.map((l) => l.bersaglio))) {
    const sue = decise.filter((l) => l.bersaglio === b);
    if (sue.length < RIGHE_PER_FAMIGLIA) continue;
    perFamiglia.set(b, logistica(sue.map((l) => [1, logit(l.probabilita)]), sue.map((l) => l.presa as number)));
  }
  const righe = prova.map((l) => {
    const f = perFamiglia.get(l.bersaglio) ?? globale;
    return {
      lettura: l,
      p: {
        nostra: l.probabilita,
        globale: sigmoide(globale[0] + globale[1] * logit(l.probabilita)),
        famiglia: sigmoide(f[0] + f[1] * logit(l.probabilita)),
        conPrezzo: sigmoide(conPrezzo[0] + conPrezzo[1] * logit(l.probabilita) + conPrezzo[2] * logit(l.implicita)),
        implicita: l.implicita,
      } satisfies Record<Metodo, number>,
    };
  });
  return { righe, globale, conPrezzo };
}

type Riga = ReturnType<typeof corrette>["righe"][number];

function wilson(prese: number, n: number): [number, number] {
  const z = 1.96;
  const p = prese / n;
  const centro = (p + z * z / (2 * n)) / (1 + z * z / n);
  const mezzo = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n);
  return [centro - mezzo, centro + mezzo];
}

function casuale(seme: number): () => number {
  let s = seme >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Resa media per puntata con intervallo al 95%, ricampionando le gare. */
function resa(letture: readonly Lettura[]): [number, number, number] {
  const perGara = new Map<string, { somma: number; n: number }>();
  for (const l of letture) {
    const g = perGara.get(l.gara) ?? { somma: 0, n: 0 };
    g.somma += l.resa;
    g.n += 1;
    perGara.set(l.gara, g);
  }
  const gare = [...perGara.values()];
  const caso = casuale(20261006);
  const medie: number[] = [];
  for (let giro = 0; giro < 2000; giro += 1) {
    let somma = 0;
    let n = 0;
    for (let i = 0; i < gare.length; i += 1) {
      const g = gare[Math.floor(caso() * gare.length)];
      somma += g.somma;
      n += g.n;
    }
    medie.push(somma / n);
  }
  medie.sort((a, b) => a - b);
  const media = gare.reduce((s, g) => s + g.somma, 0) / gare.reduce((s, g) => s + g.n, 0);
  return [media, medie[50], medie[1949]];
}

const pc = (v: number) => Number((v * 100).toFixed(1));

function riassunto(letture: readonly Lettura[], nostra?: (l: Lettura) => number) {
  const decise = letture.filter((l) => l.presa !== null);
  const prese = decise.filter((l) => l.presa === 1).length;
  if (letture.length === 0 || decise.length === 0) return { letture: letture.length };
  const [b, a] = wilson(prese, decise.length);
  const [r, rb, ra] = resa(letture);
  return {
    letture: letture.length,
    gare: new Set(letture.map((l) => l.gara)).size,
    frequenza: pc(prese / decise.length),
    frequenza_95: [pc(b), pc(a)],
    nostra: nostra === undefined ? null : pc(decise.reduce((s, l) => s + nostra(l), 0) / decise.length),
    implicita: pc(decise.reduce((s, l) => s + l.implicita, 0) / decise.length),
    quota: Number((letture.reduce((s, l) => s + l.quota, 0) / letture.length).toFixed(2)),
    resa: pc(r),
    resa_95: [pc(rb), pc(ra)],
  };
}

/** Brier e log-loss di ogni probabilita', solo sulle linee decise. */
function punteggi(righe: readonly Riga[]) {
  const decise = righe.filter((r) => r.lettura.presa !== null);
  const metodi: Metodo[] = ["nostra", "globale", "famiglia", "conPrezzo", "implicita"];
  return Object.fromEntries(metodi.map((m) => {
    let brier = 0;
    let perdita = 0;
    for (const r of decise) {
      const y = r.lettura.presa as number;
      const p = Math.min(Math.max(r.p[m], 1e-4), 1 - 1e-4);
      brier += (p - y) ** 2;
      perdita -= y * Math.log(p) + (1 - y) * Math.log(1 - p);
    }
    return [m, { brier: Number((brier / decise.length).toFixed(5)), logloss: Number((perdita / decise.length).toFixed(5)) }];
  }));
}

const FASCE = [
  { nome: "<= -6", da: -Infinity, a: -6 },
  { nome: "-5..0", da: -5, a: 0 },
  { nome: "+1..+3", da: 1, a: 3 },
  { nome: "+4..+6", da: 4, a: 6 },
  { nome: "+7..+10", da: 7, a: 10 },
  { nome: "> +10", da: 11, a: Infinity },
];

function fasce(righe: readonly Riga[], metodo: Metodo) {
  const valore = (r: Riga) => Math.round((r.p[metodo] - r.lettura.implicita) * 100);
  return FASCE.map((f) => {
    const dentro = righe.filter((r) => valore(r) >= f.da && valore(r) <= f.a);
    const p = new Map(dentro.map((r) => [r.lettura, r.p[metodo]]));
    return { fascia: f.nome, ...riassunto(dentro.map((r) => r.lettura), (l) => p.get(l) as number) };
  });
}

/**
 * Una linea per gara, come farebbe la home: la migliore secondo il criterio, solo se il
 * suo valore e' positivo. `null` = nessuna linea di quella gara passa.
 */
function unaPerGara(righe: readonly Riga[], punteggio: (r: Riga) => number | null) {
  const migliori = new Map<string, { r: Riga; s: number }>();
  for (const r of righe) {
    const s = punteggio(r);
    if (s === null) continue;
    const gia = migliori.get(r.lettura.gara);
    if (gia === undefined || s > gia.s) migliori.set(r.lettura.gara, { r, s });
  }
  return riassunto([...migliori.values()].map((m) => m.r.lettura));
}

function scelte(righe: readonly Riga[]) {
  const valore = (r: Riga, m: Metodo) => (r.p[m] - r.lettura.implicita) * 100;
  return {
    "valore grezzo max (1..15)": unaPerGara(righe, (r) => {
      const v = r.lettura.valore;
      return v > 0 && v <= TETTO_VALORE ? v : null;
    }),
    "valore corretto globale max (>0)": unaPerGara(righe, (r) => (valore(r, "globale") > 0 ? valore(r, "globale") : null)),
    "valore corretto famiglia max (>0)": unaPerGara(righe, (r) => (valore(r, "famiglia") > 0 ? valore(r, "famiglia") : null)),
    "valore con prezzo max (>0)": unaPerGara(righe, (r) => (valore(r, "conPrezzo") > 0 ? valore(r, "conPrezzo") : null)),
    "probabilita' corretta max": unaPerGara(righe, (r) => r.p.globale),
    "probabilita' implicita max": unaPerGara(righe, (r) => r.lettura.implicita),
  };
}

function main(): number {
  const file = process.argv[2];
  if (file === undefined) {
    console.error("serve il file delle letture di consuntivo-valore.ts --letture");
    return 1;
  }
  const tutte = JSON.parse(readFileSync(file, "utf8")) as Lettura[];
  const gare = [...new Set(tutte.map((l) => `${l.kickoff}|${l.gara}`))].sort();
  const taglio = gare[Math.floor(gare.length / 2)].split("|")[0];
  const p1 = tutte.filter((l) => l.kickoff < taglio);
  const p2 = tutte.filter((l) => l.kickoff >= taglio);

  const su2 = corrette(p1, p2); // stimata sul periodo 1, provata sul 2
  const su1 = corrette(p2, p1);
  const insieme = [...su1.righe, ...su2.righe];
  const coeff = (w: number[]) => w.map((v) => Number(v.toFixed(3)));

  const rapporto = {
    generato_il: new Date().toISOString(),
    letture: tutte.length,
    gare: gare.length,
    taglio_dei_periodi: taglio,
    correzione: {
      stimata_su_periodo_1: { globale_a_b: coeff(su2.globale), con_prezzo_a_b_c: coeff(su2.conPrezzo) },
      stimata_su_periodo_2: { globale_a_b: coeff(su1.globale), con_prezzo_a_b_c: coeff(su1.conPrezzo) },
    },
    punteggi: { periodo_1: punteggi(su1.righe), periodo_2: punteggi(su2.righe), tutte: punteggi(insieme) },
    fasce_corretto_globale: {
      tutte: fasce(insieme, "globale"), periodo_1: fasce(su1.righe, "globale"), periodo_2: fasce(su2.righe, "globale"),
    },
    fasce_con_prezzo: {
      tutte: fasce(insieme, "conPrezzo"), periodo_1: fasce(su1.righe, "conPrezzo"), periodo_2: fasce(su2.righe, "conPrezzo"),
    },
    una_per_gara: { tutte: scelte(insieme), periodo_1: scelte(su1.righe), periodo_2: scelte(su2.righe) },
  };
  const uscita = path.join(import.meta.dirname, "..", "..", "..", "scripts", "projection",
    "dataset", "output", "consuntivo-valore-corretto.json");
  writeFileSync(uscita, `${JSON.stringify(rapporto, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(rapporto, null, 1));
  return 0;
}

process.exitCode = main();
