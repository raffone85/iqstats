// Il consuntivo dei mercati dei gol: quante volte hanno preso, contro quanto promettevano.
//
// **Perche' esiste.** Le sette famiglie statistiche hanno una misura fuori campione
// (`consuntivo-letture.ts`) e per questo possono stare in cima al dossier; i mercati dei
// gol non ne hanno nessuna, e per questo `letture-forti.ts` li tiene fuori dalle letture:
// nascono da due Poisson e da una griglia, non da un modello con un campione di riscontro.
// Finche' non hanno un consuntivo non si possono mettere in un elenco che dichiara quanto
// regge.
//
// **Si misura senza barare, per la stessa ragione del consuntivo delle letture.** Il motore
// legge soltanto le righe anteriori al calcio d'inizio (`prima()` in
// `projection/snapshot.ts`), quindi i mercati che questo script ricostruisce su una gara
// chiusa sono gli stessi che la pagina avrebbe mostrato prima di quella gara.
//
// **Nessuna regola nuova.** Le probabilita' vengono da `proiezioniDellaGara`, cioe' da
// `mercatiGol`, le stesse funzioni che disegnano la sezione Gol. Qui si aggiunge solo
// l'esito vero, che sta nelle stesse righe da cui si prendono le gare.
//
// **Le fasce partono da zero e non da cinquanta.** Le letture delle famiglie dichiarano
// sempre il verso piu' probabile, quindi vivono sopra il cinquanta; i rami di un mercato a
// tre vie no: un pareggio al 25% e' una previsione che il modello fa, e la sua taratura si
// misura dove abita.
//
// Uso, con il livello dati locale in ascolto:
//   npm run consuntivo-gol -- --gare 400 [--insieme 8]
//   npm run consuntivo-gol -- --prova     (solo il controllo, senza database)
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { connessione } from "../src/server/iqstats/lettura.ts";
import type { MercatiGol } from "../src/server/iqstats/projection/gol.ts";
import { proiezioniDellaGara } from "../src/server/iqstats/projection-runtime.ts";

/** Dieci fasce da zero a cento: i rami di un mercato a tre vie stanno anche sotto il 50%. */
const FASCE = [
  { da: 0.0, a: 0.1, nome: "0-10%" },
  { da: 0.1, a: 0.2, nome: "10-20%" },
  { da: 0.2, a: 0.3, nome: "20-30%" },
  { da: 0.3, a: 0.4, nome: "30-40%" },
  { da: 0.4, a: 0.5, nome: "40-50%" },
  { da: 0.5, a: 0.6, nome: "50-60%" },
  { da: 0.6, a: 0.7, nome: "60-70%" },
  { da: 0.7, a: 0.8, nome: "70-80%" },
  { da: 0.8, a: 0.9, nome: "80-90%" },
  { da: 0.9, a: 1.01, nome: "90-100%" },
] as const;

interface RigaDiGara {
  readonly gara: string;
  readonly casa: string;
  readonly fuori: string;
  readonly stagione: string;
  readonly competizione: string;
  readonly arbitro: string | null;
  readonly kickoff: string;
  readonly allenatore_casa: string | null;
  readonly allenatore_fuori: string | null;
  readonly giornata: string | null;
  readonly derby: boolean | null;
  /** I gol veri: dalla riga di casa, `goals_for` e `goals_against`. */
  readonly gol_casa: string | null;
  readonly gol_fuori: string | null;
}

/** Una previsione del modello messa accanto al suo esito. */
interface Previsione {
  /** La famiglia di mercato: `esito`, `doppia-chance`, `over-under`, `gol-nogol`. */
  readonly mercato: string;
  /** Il ramo dichiarato: `uno`, `x`, `due`, `Over 2.5`, `GG`... */
  readonly voce: string;
  readonly probabilita: number;
  readonly presa: boolean;
  /**
   * Vero sul ramo piu' probabile del suo mercato: e' quello che una pagina dichiarerebbe.
   * Gli altri rami restano per misurare la taratura dove il modello promette poco.
   */
  readonly scelta: boolean;
}

