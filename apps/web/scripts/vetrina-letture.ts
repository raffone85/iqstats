// La vetrina: le letture piu' forti fra le gare in arrivo.
//
// **Perche' offline.** Ricostruire una lettura costa una proiezione - misurata, fra 227 e
// 402 ms per gara - piu' una lettura della fonte per gli ingressi che l'elenco del
// tabellone non porta: stagione, allenatori, derby. Su un giorno pieno sono minuti, e
// nessuna pagina puo' aspettarli. Lo script gira, scrive l'artefatto, la pagina lo legge e
// dichiara quando e' stato scritto.
//
// **La regola di selezione e' quella del dossier**, non una seconda: `candidateDiGara`,
// `baseDiLega` e `ordinaLetture` sono le stesse funzioni. Una vetrina ordinata da un'altra
// regola mostrerebbe letture che la gara, aperta, non conferma.
//
// **Una lettura per gara.** Le quattro di una gara raccontano la stessa partita: in vetrina
// entrerebbero insieme e la riempirebbero da sole. Resta la piu' forte, e la gara si apre.
//
// Uso, con il livello dati locale in ascolto e le variabili della fonte:
//   node --env-file=.env.local --conditions=react-server --import ./test/risolutore-ts.mjs \
//     --experimental-strip-types scripts/vetrina-letture.ts [--giorni 3] [--insieme 6]
import { writeFileSync } from "node:fs";
import path from "node:path";

import { baseDiLega } from "../src/server/iqstats/base-di-lega.ts";
import { connessione } from "../src/server/iqstats/lettura.ts";
import { getMatchDetail } from "../src/server/iqstats/match-context.ts";
import { getMatchesByDate, type MatchListItem } from "../src/server/iqstats/matches.ts";
import { proiezioniDellaGara } from "../src/server/iqstats/projection-runtime.ts";
import { candidateDiGara, ordinaLetture } from "../src/server/iqstats/projection/letture-forti.ts";

/** Quante letture tiene la vetrina. Oltre la decima si torna a scorrere, non a leggere. */
const QUANTE = 10;

interface VoceDiVetrina {
  readonly gara: number;
  readonly casa: string;
  readonly fuori: string;
  readonly lega: string | null;
  readonly kickoff: string;
  readonly bersaglio: string;
  readonly lato: "casa" | "trasferta" | "totale";
  readonly soglia: number;
  readonly verso: "Over" | "Under";
  readonly probabilita: number;
  readonly base: number | null;
  readonly affidabilita: number;
  readonly forza: number;
}

function argomento(nome: string, difetto: number): number {
  const indice = process.argv.indexOf("--" + nome);
  if (indice < 0) return difetto;
  const valore = Number(process.argv[indice + 1]);
  return Number.isFinite(valore) && valore > 0 ? valore : difetto;
}

/** I giorni di Roma da oggi in avanti, in formato ISO. */
function giorniDaOggi(quanti: number): readonly string[] {
  const giorni: string[] = [];
  const oggi = new Date();
  for (let passo = 0; passo < quanti; passo += 1) {
    const giorno = new Date(oggi.getTime() + passo * 86_400_000);
    giorni.push(giorno.toISOString().slice(0, 10));
  }
  return giorni;
}

/** La lettura piu' forte di quella gara, o `null` se non ne ha una. */
async function letturaDi(gara: MatchListItem): Promise<VoceDiVetrina | null> {
  const esito = await getMatchDetail(gara.eventId);
  if (esito.stato !== "trovato") return null;
  const detail = esito.detail;
  if (detail.leagueId === null || detail.seasonId === null) return null;

  const proiezioni = await proiezioniDellaGara(detail);
  if (typeof proiezioni === "string") return null;

  const { candidate, senzaMisura } = candidateDiGara(proiezioni.bersagli);
  if (candidate.length === 0) return null;
  const basi = await baseDiLega(
    detail.leagueId,
    detail.seasonId,
    candidate.map((c) => ({ target: c.bersaglio, lato: c.lato, soglia: c.soglia, verso: c.verso })),
  );
  const forti = ordinaLetture(candidate, senzaMisura, basi);
  // Il consigliato, non la piu' probabile: quella era quasi sempre la norma del campionato,
  // e una vetrina di norme non e' una vetrina. Vedi `SCARTO_MINIMO` in `letture-forti.ts`.
  const prima = forti.consigliato;
  // `null`, non `undefined`: la gara ha letture ma nessuna si stacca dalla norma, e in
  // vetrina non ci va. E' il caso che prima non esisteva, perche' la prima c'era sempre.
  if (prima === null) return null;

  return {
    gara: gara.eventId,
    casa: detail.homeTeam,
    fuori: detail.awayTeam,
    lega: gara.leagueName,
    kickoff: gara.kickoff,
    bersaglio: prima.bersaglio,
    lato: prima.lato,
    soglia: prima.soglia,
    verso: prima.verso,
    probabilita: Number(prima.probabilita.toFixed(4)),
    base: prima.base === null ? null : Number(prima.base.toFixed(2)),
    affidabilita: prima.affidabilita,
    forza: Number(prima.forza.toFixed(5)),
  };
}

