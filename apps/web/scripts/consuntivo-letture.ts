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
import {
  candidateDiGara, consigliDiGara, ordinaLetture,
} from "../src/server/iqstats/projection/letture-forti.ts";
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
  /** La gara da cui viene: serve a scegliere un consigliato per gara, non uno per lettura. */
  readonly gara: string;
  /** Il calcio d'inizio: serve a dividere il campione nel tempo, non a caso. */
  readonly kickoff: string;
  readonly bersaglio: string;
  readonly probabilita: number;
  readonly presa: boolean;
  /** Vera per le candidate sopra l'ottanta per cento, che il tetto tiene fuori dalle letture. */
  readonly fuoriFascia: boolean;
  /** 1 per la prima lettura della gara, 2 per la seconda...; `null` fuori fascia. */
  readonly posizione: number | null;
  /** Il posto fra «i consigli» di quella gara, `null` se il criterio non la consiglia. */
  readonly posizioneConsiglio: number | null;
  /** Punti di distacco dalla norma del campionato; `null` se la lega non ha una base. */
  readonly scarto: number | null;
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
  // **Otto invece di quattro.** `QUANTE` vale 4 e la quinta lettura non e' mai esistita
  // in questa misura: «i consigli» ne mostrano fino a 6, e senza allargare qui la loro
  // resa oltre la quarta posizione resterebbe non misurata.
  const forti = ordinaLetture(candidate, senzaMisura, basi, null, null, 8);
  if (forti.letture.length === 0) return [];

  const reale = await realeDellaGara(Number(riga.gara));
  if (reale === null) return [];

  // Il posto fra i consigli lo decide la stessa funzione della pagina, non una regola
  // riscritta qui. Senza quote non ci sono esiti 1X2 da passare: e' il limite di questa
  // misura, e i consigli veri possono avere qualche posizione in piu'.
  const consigli = consigliDiGara(forti.letture, [], null);

  const esiti: Esito[] = [];
  for (const [indice, lettura] of forti.letture.entries()) {
    const vero = valoreVero(reale, lettura.bersaglio, lettura.lato);
    if (vero === null) continue;
    // Le soglie sono a mezzo punto: il pareggio con la soglia non esiste.
    const sopra = vero > lettura.soglia;
    esiti.push({
      gara: riga.gara,
      kickoff: riga.kickoff,
      bersaglio: lettura.bersaglio,
      probabilita: lettura.probabilita,
      presa: lettura.verso === "Over" ? sopra : !sopra,
      fuoriFascia: false,
      posizione: indice + 1,
      posizioneConsiglio: (() => {
        const posto = consigli.findIndex((c) => c.lettura === lettura);
        return posto < 0 ? null : posto + 1;
      })(),
      scarto: lettura.base === null
        ? null
        : Number((lettura.probabilita * 100 - lettura.base).toFixed(2)),
    });
  }

  // **Le candidate che il tetto dell'ottanta per cento lascia fuori, contate lo stesso.**
  // Il prodotto dichiara in due pagine che sopra quella soglia il modello promette piu' di
  // quanto rende, ed e' la ragione per cui il tetto esiste: quel numero deve uscire da
  // questo artefatto, non da un commento in uno script di confronto. Sono candidate, non
  // letture: non finiscono in cima a nessuna gara, e restano contate a parte.
  for (const candidata of candidate) {
    if (candidata.probabilita <= 0.8) continue;
    const vero = valoreVero(reale, candidata.bersaglio, candidata.lato);
    if (vero === null) continue;
    const sopra = vero > candidata.soglia;
    esiti.push({
      gara: riga.gara,
      kickoff: riga.kickoff,
      bersaglio: candidata.bersaglio,
      probabilita: candidata.probabilita,
      presa: candidata.verso === "Over" ? sopra : !sopra,
      fuoriFascia: true,
      posizione: null,
      posizioneConsiglio: null,
      scarto: null,
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
           -- Il source_id, non la chiave interna: o.referee_id punta a
           -- football.referees.id, mentre il motore risolve l'arbitro per source_id.
           -- Passandogli l'uno per l'altro la risoluzione non trovava mai nessuno e ogni
           -- gara veniva ricostruita senza arbitro; falli, cartellini gialli e tiri in
           -- porta ripiegano quando l'arbitro manca, e infatti non comparivano in
           -- nessuna delle letture misurate.
           (select r.source_id from football.referees r where r.id = o.referee_id)::text as arbitro,
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

  const dentro = tutti.filter((e) => !e.fuoriFascia);
  const oltre = tutti.filter((e) => e.fuoriFascia);
  const complessivo = conta(dentro);
  if (complessivo === null) {
    console.error("nessuna lettura ricostruita: il consuntivo non si scrive vuoto");
    return 1;
  }

  const perFascia = FASCE.map((f) => ({
    fascia: f.nome,
    ...conta(dentro.filter((e) => e.probabilita >= f.da && e.probabilita < f.a)),
  })).filter((v) => v.letture !== undefined);

  // **Rende la seconda lettura di una gara quanto la prima?** Serve a «i consigli», che
  // mostrano piu' letture per gara: se la terza promette 70 e rende 60 va detto, o tolta.
  const posti = [1, 2, 3, 4, 5, 6, 7, 8];
  const perPosizione = posti
    .map((p) => ({ posizione: p, ...conta(dentro.filter((e) => e.posizione === p)) }))
    .filter((v) => v.letture !== undefined);

  // **Il criterio sceglie per distacco dalla norma: quel distacco rende?** Se la resa cala
  // man mano che lo scarto cresce, selezionare lo scarto e' selezionare sovra-confidenza,
  // e la promessa dei consigli esce alta per costruzione.
  const FASCE_SCARTO = [
    { da: -1e9, a: 0, nome: "sotto la norma" },
    { da: 0, a: 5, nome: "0-5 (fuori dal criterio)" },
    { da: 5, a: 10, nome: "5-10" },
    { da: 10, a: 15, nome: "10-15" },
    { da: 15, a: 1e9, nome: "oltre 15" },
  ];
  const perScarto = FASCE_SCARTO
    .map((f) => ({
      // `conta()` restituisce a sua volta un campo `scarto`: questo nome deve restare diverso.
      fascia_scarto: f.nome,
      ...conta(dentro.filter((e) => e.scarto !== null && e.scarto >= f.da && e.scarto < f.a)),
    }))
    .filter((v) => v.letture !== undefined);
  const senzaBase = conta(dentro.filter((e) => e.scarto === null));

  // **E se lo scarto avesse un tetto?** Le letture che si staccano di piu' dalla norma
  // rendono meno di quanto promettono: qui si simula il consigliato che uscirebbe tenendo
  // solo gli scarti sotto un tetto, e si guarda anche quante gare resterebbero senza.
  // Misura, non modifica: il criterio del prodotto resta quello.
  const gare = [...new Set(dentro.map((e) => e.gara))];
  const conTetto = [999, 20, 15, 12, 10].map((tetto) => {
    const scelti = gare
      .map((g) => dentro
        .filter((e) => e.gara === g && e.posizioneConsiglio !== null
          && e.scarto !== null && e.scarto <= tetto)
        .sort((a, b) => (a.posizioneConsiglio ?? 0) - (b.posizioneConsiglio ?? 0))[0])
      .filter((e): e is Esito => e !== undefined);
    return {
      tetto: tetto === 999 ? "nessuno" : `${tetto} punti`,
      gare_consigliate: scelti.length,
      ...conta(scelti),
    };
  }).filter((v) => v.letture !== undefined);

  // **La resa di un consiglio, al posto in cui la pagina lo mostra.** Non e' la stessa cosa
  // della riga sopra: fra le letture ordinate solo alcune passano il criterio, e il terzo
  // consiglio puo' essere la sesta lettura.
  const perPosizioneConsiglio = posti
    .map((p) => ({ posizione: p, ...conta(dentro.filter((e) => e.posizioneConsiglio === p)) }))
    .filter((v) => v.letture !== undefined);

  const bersagli = [...new Set(dentro.map((e) => e.bersaglio))].sort();
  const perBersaglio = bersagli
    .map((b) => ({ bersaglio: b, ...conta(dentro.filter((e) => e.bersaglio === b)) }))
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
    per_posizione: perPosizione,
    per_posizione_consiglio: perPosizioneConsiglio,
    per_scarto: perScarto,
    consigliato_con_tetto: conTetto,
    senza_base_di_lega: senzaBase,
    limite_dei_consigli: (
      "senza quote storiche gli esiti 1X2 non entrano in questa misura: i consigli qui "
      + "sono le sole linee che passano il criterio, e in pagina possono essere di piu'."
    ),
    per_bersaglio: perBersaglio,
    // Le candidate sopra l'ottanta per cento: non entrano in nessuna lettura, e sono la
    // ragione misurata per cui il tetto sta li'.
    oltre_la_fascia: conta(oltre),
  };

  const percorso = path.join(
    import.meta.dirname, "..", "src", "server", "iqstats", "artefatti", "consuntivo-letture.json",
  );
  writeFileSync(percorso, JSON.stringify(rapporto, null, 2) + "\n", "utf8");
  // Con `--dettaglio <file>` esce anche la riga per riga, che il rapporto aggregato non
  // conserva: serve a studiare una calibrazione fuori campione senza rifare la corsa.
  const dettaglio = process.argv.indexOf("--dettaglio");
  if (dettaglio >= 0 && process.argv[dettaglio + 1]) {
    writeFileSync(process.argv[dettaglio + 1], JSON.stringify(tutti) + "\n", "utf8");
  }
  console.log(
    `${complessivo.letture} letture su ${gareLette} gare · prese ${complessivo.prese}`
    + ` (${(complessivo.frequenza_osservata * 100).toFixed(1)}%)`
    + ` contro il ${(complessivo.probabilita_promessa * 100).toFixed(1)}% promesso`,
  );
  const fuori = conta(oltre);
  if (fuori !== null) {
    console.log(
      `oltre l'80%: ${fuori.prese}/${fuori.letture} = `
      + `${(fuori.frequenza_osservata * 100).toFixed(1)}% contro `
      + `${(fuori.probabilita_promessa * 100).toFixed(1)}% promesso`,
    );
  }
  for (const v of perFascia) {
    console.log(
      `  ${v.fascia}: ${v.prese}/${v.letture} = ${((v.frequenza_osservata ?? 0) * 100).toFixed(1)}%`
      + ` contro ${((v.probabilita_promessa ?? 0) * 100).toFixed(1)}%`,
    );
  }
  for (const v of perPosizione) {
    console.log(
      `  lettura n. ${v.posizione}: ${v.prese}/${v.letture} = `
      + `${((v.frequenza_osservata ?? 0) * 100).toFixed(1)}% contro ${((v.probabilita_promessa ?? 0) * 100).toFixed(1)}%`,
    );
  }
  for (const v of perScarto) {
    console.log(
      `  scarto ${v.fascia_scarto}: ${v.prese}/${v.letture} = `
      + `${((v.frequenza_osservata ?? 0) * 100).toFixed(1)}% contro ${((v.probabilita_promessa ?? 0) * 100).toFixed(1)}%`,
    );
  }
  if (senzaBase !== null) {
    console.log(
      `  senza base di lega: ${senzaBase.prese}/${senzaBase.letture} = `
      + `${(senzaBase.frequenza_osservata * 100).toFixed(1)}% contro `
      + `${(senzaBase.probabilita_promessa * 100).toFixed(1)}%`,
    );
  }
  for (const v of conTetto) {
    console.log(
      `  tetto ${v.tetto}: ${v.prese}/${v.letture} = `
      + `${((v.frequenza_osservata ?? 0) * 100).toFixed(1)}% contro `
      + `${((v.probabilita_promessa ?? 0) * 100).toFixed(1)}% · ${v.gare_consigliate} gare`,
    );
  }
  for (const v of perPosizioneConsiglio) {
    console.log(
      `  consiglio n. ${v.posizione}: ${v.prese}/${v.letture} = `
      + `${((v.frequenza_osservata ?? 0) * 100).toFixed(1)}% contro ${((v.probabilita_promessa ?? 0) * 100).toFixed(1)}%`,
    );
  }
  console.log(percorso);
  return 0;
}

process.exit(await main());
