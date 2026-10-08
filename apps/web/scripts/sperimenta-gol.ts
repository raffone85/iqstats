// Il modello dei gol, varianti a confronto: quale prevede meglio, fuori campione?
//
// **Perche' esiste.** `consuntivo-valore.ts` ha misurato l'8 ottobre 2026 che sui gol il
// prezzo del banco batte il nostro modello (Brier 0,1624 contro 0,1718) e che combinarli non
// aggiunge niente. Il modello di `projection-runtime.ts` usa solo la stagione in corso e solo
// lo stesso lato del campo, ancorato alla lega con 4 gare fittizie: a ottobre sono 3-5 gare.
//
// Sola lettura, nessuna chiamata al motore: le reti di ogni squadra prima di ogni calcio
// d'inizio, in ordine di tempo, e per ogni variante le probabilita' di 1X2, Over 2,5 e
// Gol/NoGol dalle stesse due Poisson del motore (`distribuzioniDeiGol`). Varianti:
// - `ancora`: le gare fittizie verso la media di lega;
// - `lati`: «stesso» (come oggi) o «tutti» (forza su tutte le gare, campo dal metro di lega);
// - `passata`: quanto pesa ogni gara della stagione precedente nella stessa competizione.
// Il punteggio e' la log-loss media dei tre mercati, sulle gare dove **tutte** le varianti
// rispondono, scelta sul primo periodo e provata sul secondo.
//
// Uso, con il livello dati in ascolto:
//   node --conditions=react-server --import ./test/risolutore-ts.mjs --experimental-strip-types \
//     scripts/sperimenta-gol.ts [letture.json di consuntivo-valore.ts --letture]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { connessione } from "../src/server/iqstats/lettura.ts";
import { distribuzioniDeiGol } from "../src/server/iqstats/projection/gol.ts";

interface Riga {
  readonly gara: string;
  readonly competizione: number;
  readonly stagione: number;
  readonly inizio: number;
  readonly kickoff: string;
  readonly casa: number;
  readonly fuori: number;
  readonly gol_casa: number;
  readonly gol_fuori: number;
}

interface Variante {
  readonly ancora: number;
  readonly lati: "stesso" | "tutti";
  readonly passata: number;
}

const VARIANTI: readonly Variante[] = [2, 4, 8, 12, 16, 24, 32, 48].flatMap((ancora) =>
  (["stesso", "tutti"] as const).flatMap((lati) =>
    [0, 0.5, 1].map((passata) => ({ ancora, lati, passata }))));
const ATTUALE: Variante = { ancora: 4, lati: "stesso", passata: 0 };
const nome = (v: Variante) => `ancora ${v.ancora} · ${v.lati} · passata ${v.passata}`;

/** Le somme progressive: gol fatti, subiti e gare, per lato e in tutto. */
class Somme {
  private readonly mappa = new Map<string, { fatti: number; subiti: number; gare: number }>();
  aggiungi(chiave: string, fatti: number, subiti: number): void {
    const s = this.mappa.get(chiave) ?? { fatti: 0, subiti: 0, gare: 0 };
    s.fatti += fatti;
    s.subiti += subiti;
    s.gare += 1;
    this.mappa.set(chiave, s);
  }
  leggi(chiave: string) {
    return this.mappa.get(chiave) ?? { fatti: 0, subiti: 0, gare: 0 };
  }
}

/** La probabilita' dei tre mercati dai gol attesi, con le Poisson del motore. */
function mercati(casa: number, fuori: number) {
  const p = distribuzioniDeiGol(casa, fuori);
  let uno = 0;
  let x = 0;
  for (let i = 0; i < p.casa.length; i += 1) {
    for (let j = 0; j < p.trasferta.length; j += 1) {
      if (i > j) uno += p.casa[i] * p.trasferta[j];
      else if (i === j) x += p.casa[i] * p.trasferta[j];
    }
  }
  const sottoTre = p.totale[0] + p.totale[1] + p.totale[2];
  return { uno, x, due: 1 - uno - x, over25: 1 - sottoTre, gg: (1 - p.casa[0]) * (1 - p.trasferta[0]) };
}

const ln = (p: number) => Math.log(Math.min(Math.max(p, 1e-6), 1 - 1e-6));

function perdita(m: ReturnType<typeof mercati>, r: Riga): number {
  const esito = r.gol_casa > r.gol_fuori ? m.uno : r.gol_casa === r.gol_fuori ? m.x : m.due;
  const over = r.gol_casa + r.gol_fuori > 2.5;
  const gg = r.gol_casa > 0 && r.gol_fuori > 0;
  return (-ln(esito) - ln(over ? m.over25 : 1 - m.over25) - ln(gg ? m.gg : 1 - m.gg)) / 3;
}