async function main(): Promise<number> {
  if (connessione() === null) {
    console.error("serve IQSTATS_PROJECTION_DATABASE_URL");
    return 1;
  }
  const giorni = argomento("giorni", 3);
  const insieme = argomento("insieme", 6);

  const adesso = Date.now();
  const gare: MatchListItem[] = [];
  for (const giorno of giorniDaOggi(giorni)) {
    const esito = await getMatchesByDate(giorno);
    // Solo quello che deve ancora cominciare: una vetrina non promette una gara finita.
    for (const gara of esito.matches) {
      if (Date.parse(gara.kickoff) > adesso) gare.push(gara);
    }
  }
  if (gare.length === 0) {
    console.error("nessuna gara in arrivo: la vetrina non si scrive vuota");
    return 1;
  }

  const voci: VoceDiVetrina[] = [];
  for (let inizio = 0; inizio < gare.length; inizio += insieme) {
    const lotto = gare.slice(inizio, inizio + insieme);
    const esiti = await Promise.all(lotto.map((g) => letturaDi(g).catch(() => null)));
    for (const voce of esiti) if (voce !== null) voci.push(voce);
    process.stdout.write(`\r${Math.min(inizio + insieme, gare.length)}/${gare.length} gare`);
  }
  process.stdout.write("\n");

  // L'ordine e' quello del criterio nuovo: probabilita' dentro la fascia dove la taratura
  // tiene, e a parita' il bersaglio che sbaglia meno. `ordinaLetture` ha gia' scartato le
  // letture sopra l'ottanta per cento; qui si mettono in fila le prime di ogni gara.
  voci.sort((a, b) =>
    (Math.round(b.probabilita * 100) - Math.round(a.probabilita * 100))
    || (b.affidabilita - a.affidabilita));
  const rapporto = {
    schema: "vetrina-letture/1",
    calcolato_il: new Date().toISOString(),
    giorni,
    gare_in_arrivo: gare.length,
    gare_con_una_lettura: voci.length,
    come_e_stata_scelta: (
      "le stesse funzioni che disegnano il dossier - candidateDiGara, baseDiLega, "
      + "ordinaLetture - su ogni gara in arrivo; una lettura per gara, la piu' probabile "
      + "dentro la fascia dove la taratura tiene, cioe' fino all'ottanta per cento. Il "
      + "criterio e' stato scelto il 6 settembre 2026 confrontandone cinque su 1.200 gare "
      + "chiuse: questo rende 77,9% contro il 76,6% promesso, dove quello per forza rendeva "
      + "63,3% contro 65,1%."
    ),
    letture: voci.slice(0, QUANTE),
  };

  const percorso = path.join(
    import.meta.dirname, "..", "src", "server", "iqstats", "artefatti", "vetrina-letture.json",
  );
  writeFileSync(percorso, JSON.stringify(rapporto, null, 2) + "\n", "utf8");
  console.log(
    `${gare.length} gare in arrivo · ${voci.length} con una lettura · ne restano ${rapporto.letture.length}`,
  );
  for (const v of rapporto.letture) {
    console.log(
      `  ${v.casa} - ${v.fuori}: ${v.verso} ${v.soglia} ${v.bersaglio}`
      + ` ${Math.round(v.probabilita * 100)}% (lega ${v.base === null ? "n/d" : Math.round(v.base) + "%"})`,
    );
  }
  console.log(percorso);
  return 0;
}

process.exit(await main());