/** Il ramo piu' probabile di un gruppo, marcato `scelta`; gli altri restano com'erano. */
function marcaScelta(gruppo: readonly Omit<Previsione, "scelta">[]): Previsione[] {
  let migliore = -1;
  gruppo.forEach((v, i) => {
    if (migliore < 0 || v.probabilita > gruppo[migliore]!.probabilita) migliore = i;
  });
  return gruppo.map((v, i) => ({ ...v, scelta: i === migliore }));
}

/**
 * Tutte le previsioni dei mercati dei gol per una gara, con l'esito vero accanto.
 *
 * I risultati esatti e la matrice restano fuori: sono decine di righe per gara con
 * probabilita' minime, e il loro consuntivo misurerebbe piu' il rumore della griglia che
 * la taratura del modello. Il multigol resta fuori dal primo giro per la stessa ragione.
 */
export function previsioniDi(
  mercati: MercatiGol,
  golCasa: number,
  golFuori: number,
): readonly Previsione[] {
  const totale = golCasa + golFuori;
  const previsioni: Previsione[] = [];

  previsioni.push(...marcaScelta([
    { mercato: "esito", voce: "uno", probabilita: mercati.esito.uno, presa: golCasa > golFuori },
    { mercato: "esito", voce: "x", probabilita: mercati.esito.x, presa: golCasa === golFuori },
    { mercato: "esito", voce: "due", probabilita: mercati.esito.due, presa: golCasa < golFuori },
  ]));

  previsioni.push(...marcaScelta([
    {
      mercato: "doppia-chance", voce: "1X",
      probabilita: mercati.doppiaChance.unoX, presa: golCasa >= golFuori,
    },
    {
      mercato: "doppia-chance", voce: "X2",
      probabilita: mercati.doppiaChance.xDue, presa: golCasa <= golFuori,
    },
    {
      mercato: "doppia-chance", voce: "12",
      probabilita: mercati.doppiaChance.unoDue, presa: golCasa !== golFuori,
    },
  ]));

  // Una soglia dei gol non cade mai su un intero: `sopra` e `sotto` si escludono, quindi
  // il verso e' deciso dal confronto con la linea e non serve trattare la parita'.
  for (const linea of mercati.overUnder) {
    previsioni.push(...marcaScelta([
      {
        mercato: "over-under", voce: `Over ${linea.linea}`,
        probabilita: linea.sopra, presa: totale > linea.linea,
      },
      {
        mercato: "over-under", voce: `Under ${linea.linea}`,
        probabilita: linea.sotto, presa: totale < linea.linea,
      },
    ]));
  }

  previsioni.push(...marcaScelta([
    {
      mercato: "gol-nogol", voce: "GG",
      probabilita: mercati.gg, presa: golCasa > 0 && golFuori > 0,
    },
    {
      mercato: "gol-nogol", voce: "NG",
      probabilita: mercati.ng, presa: golCasa === 0 || golFuori === 0,
    },
  ]));

  // **Gli intervalli si sovrappongono, e questo cambia come si leggono.** «1-2» e «1-3»
  // possono prendere insieme, quindi qui non vale l'identita' dei rami esaustivi: la somma
  // delle probabilita' non fa uno e «dichiarato» e' l'intervallo piu' probabile fra tutti,
  // non uno di una coppia. Estremi compresi, come `quotaFra`.
  previsioni.push(...marcaScelta(mercati.multigolPartita.map((i) => ({
    mercato: "multigol-partita",
    voce: `${i.da}-${i.a}`,
    probabilita: i.probabilita,
    presa: totale >= i.da && totale <= i.a,
  }))));

  for (const [lato, gol] of [
    ["casa", golCasa] as const, ["trasferta", golFuori] as const,
  ]) {
    const squadra = lato === "casa" ? mercati.casa : mercati.trasferta;
    previsioni.push(...marcaScelta(squadra.multigol.map((i) => ({
      mercato: "multigol-squadra",
      voce: `${lato} ${i.da}-${i.a}`,
      probabilita: i.probabilita,
      presa: gol >= i.da && gol <= i.a,
    }))));
  }

  return previsioni;
}

