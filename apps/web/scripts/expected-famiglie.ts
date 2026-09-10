// Expected: le sette famiglie del motore per ogni gara in arrivo.
//
// **Che cosa e', e perche' non e' la vetrina.** La vetrina tiene *una* lettura per gara, la
// piu' probabile dentro la fascia dove la taratura tiene. Expected tiene *tutte e sette* le
// famiglie di ogni gara - tiri, tiri in porta, falli, cartellini, corner, fuorigioco,
// parate - con la loro soglia, il loro verso e la loro affidabilita'. Sono due domande
// diverse: la vetrina risponde «che cosa gioco», Expected «che cosa dice il motore».
//
// **Per questo non passa da `ordinaLetture`.** Quella funzione e' il criterio della cima:
// scarta le letture sopra l'ottanta per cento e, dal 10 settembre 2026, i falli. Qui
// scartare sarebbe sbagliato - una sezione che si chiama Expected deve mostrare anche cio'
// che il motore non manderebbe in cima - quindi si parte da `candidateDiGara` e si passa da
// `arricchisci`, che e' li' apposta: aggiunge base di lega, sorpresa e forza senza filtrare.
//
// **Il costo.** Una proiezione sta fra 227 e 402 ms per gara: un giorno pieno sono minuti,
// e nessuna pagina puo' aspettarli. Come la vetrina, si scrive un artefatto e la pagina lo
// legge dichiarando quando e' stato scritto.
//
// Uso, con il livello dati locale in ascolto e le variabili della fonte:
//   node --env-file=.env.local --conditions=react-server --import ./test/risolutore-ts.mjs \
//     --experimental-strip-types scripts/expected-famiglie.ts [--giorni 3] [--insieme 6]
import { writeFileSync } from "node:fs";
import path from "node:path";

import { baseDiLega } from "../src/server/iqstats/base-di-lega.ts";
import { connessione } from "../src/server/iqstats/lettura.ts";
import { getMatchDetail } from "../src/server/iqstats/match-context.ts";
import { getMatchesByDate, type MatchListItem } from "../src/server/iqstats/matches.ts";
import { proiezioniDellaGara } from "../src/server/iqstats/projection-runtime.ts";
import {
  arricchisci,
  candidateDiGara,
  ordinaLetture,
} from "../src/server/iqstats/projection/letture-forti.ts";

interface RigaDiFamiglia {
  readonly bersaglio: string;
  readonly lato: "casa" | "trasferta" | "totale";
  readonly soglia: number;
  readonly verso: "Over" | "Under";
  readonly probabilita: number;
  readonly base: number | null;
  readonly gareDiBase: number | null;
  readonly affidabilita: number;
}

/**
 * Il pronostico consigliato della gara, con i numeri che lo giustificano.
 *
 * **Non e' un criterio nuovo.** E' la lettura che `ordinaLetture` mette in cima - la piu'
 * probabile dentro la fascia fino all'ottanta per cento, a parita' di punto il bersaglio
 * che sbaglia meno - cioe' esattamente il criterio di cui il consuntivo di `/metodo`
 * conosce la resa. Un secondo criterio scelto qui sarebbe un pronostico senza consuntivo.
 *
 * **La motivazione sta nei campi, non in una frase.** `base` dice quanto quella linea
 * succede nella lega e `scarto` di quanto ce ne stacchiamo: e' li' che il consiglio smette
 * di essere banale, perche' una lettura che coincide con la norma del torneo non aggiunge
 * niente e il blocco lo deve dichiarare invece di spacciarla per nostra.
 */
interface Consigliato extends RigaDiFamiglia {
  /** Punti percentuali fra la nostra probabilita' e la frequenza della lega. */
  readonly scarto: number | null;
}

