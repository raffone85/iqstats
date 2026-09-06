// Il consuntivo delle letture forti: quante volte hanno preso, su tutte quelle mostrate.
//
// **Perche' esiste, e perche' e' la meta' obbligatoria della vetrina.** Una vetrina che
// mostra le letture piu' forti in arrivo senza dire come e' andata alle precedenti e' una
// selezione, non una misura: il prodotto di riferimento pubblica solo gli azzeccati fra
// l'88 e il 99 per cento. Qui si contano **tutte** le letture che la regola avrebbe messo
// in cima, prese e sbagliate, e si mette accanto alla promessa la frequenza vera.
//
// **Si puo' fare senza barare, ed e' il motivo per cui non serve conservare niente.** Il
// motore legge soltanto cio' che esisteva prima del calcio d'inizio: il taglio in SQL e'
// `kickoff_at <= calcio d'inizio` e la condizione esatta - gara anteriore, e mai la gara
// stessa - la applica `prima()` in `projection/snapshot.ts`. Quindi la lettura che questo
// script ricostruisce su una gara chiusa e' la stessa che la pagina avrebbe mostrato prima
// di quella gara.
//
// **La regola di selezione non si riscrive.** `candidateDiGara`, `baseDiLega` e
// `ordinaLetture` sono le stesse funzioni che disegnano il dossier: una seconda regola qui
// potrebbe divergere da quella del prodotto, e il consuntivo misurerebbe qualcosa che
// nessuno ha mai visto in pagina.
//
// Nessuna chiamata alla fonte: tutto viene dalle nostre righe.
//
// Uso, con il livello dati locale in ascolto:
//   IQSTATS_PROJECTION_DATABASE_URL=... node --conditions=react-server \
//     --import ./test/risolutore-ts.mjs --experimental-strip-types \
//     scripts/consuntivo-letture.ts [--gare 400] [--insieme 8]
import { writeFileSync } from "node:fs";
import path from "node:path";

import { baseDiLega } from "../src/server/iqstats/base-di-lega.ts";
import { connessione } from "../src/server/iqstats/lettura.ts";
import { proiezioniDellaGara } from "../src/server/iqstats/projection-runtime.ts";
import { candidateDiGara, ordinaLetture } from "../src/server/iqstats/projection/letture-forti.ts";
import { realeDellaGara } from "../src/server/iqstats/verifica.ts";

/** Le fasce di probabilita' su cui si guarda la promessa contro la frequenza. */
const FASCE = [
  { da: 0.5, a: 0.6, nome: "50-60%" },
  { da: 0.6, a: 0.7, nome: "60-70%" },
  { da: 0.7, a: 0.8, nome: "70-80%" },
  { da: 0.8, a: 0.9, nome: "80-90%" },
  { da: 0.9, a: 1.01, nome: "90-100%" },
] as const;

/** Da bersaglio del motore a colonna osservata: gli stessi nomi che `verifica.ts` usa. */
const COLONNA: Readonly<Record<string, string>> = {
  total_shots: "total_shots",
  shots_on_target: "shots_on_target",
  corner_kicks: "corner_kicks",
  fouls: "fouls",
  yellow_cards: "yellow_cards",
  offsides: "offsides",
  goalkeeper_saves: "goalkeeper_saves",
};

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
}

function argomento(nome: string, difetto: number): number {
  const indice = process.argv.indexOf("--" + nome);
  if (indice < 0) return difetto;
  const valore = Number(process.argv[indice + 1]);
  return Number.isFinite(valore) && valore > 0 ? valore : difetto;
}

/** Il valore vero della scala su cui la lettura si pronuncia. */
function valoreVero(
  reale: { casa: Record<string, number | null>; fuori: Record<string, number | null> },
  bersaglio: string,
  lato: "casa" | "trasferta" | "totale",
): number | null {
  const colonna = COLONNA[bersaglio];
  if (colonna === undefined) return null;
  const c = reale.casa[colonna] ?? null;
  const f = reale.fuori[colonna] ?? null;
  if (lato === "casa") return c;
  if (lato === "trasferta") return f;
  return c === null || f === null ? null : c + f;
}

interface Esito {
  readonly bersaglio: string;
  readonly probabilita: number;
  readonly presa: boolean;
}

/** Le letture che la pagina avrebbe messo in cima a quella gara, con il loro esito. */
async function letturePreseDi(riga: RigaDiGara): Promise<readonly Esito[]> {
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

  const { candidate, senzaMisura } = candidateDiGara(proiezioni.bersagli);
  if (candidate.length === 0) return [];
  const basi = await baseDiLega(
    Number(riga.competizione),
    Number(riga.stagione),
    candidate.map((c) => ({ target: c.bersaglio, lato: c.lato, soglia: c.soglia, verso: c.verso })),
  );
  const forti = ordinaLetture(candidate, senzaMisura, basi);
  if (forti.letture.length === 0) return [];

  const reale = await realeDellaGara(Number(riga.gara));
  if (reale === null) return [];

  const esiti: Esito[] = [];
  for (const lettura of forti.letture) {
    const vero = valoreVero(reale, lettura.bersaglio, lettura.lato);
    if (vero === null) continue;
    // Le soglie sono a mezzo punto: il pareggio con la soglia non esiste.
    const sopra = vero > lettura.soglia;
    esiti.push({
      bersaglio: lettura.bersaglio,
      probabilita: lettura.probabilita,
      presa: lettura.verso === "Over" ? sopra : !sopra,
    });
  }
  return esiti;
}