function argomento(nome: string, difetto: number): number {
  const indice = process.argv.indexOf("--" + nome);
  if (indice < 0) return difetto;
  const valore = Number(process.argv[indice + 1]);
  return Number.isFinite(valore) && valore > 0 ? valore : difetto;
}

function conta(previsioni: readonly Previsione[]) {
  if (previsioni.length === 0) return null;
  const prese = previsioni.filter((p) => p.presa).length;
  const promessa = previsioni.reduce((somma, p) => somma + p.probabilita, 0) / previsioni.length;
  return {
    previsioni: previsioni.length,
    prese,
    frequenza_osservata: Number((prese / previsioni.length).toFixed(4)),
    probabilita_promessa: Number(promessa.toFixed(4)),
    // Positivo: il modello rende piu' di quanto promette. Negativo: promette troppo.
    scarto: Number((prese / previsioni.length - promessa).toFixed(4)),
  };
}

async function previsioniDellaRiga(riga: RigaDiGara): Promise<readonly Previsione[]> {
  const golCasa = riga.gol_casa === null ? null : Number(riga.gol_casa);
  const golFuori = riga.gol_fuori === null ? null : Number(riga.gol_fuori);
  if (golCasa === null || golFuori === null
    || !Number.isFinite(golCasa) || !Number.isFinite(golFuori)) return [];

  const proiezioni = await proiezioniDellaGara({
    homeTeamId: Number(riga.casa),
    awayTeamId: Number(riga.fuori),
    seasonId: Number(riga.stagione),
    refereeId: riga.arbitro === null ? null : Number(riga.arbitro),
    kickoff: riga.kickoff,
    homeCoachId: riga.allenatore_casa === null ? null : Number(riga.allenatore_casa),
    awayCoachId: riga.allenatore_fuori === null ? null : Number(riga.allenatore_fuori),
    roundNumber: riga.giornata === null ? null : Number(riga.giornata),
    roundName: null,
    isLocalDerby: riga.derby,
  });
  if (typeof proiezioni === "string") return [];
  const mercati = proiezioni.gol?.mercati ?? null;
  if (mercati === null) return [];

  return previsioniDi(mercati, golCasa, golFuori);
}

/**
 * Il controllo, senza database: se la lettura dell'esito si sposta di un ramo, questo
 * fallisce. E' l'unico pezzo di logica nuova dello script.
 */
