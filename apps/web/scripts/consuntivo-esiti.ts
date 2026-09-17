// Il consuntivo dell'1X2 di famiglia: chi ne fa di piu', promesso contro preso.
//
// **Perche' esiste.** Il consigliato di Expected puo' essere un esito 1X2 di famiglia dal 17
// settembre 2026, e un pronostico senza la sua resa sulle gare chiuse e' una promessa. Qui si
// ricostruisce, su gare gia' giocate e con i soli dati anteriori al calcio d'inizio, l'esito
// piu' probabile di ogni famiglia e si conta quante volte ha preso: tutte, prese e sbagliate.
//
// La base di lega e' la frequenza dell'esito nella stessa competizione e stagione, sulle gare
// anteriori (minimo 20); l'arbitro concorde e' quello della regola dei falli.
//
// Uso, con il livello dati locale in ascolto, a blocchi sotto i dieci minuti:
//   node --conditions=react-server --import ./test/risolutore-ts.mjs --experimental-strip-types //     scripts/consuntivo-esiti.ts --gare 600 --da 0     (poi --da 600, poi --somma)
const { connessione } = await import("../src/server/iqstats/lettura.ts");
const { proiezioniDellaGara } = await import("../src/server/iqstats/projection-runtime.ts");
const { appendFileSync, readFileSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");

const FAMIGLIE = ["total_shots", "shots_on_target", "fouls", "corner_kicks", "offsides", "yellow_cards"] as const;
const arg = (n: string, d: number) => { const i = process.argv.indexOf("--" + n); return i < 0 ? d : Number(process.argv[i + 1]); };
const somma = process.argv.includes("--somma");
const FILE = tmpdir() + "/iqstats-consuntivo-esiti.jsonl";

/** Una riga del livello dati: i conteggi arrivano come float, gli identificativi come testo. */
type Riga = Record<string, string | number | boolean | null>;

interface Esito { fam: string; esito: "1" | "X" | "2"; p: number; presa: boolean; base: number | null; arbitro: "concorde" | "discorde" | "senza" }
const esiti: Esito[] = [];

if (!somma) {
  const sql = connessione()!;
  const righe = await sql`
    select g.source_id::text as gara, th.source_id::text as casa, ta.source_id::text as fuori,
           s.source_id::text as stagione, o.competition_id::text as comp, o.season_id::text as sid,
           o.referee_id::text as arb_id,
           (select r.source_id from football.referees r where r.id = o.referee_id)::text as arbitro,
           to_char(o.kickoff_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS."000Z"') as kickoff,
           o.coach_source_id::text as allenatore_casa, o.opponent_coach_source_id::text as allenatore_fuori,
           o.round_number::text as giornata, o.is_derby as derby,
           ${sql.unsafe(FAMIGLIE.map((f) => `o.${f}::float as c_${f}, a.${f}::float as t_${f}`).join(", "))}
    from football.team_match_observations o
    join football.team_match_observations a on a.match_id = o.match_id and a.side = 'away'
    join football.matches g on g.id = o.match_id
    join football.teams th on th.id = o.team_id
    join football.teams ta on ta.id = o.opponent_id
    join football.seasons s on s.id = o.season_id
    where o.side = 'home'
    order by o.kickoff_at desc
    limit ${arg("gare", 400)} offset ${arg("da", 0)}`;
  // Tutte le gare, per base di lega (stessa competizione e stagione) e storia dell'arbitro.
  const storia = (await sql`
    select o.competition_id::text as comp, o.season_id::text as sid, o.referee_id::text as arb,
           extract(epoch from o.kickoff_at) * 1000 as quando,
           ${sql.unsafe(FAMIGLIE.map((f) => `o.${f}::float as c_${f}, a.${f}::float as t_${f}`).join(", "))}
    from football.team_match_observations o
    join football.team_match_observations a on a.match_id = o.match_id and a.side = 'away'
    where o.side = 'home'`).map((r: Riga) => ({ ...r, quando: Number(r.quando) }));

  const misura = async (r: Riga) => {
    const pro = await proiezioniDellaGara({
      homeTeamId: Number(r.casa), awayTeamId: Number(r.fuori), seasonId: Number(r.stagione),
      refereeId: r.arbitro === null ? null : Number(r.arbitro), kickoff: String(r.kickoff),
      homeCoachId: r.allenatore_casa === null ? null : Number(r.allenatore_casa),
      awayCoachId: r.allenatore_fuori === null ? null : Number(r.allenatore_fuori),
      roundNumber: r.giornata === null ? null : Number(r.giornata), roundName: null, isLocalDerby: typeof r.derby === "boolean" ? r.derby : null,
    });
    if (typeof pro === "string") return;
    const t = new Date(String(r.kickoff)).getTime();
    const prima = storia.filter((x: Riga) => Number(x.quando) < t && x.comp === r.comp);
    for (const b of pro.bersagli) {
      const f = b.target as string;
      if (!(FAMIGLIE as readonly string[]).includes(f) || !b.esito) continue;
      if (r["c_" + f] === null || r["t_" + f] === null) continue;
      const vc = Number(r["c_" + f]), vt = Number(r["t_" + f]);
      const scelte = [["1", b.esito.uno], ["X", b.esito.x], ["2", b.esito.due]] as const;
      const [esito, p] = scelte.reduce((m, s) => (s[1] > m[1] ? s : m));
      const vero = vc > vt ? "1" : vc === vt ? "X" : "2";
      const lega = prima.filter((x: Riga) => x.sid === r.sid && x["c_" + f] !== null && x["t_" + f] !== null);
      const conta = (xs: Riga[]) => xs.filter((x) => (Number(x["c_" + f]) > Number(x["t_" + f]) ? "1" : Number(x["c_" + f]) === Number(x["t_" + f]) ? "X" : "2") === esito).length;
      const base = lega.length >= 20 ? (conta(lega) / lega.length) * 100 : null;
      let arbitro: Esito["arbitro"] = "senza";
      if (f === "fouls" && esito !== "X" && r.arb_id !== null) {
        const sue = prima.filter((x: Riga) => x.arb === r.arb_id && x.c_fouls !== null && x.t_fouls !== null);
        const tutte = prima.filter((x: Riga) => x.c_fouls !== null && x.t_fouls !== null);
        if (sue.length >= 5 && tutte.length > 0) {
          const d = (xs: Riga[]) => xs.reduce((s, x) => s + Number(x.c_fouls) - Number(x.t_fouls), 0) / xs.length;
          arbitro = (d(sue) - d(tutte) > 0) === (esito === "1") ? "concorde" : "discorde";
        }
      }
      esiti.push({ fam: f, esito, p, presa: esito === vero, base, arbitro });
    }
  };
  const righeA = righe as unknown as Riga[];
  const insieme = arg("insieme", 6);
  for (let i = 0; i < righeA.length; i += insieme) {
    await Promise.all(righeA.slice(i, i + insieme).map((r) => misura(r).catch(() => undefined)));
    process.stdout.write(`\r${Math.min(i + insieme, righeA.length)}/${righeA.length}`);
  }
  appendFileSync(FILE, esiti.map((e) => JSON.stringify(e) + "\n").join(""));
  console.log(`\n${esiti.length} esiti`);
  process.exit(0);
}

esiti.push(...readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l)));
const conta = (xs: Esito[]) => (xs.length === 0 ? null : {
  letture: xs.length,
  prese: xs.filter((x) => x.presa).length,
  frequenza_osservata: Number((xs.filter((x) => x.presa).length / xs.length).toFixed(4)),
  probabilita_promessa: Number((xs.reduce((s, x) => s + x.p, 0) / xs.length).toFixed(4)),
});
const consigliabili = esiti.filter((e) => e.p <= 0.8 && e.base !== null && e.p * 100 - e.base >= 5);
const rapporto = {
  schema: "consuntivo-esiti/1",
  calcolato_il: new Date().toISOString(),
  come_e_stato_misurato: (
    "esito 1X2 piu' probabile di ogni famiglia, ricostruito sulle gare chiuse con i soli dati "
    + "anteriori; contate le letture consigliabili (fino all'80%, cinque punti sopra la "
    + "frequenza della lega nella stessa stagione), prese e sbagliate"
  ),
  complessivo: conta(consigliabili),
  per_bersaglio: FAMIGLIE.map((f) => ({ bersaglio: f, ...conta(consigliabili.filter((e) => e.fam === f)) })),
  falli_arbitro_concorde: conta(consigliabili.filter((e) => e.fam === "fouls" && e.arbitro === "concorde")),
  falli_arbitro_discorde: conta(consigliabili.filter((e) => e.fam === "fouls" && e.arbitro === "discorde")),
};
const percorso = import.meta.dirname + "/../src/server/iqstats/artefatti/consuntivo-esiti.json";
writeFileSync(percorso, JSON.stringify(rapporto, null, 2) + "\n", "utf8");
console.log(JSON.stringify(rapporto.complessivo), percorso);
process.exit(0);