function conta(esiti: readonly Esito[]) {
  if (esiti.length === 0) return null;
  const prese = esiti.filter((e) => e.presa).length;
  const promessa = esiti.reduce((somma, e) => somma + e.probabilita, 0) / esiti.length;
  return {
    letture: esiti.length,
    prese,
    frequenza_osservata: Number((prese / esiti.length).toFixed(4)),
    probabilita_promessa: Number(promessa.toFixed(4)),
    scarto: Number((prese / esiti.length - promessa).toFixed(4)),
  };
}

async function main(): Promise<number> {
  const sql = connessione();
  if (sql === null) {
    console.error("serve IQSTATS_PROJECTION_DATABASE_URL");
    return 1;
  }
  const quante = argomento("gare", 400);
  const insieme = argomento("insieme", 8);

  const righe = await sql<RigaDiGara[]>`
    select g.source_id::text as gara,
           th.source_id::text as casa, ta.source_id::text as fuori,
           s.source_id::text as stagione, c.source_id::text as competizione,
           o.referee_id::text as arbitro,
           to_char(o.kickoff_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS."000Z"') as kickoff,
           o.coach_source_id::text as allenatore_casa,
           o.opponent_coach_source_id::text as allenatore_fuori,
           o.round_number::text as giornata,
           o.is_derby as derby
    from football.team_match_observations o
    join football.matches g on g.id = o.match_id
    join football.teams th on th.id = o.team_id
    join football.teams ta on ta.id = o.opponent_id
    join football.seasons s on s.id = o.season_id
    join football.competitions c on c.id = o.competition_id
    where o.side = 'home'
    order by o.kickoff_at desc
    limit ${quante}
  `;

  const tutti: Esito[] = [];
  let gareLette = 0;
  for (let inizio = 0; inizio < righe.length; inizio += insieme) {
    const lotto = righe.slice(inizio, inizio + insieme);
    const esiti = await Promise.all(lotto.map((r) => letturePreseDi(r).catch(() => [])));
    for (const gruppo of esiti) {
      if (gruppo.length > 0) gareLette += 1;
      tutti.push(...gruppo);
    }
    process.stdout.write(`\r${Math.min(inizio + insieme, righe.length)}/${righe.length} gare`);
  }
  process.stdout.write("\n");

  const complessivo = conta(tutti);
  if (complessivo === null) {
    console.error("nessuna lettura ricostruita: il consuntivo non si scrive vuoto");
    return 1;
  }

  const perFascia = FASCE.map((f) => ({
    fascia: f.nome,
    ...conta(tutti.filter((e) => e.probabilita >= f.da && e.probabilita < f.a)),
  })).filter((v) => v.letture !== undefined);

  const bersagli = [...new Set(tutti.map((e) => e.bersaglio))].sort();
  const perBersaglio = bersagli
    .map((b) => ({ bersaglio: b, ...conta(tutti.filter((e) => e.bersaglio === b)) }))
    .filter((v) => v.letture !== undefined);

  const rapporto = {
    schema: "consuntivo-letture/1",
    calcolato_il: new Date().toISOString(),
    gare_chieste: quante,
    gare_con_almeno_una_lettura: gareLette,
    come_e_stato_misurato: (
      "le stesse funzioni che disegnano il dossier - candidateDiGara, baseDiLega, "
      + "ordinaLetture - rifatte girare sulle gare chiuse; il motore legge solo cio' che "
      + "esisteva prima del calcio d'inizio, quindi la lettura ricostruita e' quella che la "
      + "pagina avrebbe mostrato. Contate tutte, prese e sbagliate: nessuna selezione."
    ),
    complessivo,
    per_fascia: perFascia,
    per_bersaglio: perBersaglio,
  };

  const percorso = path.join(
    import.meta.dirname, "..", "src", "server", "iqstats", "artefatti", "consuntivo-letture.json",
  );
  writeFileSync(percorso, JSON.stringify(rapporto, null, 2) + "\n", "utf8");
  console.log(
    `${complessivo.letture} letture su ${gareLette} gare · prese ${complessivo.prese}`
    + ` (${(complessivo.frequenza_osservata * 100).toFixed(1)}%)`
    + ` contro il ${(complessivo.probabilita_promessa * 100).toFixed(1)}% promesso`,
  );
  for (const v of perFascia) {
    console.log(
      `  ${v.fascia}: ${v.prese}/${v.letture} = ${((v.frequenza_osservata ?? 0) * 100).toFixed(1)}%`
      + ` contro ${((v.probabilita_promessa ?? 0) * 100).toFixed(1)}%`,
    );
  }
  console.log(percorso);
  return 0;
}

process.exit(await main());