function prova(): number {
  const finti = {
    esito: { uno: 0.5, x: 0.3, due: 0.2 },
    doppiaChance: { unoX: 0.8, xDue: 0.5, unoDue: 0.7 },
    overUnder: [{ linea: 2.5, sopra: 0.55, sotto: 0.45 }],
    gg: 0.6,
    ng: 0.4,
    multigolPartita: [
      { da: 1, a: 2, probabilita: 0.4 }, { da: 2, a: 4, probabilita: 0.6 },
    ],
    casa: { multigol: [
      { da: 0, a: 1, probabilita: 0.5 }, { da: 1, a: 2, probabilita: 0.55 },
    ] },
    trasferta: { multigol: [{ da: 0, a: 1, probabilita: 0.7 }] },
  } as unknown as MercatiGol;

  // 2-1: vince la casa, tre gol totali, segnano entrambe.
  const p = previsioniDi(finti, 2, 1);
  const voce = (nome: string) => p.find((v) => v.voce === nome)!;
  assert.equal(voce("uno").presa, true);
  assert.equal(voce("x").presa, false);
  assert.equal(voce("due").presa, false);
  assert.equal(voce("1X").presa, true);
  assert.equal(voce("X2").presa, false);
  assert.equal(voce("12").presa, true);
  assert.equal(voce("Over 2.5").presa, true);
  assert.equal(voce("Under 2.5").presa, false);
  assert.equal(voce("GG").presa, true);
  assert.equal(voce("NG").presa, false);
  // Gli intervalli, estremi compresi: tre gol stanno in 2-4 e non in 1-2.
  assert.equal(voce("1-2").presa, false);
  assert.equal(voce("2-4").presa, true);
  assert.equal(voce("casa 0-1").presa, false);
  assert.equal(voce("casa 1-2").presa, true);
  assert.equal(voce("trasferta 0-1").presa, true);
  // Una scelta per gruppo - i quattro mercati, il multigol di partita e i due di squadra -
  // e deve essere il ramo piu' probabile del suo gruppo.
  assert.equal(p.filter((v) => v.scelta).length, 7);
  assert.equal(voce("uno").scelta, true);
  assert.equal(voce("1X").scelta, true);
  assert.equal(voce("2-4").scelta, true);
  assert.equal(voce("casa 1-2").scelta, true);

  // 0-0: pareggio, nessuno segna, sotto la linea.
  const q = previsioniDi(finti, 0, 0);
  const voceQ = (nome: string) => q.find((v) => v.voce === nome)!;
  assert.equal(voceQ("x").presa, true);
  assert.equal(voceQ("1X").presa, true);
  assert.equal(voceQ("X2").presa, true);
  assert.equal(voceQ("12").presa, false);
  assert.equal(voceQ("Under 2.5").presa, true);
  assert.equal(voceQ("NG").presa, true);
  assert.equal(voceQ("GG").presa, false);
  // Zero gol: nessun intervallo di partita parte da zero, quelli di squadra si'.
  assert.equal(voceQ("1-2").presa, false);
  assert.equal(voceQ("2-4").presa, false);
  assert.equal(voceQ("casa 0-1").presa, true);
  assert.equal(voceQ("casa 1-2").presa, false);
  assert.equal(voceQ("trasferta 0-1").presa, true);

  console.log(
    "prova passata: esito, doppia chance, over/under, gol/nogol e multigol su 2-1 e su 0-0",
  );
  return 0;
}