async function main(): Promise<number> {
  const sql = connessione();
  if (sql === null) {
    console.error("serve IQSTATS_PROJECTION_DATABASE_URL");
    return 1;
  }
  const righe = await sql<Riga[]>`
    select g.source_id::text as gara, o.competition_id::int as competizione,
           o.season_id::int as stagione,
           (extract(epoch from o.kickoff_at) * 1000)::float8 as inizio,
           to_char(o.kickoff_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS."000Z"') as kickoff,
           o.team_id::int as casa, o.opponent_id::int as fuori,
           o.goals_for::int as gol_casa, o.goals_against::int as gol_fuori
    from football.team_match_observations o
    join football.matches g on g.id = o.match_id
    where o.side = 'home' and o.goals_for is not null and o.goals_against is not null
      and o.kickoff_at < now()
    order by o.kickoff_at
  `;
  // La stagione precedente della stessa competizione, per data d'inizio.
  const stagioni = await sql<{ id: number; precedente: number | null }[]>`
    select id::int as id,
           (lag(id) over (partition by competition_id order by starts_on))::int as precedente
    from football.seasons
  `;
  await sql.end();
  const precedente = new Map(stagioni.map((s) => [s.id, s.precedente]));

  const somme = new Somme();
  const perVariante = VARIANTI.map(() => [] as { r: Riga; m: ReturnType<typeof mercati> }[]);
  let i = 0;
  while (i < righe.length) {
    // Le gare dello stesso istante si leggono tutte prima di aggiornare: nessuna vede l'altra.
    let j = i;
    while (j < righe.length && righe[j].inizio === righe[i].inizio) j += 1;
    for (const r of righe.slice(i, j)) {
      // Il metro di lega della stagione: gol della casa e della trasferta, dalle gare chiuse.
      const legaCasa = somme.leggi(`L|${r.competizione}|${r.stagione}`);
      // Il motore chiede il metro e tre gare per lato: stessa soglia per tutte le varianti.
      if (legaCasa.gare === 0) continue;
      const metroCasa = legaCasa.fatti / legaCasa.gare; // gol della squadra di casa
      const metroFuori = legaCasa.subiti / legaCasa.gare; // gol della squadra in trasferta
      const metroTutti = (metroCasa + metroFuori) / 2;
      const cS = somme.leggi(`S|${r.casa}|${r.stagione}|casa`);
      const fS = somme.leggi(`S|${r.fuori}|${r.stagione}|fuori`);
      if (cS.gare < 3 || fS.gare < 3) continue;

      VARIANTI.forEach((v, k) => {
        const forza = (squadra: number, lato: "casa" | "fuori") => {
          const prima = precedente.get(r.stagione) ?? null;
          const leggi = (stagione: number | null, quale: string) =>
            stagione === null ? { fatti: 0, subiti: 0, gare: 0 } : somme.leggi(`S|${squadra}|${stagione}|${quale}`);
          const unisci = (a: ReturnType<typeof leggi>, b: ReturnType<typeof leggi>) =>
            ({ fatti: a.fatti + b.fatti, subiti: a.subiti + b.subiti, gare: a.gare + b.gare });
          const qui = v.lati === "stesso"
            ? leggi(r.stagione, lato)
            : unisci(leggi(r.stagione, "casa"), leggi(r.stagione, "fuori"));
          const allora = v.lati === "stesso"
            ? leggi(prima, lato)
            : unisci(leggi(prima, "casa"), leggi(prima, "fuori"));
          const gare = qui.gare + v.passata * allora.gare;
          const fatti = qui.fatti + v.passata * allora.fatti;
          const subiti = qui.subiti + v.passata * allora.subiti;
          // Il metro di riferimento: quello del lato, o la media dei due lati.
          const metroFatti = v.lati === "stesso" ? (lato === "casa" ? metroCasa : metroFuori) : metroTutti;
          const metroSubiti = v.lati === "stesso" ? (lato === "casa" ? metroFuori : metroCasa) : metroTutti;
          const peso = gare / (gare + v.ancora);
          return {
            attacco: (peso * (gare === 0 ? 0 : fatti / gare) + (1 - peso) * metroFatti) / metroFatti,
            difesa: (peso * (gare === 0 ? 0 : subiti / gare) + (1 - peso) * metroSubiti) / metroSubiti,
          };
        };
        const c = forza(r.casa, "casa");
        const f = forza(r.fuori, "fuori");
        // Forze relative al metro, moltiplicate per il metro del lato: il campo sta li'.
        perVariante[k].push({ r, m: mercati(c.attacco * f.difesa * metroCasa, f.attacco * c.difesa * metroFuori) });
      });
    }
    for (const r of righe.slice(i, j)) {
      somme.aggiungi(`L|${r.competizione}|${r.stagione}`, r.gol_casa, r.gol_fuori);
      somme.aggiungi(`S|${r.casa}|${r.stagione}|casa`, r.gol_casa, r.gol_fuori);
      somme.aggiungi(`S|${r.fuori}|${r.stagione}|fuori`, r.gol_fuori, r.gol_casa);
    }
    i = j;
  }

  const gare = perVariante[0].map((x) => x.r);
  const taglio = gare[Math.floor(gare.length / 2)].kickoff;
  const media = (xs: readonly { r: Riga; m: ReturnType<typeof mercati> }[], dove: (r: Riga) => boolean) => {
    const dentro = xs.filter((x) => dove(x.r));
    return dentro.reduce((s, x) => s + perdita(x.m, x.r), 0) / dentro.length;
  };
  const p1 = (r: Riga) => r.kickoff < taglio;
  const p2 = (r: Riga) => r.kickoff >= taglio;
  const classifica = VARIANTI.map((v, k) => ({
    variante: nome(v),
    periodo_1: Number(media(perVariante[k], p1).toFixed(5)),
    periodo_2: Number(media(perVariante[k], p2).toFixed(5)),
  }));
  const kAttuale = VARIANTI.findIndex((v) => nome(v) === nome(ATTUALE));
  const kMigliore = classifica.reduce((m, c, k) => (c.periodo_1 < classifica[m].periodo_1 ? k : m), 0);

  // Contro il banco: le stesse voci di `consuntivo-valore.ts`, sulle gare dell'archivio.
  let controIlBanco: Record<string, unknown> | null = null;
  const file = process.argv[2];
  if (file !== undefined) {
    const letture = (JSON.parse(readFileSync(file, "utf8")) as {
      gara: string; bersaglio: string; verso: string; soglia: number; implicita: number; presa: 1 | 0 | null;
    }[]).filter((l) => l.presa !== null && (
      l.bersaglio === "gol-1x2" || l.bersaglio === "gol-gg-ng"
      || (l.bersaglio === "gol-over-under" && l.soglia === 2.5)));
    const probDi = (k: number) => new Map(perVariante[k].map((x) => [x.r.gara, x.m]));
    const brier = (prob: (l: (typeof letture)[number]) => number | null) => {
      let s = 0;
      let n = 0;
      for (const l of letture) {
        const p = prob(l);
        if (p === null) continue;
        s += (p - (l.presa as number)) ** 2;
        n += 1;
      }
      return { voci: n, brier: Number((s / n).toFixed(5)) };
    };
    const daMercati = (mappa: Map<string, ReturnType<typeof mercati>>) => (l: (typeof letture)[number]) => {
      const m = mappa.get(l.gara);
      if (m === undefined) return null;
      if (l.bersaglio === "gol-1x2") return l.verso === "1" ? m.uno : l.verso === "X" ? m.x : m.due;
      if (l.bersaglio === "gol-gg-ng") return l.verso === "Sì" ? m.gg : 1 - m.gg;
      return l.verso === "Over" ? m.over25 : 1 - m.over25;
    };
    const attuale = probDi(kAttuale);
    const migliore = probDi(kMigliore);
    const comuni = (l: (typeof letture)[number]) => attuale.has(l.gara) && migliore.has(l.gara);
    controIlBanco = {
      attuale: brier((l) => (comuni(l) ? daMercati(attuale)(l) : null)),
      migliore: brier((l) => (comuni(l) ? daMercati(migliore)(l) : null)),
      banco: brier((l) => (comuni(l) ? l.implicita : null)),
    };
  }

  const rapporto = {
    generato_il: new Date().toISOString(),
    gare: gare.length,
    taglio_dei_periodi: taglio,
    attuale: classifica[kAttuale],
    migliore_sul_periodo_1: classifica[kMigliore],
    contro_il_banco: controIlBanco,
    classifica: [...classifica].sort((a, b) => a.periodo_1 - b.periodo_1),
  };
  writeFileSync(path.join(import.meta.dirname, "..", "..", "..", "scripts", "projection", "dataset",
    "output", "sperimenta-gol.json"), `${JSON.stringify(rapporto, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...rapporto, classifica: rapporto.classifica.slice(0, 8) }, null, 1));
  return 0;
}

process.exitCode = await main();