interface GaraExpected {
  readonly gara: number;
  readonly casa: string;
  readonly fuori: string;
  /** Gli identificativi servono agli stemmi: senza, la riga mostra solo le iniziali. */
  readonly casaId: number | null;
  readonly fuoriId: number | null;
  readonly legaId: number | null;
  readonly lega: string | null;
  readonly kickoff: string;
  readonly consigliato: Consigliato | null;
  readonly famiglie: readonly RigaDiFamiglia[];
  /** Le famiglie senza una misura di riscontro: si dichiarano, non si nascondono. */
  readonly senzaMisura: readonly string[];
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

/**
 * Le sette famiglie di quella gara, una riga per famiglia.
 *
 * Dentro una famiglia ci sono piu' candidate - lati diversi, soglie diverse - e ne resta
 * **una**: la piu' probabile. Le altre non spariscono dal prodotto, restano nella card
 * della famiglia dentro il dossier; qui servirebbero solo a fare quattro righe che dicono
 * la stessa partita.
 */
async function famiglieDi(gara: MatchListItem): Promise<GaraExpected | null> {
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

  const migliori = new Map<string, RigaDiFamiglia>();
  for (const l of arricchisci(candidate, basi)) {
    const gia = migliori.get(l.bersaglio);
    if (gia !== undefined && gia.probabilita >= l.probabilita) continue;
    migliori.set(l.bersaglio, {
      bersaglio: l.bersaglio,
      lato: l.lato,
      soglia: l.soglia,
      verso: l.verso,
      probabilita: Number(l.probabilita.toFixed(4)),
      base: l.base === null ? null : Number(l.base.toFixed(2)),
      gareDiBase: l.gareDiBase,
      affidabilita: l.affidabilita,
    });
  }
  if (migliori.size === 0) return null;

  // Il consigliato passa dal criterio della cima, che e' l'unico di cui si conosce la resa.
  const prima = ordinaLetture(candidate, senzaMisura, basi).consigliato ?? undefined;
  const consigliato: Consigliato | null = prima === undefined ? null : {
    bersaglio: prima.bersaglio,
    lato: prima.lato,
    soglia: prima.soglia,
    verso: prima.verso,
    probabilita: Number(prima.probabilita.toFixed(4)),
    base: prima.base === null ? null : Number(prima.base.toFixed(2)),
    gareDiBase: prima.gareDiBase,
    affidabilita: prima.affidabilita,
    scarto: prima.base === null
      ? null
      : Number((prima.probabilita * 100 - prima.base).toFixed(1)),
  };

  return {
    gara: gara.eventId,
    casa: detail.homeTeam,
    fuori: detail.awayTeam,
    casaId: gara.homeTeamId,
    fuoriId: gara.awayTeamId,
    legaId: gara.leagueId,
    lega: gara.leagueName,
    kickoff: gara.kickoff,
    consigliato,
    // Ordine stabile: la famiglia piu' probabile in cima, cosi' la riga apre sul numero
    // che regge di piu' invece che sull'ordine alfabetico dei bersagli.
    famiglie: [...migliori.values()].sort((a, b) => b.probabilita - a.probabilita),
    senzaMisura,
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
    // Solo quello che deve ancora cominciare: Expected parla di gare da giocare.
    for (const gara of esito.matches) {
      if (Date.parse(gara.kickoff) > adesso) gare.push(gara);
    }
  }
  if (gare.length === 0) {
    console.error("nessuna gara in arrivo: l'artefatto non si scrive vuoto");
    return 1;
  }

  const voci: GaraExpected[] = [];
  for (let inizio = 0; inizio < gare.length; inizio += insieme) {
    const lotto = gare.slice(inizio, inizio + insieme);
    const esiti = await Promise.all(lotto.map((g) => famiglieDi(g).catch(() => null)));
    for (const voce of esiti) if (voce !== null) voci.push(voce);
    process.stdout.write(`\r${Math.min(inizio + insieme, gare.length)}/${gare.length} gare`);
  }
  process.stdout.write("\n");

  voci.sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  const righe = voci.reduce((n, v) => n + v.famiglie.length, 0);
  const rapporto = {
    schema: "expected-famiglie/1",
    calcolato_il: new Date().toISOString(),
    giorni,
    gare_in_arrivo: gare.length,
    gare_con_proiezione: voci.length,
    righe,
    come_e_stato_scelto: (
      "le stesse funzioni che disegnano il dossier - candidateDiGara, baseDiLega, "
      + "arricchisci - su ogni gara in arrivo. Una riga per famiglia, la candidata piu' "
      + "probabile fra i lati e le soglie di quella famiglia. Non si passa da ordinaLetture: "
      + "quello e' il criterio della cima, che scarta le letture sopra l'ottanta per cento e "
      + "i falli, e qui scartare direbbe il falso su una sezione che deve mostrare che cosa "
      + "dice il motore."
    ),
    gare: voci,
  };

  const percorso = path.join(
    import.meta.dirname, "..", "src", "server", "iqstats", "artefatti", "expected-famiglie.json",
  );
  writeFileSync(percorso, JSON.stringify(rapporto, null, 2) + "\n", "utf8");
  console.log(
    `${gare.length} gare in arrivo · ${voci.length} con proiezione · ${righe} righe di famiglia`,
  );
  console.log(percorso);
  return 0;
}

process.exitCode = await main();