async function main(): Promise<number> {
  if (process.argv.includes("--prova")) return prova();

  const sql = connessione();
  if (sql === null) {
    console.error("serve IQSTATS_PROJECTION_DATABASE_URL");
    return 1;
  }
  const quante = argomento("gare", 400);
  const insieme = argomento("insieme", 8);

  // La stessa query del banco dei criteri, con due colonne in piu': i gol veri stanno
  // nella riga di casa, `goals_for` per la casa e `goals_against` per l'ospite.
  const righe = await sql<RigaDiGara[]>`
    select g.source_id::text as gara,
           th.source_id::text as casa, ta.source_id::text as fuori,
           s.source_id::text as stagione, c.source_id::text as competizione,
           (select r.source_id from football.referees r where r.id = o.referee_id)::text as arbitro,
           to_char(o.kickoff_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS."000Z"') as kickoff,
           o.coach_source_id::text as allenatore_casa,
           o.opponent_coach_source_id::text as allenatore_fuori,
           o.round_number::text as giornata,
           o.is_derby as derby,
           o.goals_for::text as gol_casa,
           o.goals_against::text as gol_fuori
    from football.team_match_observations o
    join football.matches g on g.id = o.match_id
    join football.teams th on th.id = o.team_id
    join football.teams ta on ta.id = o.opponent_id
    join football.seasons s on s.id = o.season_id
    join football.competitions c on c.id = o.competition_id
    where o.side = 'home'
      and o.goals_for is not null and o.goals_against is not null
    order by o.kickoff_at desc
    limit ${quante}
  `;

  const tutte: Previsione[] = [];
  let conProiezione = 0;
  for (let inizio = 0; inizio < righe.length; inizio += insieme) {
    const lotto = righe.slice(inizio, inizio + insieme);
    const gruppi = await Promise.all(
      lotto.map((r) => previsioniDellaRiga(r).catch(() => [] as readonly Previsione[])),
    );
    for (const gruppo of gruppi) {
      if (gruppo.length > 0) conProiezione += 1;
      tutte.push(...gruppo);
    }
    process.stdout.write(`\r${Math.min(inizio + insieme, righe.length)}/${righe.length} gare`);
  }
  process.stdout.write("\n");

  const MERCATI = [
    "esito", "doppia-chance", "over-under", "gol-nogol",
    "multigol-partita", "multigol-squadra",
  ] as const;
  const perMercato = MERCATI.map((mercato) => {
    const sue = tutte.filter((p) => p.mercato === mercato);
    return {
      mercato,
      // **L'aggregato di tutti i rami non si conta, ed e' una scoperta della prima
      // passata:** i rami di un mercato esaustivo sommano a 1 e uno solo prende, quindi
      // «preso su promesso» su tutti i rami vale 1/k contro 1/k per costruzione - misurato
      // il 12 settembre 2026 su 10 gare: 33,3% su 33,3% l'esito, 66,7% su 66,7% la doppia
      // chance, 50,0% su 50,0% gli altri due. E' un'identita', non una taratura. La
      // taratura di tutti i rami si legge per fascia, dove l'identita' si rompe.
      // Solo il ramo piu' probabile: e' cio' che una pagina dichiarerebbe.
      dichiarato: conta(sue.filter((p) => p.scelta)),
      per_fascia: FASCE.map((f) => ({
        fascia: f.nome,
        ...conta(sue.filter((p) => p.probabilita >= f.da && p.probabilita < f.a)),
      })).filter((v) => v.previsioni !== undefined),
    };
  });

  const rapporto = {
    schema: "consuntivo-gol/1",
    calcolato_il: new Date().toISOString(),
    gare_chieste: quante,
    gare_con_esito: righe.length,
    gare_con_mercati: conProiezione,
    come_e_stato_misurato: (
      "una passata sulle gare chiuse: per ogni gara il motore ricostruisce i mercati dei gol "
      + "con il solo materiale anteriore al calcio d'inizio, e l'esito vero viene dalle stesse "
      + "righe. «dichiarato» conta il solo ramo piu' probabile, che e' cio' che una pagina "
      + "metterebbe in un elenco; «per_fascia» conta tutti i rami raggruppati per probabilita' "
      + "promessa, ed e' li' che si legge la taratura. L'aggregato di tutti i rami non si "
      + "conta: vale 1/k contro 1/k per costruzione. Risultati esatti, matrice e multigol "
      + "restano fuori dal primo giro."
    ),
    mercati: perMercato,
  };

  const uscita = path.resolve(
    process.cwd(), "..", "..", "scripts", "projection", "dataset", "output", "consuntivo-gol.json",
  );
  writeFileSync(uscita, JSON.stringify(rapporto, null, 2) + "\n", "utf8");

  console.log(
    `\n${conProiezione} gare con mercati su ${righe.length} con esito\n`,
  );
  console.log("mercato        | ramo dichiarato: preso su promesso | scarto");
  for (const voce of perMercato) {
    const d = voce.dichiarato;
    const riuscita = d === null
      ? "nessuna previsione        "
      : `${(d.frequenza_osservata * 100).toFixed(1)}% su ${(d.probabilita_promessa * 100).toFixed(1)}% (${d.previsioni})`.padEnd(26);
    const scarto = d === null
      ? "     —"
      : `${d.scarto > 0 ? "+" : ""}${(d.scarto * 100).toFixed(1)} punti`;
    console.log(`${voce.mercato.padEnd(14)} | ${riuscita}         | ${scarto}`);
  }
  console.log(`\nrapporto in ${uscita}`);
  return 0;
}

process.exitCode = await main();
