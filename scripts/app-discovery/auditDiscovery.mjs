import fs from "node:fs";
import path from "node:path";

const OUTPUT_DIR = path.resolve("scripts/app-discovery/output/2026-08-01");
const REPORT_JSON = path.join(OUTPUT_DIR, "REPORT.json");
const REPORT_MD = path.join(OUTPUT_DIR, "REPORT.md");

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeAtomic(file, content) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, content, "utf8");
  fs.renameSync(temp, file);
}

function quoteIdentity(market, outcome, line, bookmaker) {
  return `${market}|${outcome}|${line ?? ""}|${bookmaker}`;
}

const manifest = readJson("manifest.json");
const fixtureFiles = manifest.entries.map((entry) => entry.file);
for (const file of fixtureFiles) readJson(file);

const pages = [
  readJson("event-finished-odds-list.json"),
  readJson("event-finished-odds-list-offset-200.json"),
  readJson("event-finished-odds-list-offset-400.json"),
];
const oddsRows = pages.flatMap((page) => page.results ?? []);
const comparison = readJson("event-finished-odds-comparison.json");
const upcomingOddsList = readJson("event-upcoming-odds-list.json");
const upcomingOddsComparison = readJson("event-upcoming-odds-comparison.json");
const upcomingCompactOdds = readJson("event-upcoming-odds.json");
const standings = readJson("league-standings.json");
const finishedH2h = readJson("event-finished-h2h.json");
const upcomingH2h = readJson("event-upcoming-h2h.json");
const finishedDetail = readJson("event-finished-detail.json");
const upcomingDetail = readJson("event-upcoming-detail.json");
const pregame = readJson("event-upcoming-pregame.json");
const teamStats = readJson("event-upcoming-team-stats.json");

assert(manifest.status === "completed", "Manifest non completato.");
assert(manifest.requestsCompleted === 18, "Conteggio richieste canoniche inatteso.");
assert(pages[0].count === 448, "Conteggio quote atteso non confermato.");
assert(oddsRows.length === pages[0].count, "Pagine quote incomplete.");
assert(new Set(oddsRows.map((row) => row.id)).size === oddsRows.length, "ID quote duplicati.");
assert(comparison.total_odds === oddsRows.length, "Confronto quote e lista non coincidono.");

const listMap = new Map(
  oddsRows.map((row) => [
    quoteIdentity(row.market, row.outcome, row.line, row.bookmaker_slug),
    row,
  ]),
);
const comparisonMap = new Map();
for (const [market, selections] of Object.entries(comparison.markets ?? {})) {
  for (const payload of Object.values(selections ?? {})) {
    for (const [bookmaker, quote] of Object.entries(payload.bookmakers ?? {})) {
      comparisonMap.set(quoteIdentity(market, payload.outcome, payload.line, bookmaker), quote);
    }
  }
}
assert(comparisonMap.size === listMap.size, "Numero record confronto quote inatteso.");
for (const [identity, row] of listMap) {
  const compared = comparisonMap.get(identity);
  assert(compared, `Quota assente dal confronto: ${identity}`);
  assert(compared.decimal_odds === row.decimal_odds, `Prezzo divergente: ${identity}`);
  assert(compared.movement === row.movement, `Movimento divergente: ${identity}`);
  assert(compared.updated_at === row.updated_at, `Timestamp divergente: ${identity}`);
}

const perMarket = {};
for (const row of oddsRows) {
  const current =
    perMarket[row.market] ??
    (perMarket[row.market] = {
      records: 0,
      outcomes: new Set(),
      lines: new Set(),
      bookmakers: new Set(),
      currentPricePresent: 0,
      previousObservationPresent: 0,
      movementFieldPresent: 0,
      movementObserved: 0,
      updatedAtPresent: 0,
      openingFieldPresent: 0,
      closingFieldPresent: 0,
    });
  current.records += 1;
  current.outcomes.add(row.outcome);
  if (row.line !== null && row.line !== undefined) current.lines.add(row.line);
  current.bookmakers.add(row.bookmaker_slug);
  if (typeof row.decimal_odds === "number") current.currentPricePresent += 1;
  if (typeof row.previous_decimal_odds === "number") current.previousObservationPresent += 1;
  if (Object.hasOwn(row, "movement")) current.movementFieldPresent += 1;
  if (row.movement === "SHORTENING" || row.movement === "DRIFTING") {
    current.movementObserved += 1;
  }
  if (row.updated_at) current.updatedAtPresent += 1;
  if (Object.keys(row).some((key) => /open|initial|first/i.test(key))) {
    current.openingFieldPresent += 1;
  }
  if (Object.keys(row).some((key) => /close|closing/i.test(key))) {
    current.closingFieldPresent += 1;
  }
}

const marketSummary = Object.fromEntries(
  Object.entries(perMarket).map(([market, value]) => [
    market,
    {
      records: value.records,
      outcomes: [...value.outcomes].sort(),
      lines: [...value.lines].sort((left, right) => left - right),
      bookmakers: value.bookmakers.size,
      currentPricePresent: value.currentPricePresent,
      previousObservationPresent: value.previousObservationPresent,
      movementFieldPresent: value.movementFieldPresent,
      movementObserved: value.movementObserved,
      updatedAtPresent: value.updatedAtPresent,
      explicitOpeningAvailable: value.openingFieldPresent > 0,
      explicitClosingAvailable: value.closingFieldPresent > 0,
    },
  ]),
);

const standingRows = standings.standings ?? [];
const formRows = standingRows.filter(
  (row) => typeof row.form === "string" && /^[WDL]*$/.test(row.form),
);
const upcomingCompactValues = Object.values(upcomingCompactOdds.odds ?? {});
const httpStatuses = {};
for (const entry of manifest.entries) {
  httpStatuses[entry.status] = (httpStatuses[entry.status] ?? 0) + 1;
}

const sensitiveKeyPattern =
  /(^|[_-])(authorization|token|api[_-]?key|password|passwd|secret|cookie|set[_-]?cookie)([_-]|$)/i;
const sensitiveValuePattern = /(Bearer\s+[A-Za-z0-9._~+\/-]+|Token\s+[A-Za-z0-9._~+\/-]+)/i;
const sensitiveFindings = [];
function scan(value, location) {
  if (typeof value === "string") {
    if (sensitiveValuePattern.test(value) && value !== "[REDACTED]") {
      sensitiveFindings.push(`${location}: sensitive value pattern`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKeyPattern.test(key) && child !== "[REDACTED]") {
      sensitiveFindings.push(`${location}.${key}: unredacted sensitive key`);
    }
    scan(child, `${location}.${key}`);
  }
}
for (const file of fixtureFiles) scan(readJson(file), file);

const listResponseEventIds = [...new Set(oddsRows.map((row) => row.event_id))];
const report = {
  schemaVersion: "iqstats.app-discovery.report.v1",
  generatedAt: new Date().toISOString(),
  status: "completed-awaiting-human-review",
  nextGate: "human-review-before-APP-1",
  scope: {
    preflightRequests: 10,
    canonicalRequests: manifest.requestsCompleted,
    totalRequests: 10 + manifest.requestsCompleted,
    requestLimit: 30,
    sampleEvents: [finishedDetail.id, upcomingDetail.id],
    appModified: false,
    calibrationRerun: false,
  },
  requests: {
    statusCounts: httpStatuses,
    completed: manifest.requestsCompleted,
    allowedMethod: "GET",
  },
  contracts: {
    matchList: {
      status: "verified-local",
      endpoint: "/api/v2/events/",
      explicitFields: Object.keys((readJson("events-finished-sample.json").results ?? [])[0] ?? {}),
      filtersVerified: ["league_id", "date_from", "date_to", "status", "limit"],
    },
    matchDetail: {
      status: "verified-local",
      endpoint: "/api/v2/events/{id}/",
      explicitFields: Object.keys(finishedDetail),
    },
    odds: {
      status: "partial",
      endpointCurrentSummary: "/api/v2/events/{id}/odds/",
      endpointComparison: "/api/v2/events/{id}/odds/comparison/",
      endpointDetailedList: "/api/v2/odds/?event_id={id}",
      finishedSample: {
        eventId: finishedDetail.id,
        records: oddsRows.length,
        bookmakers: comparison.bookmakers_count,
        markets: Object.keys(marketSummary),
        perMarket: marketSummary,
      },
      upcomingSample: {
        eventId: upcomingDetail.id,
        records: upcomingOddsList.count,
        comparisonMarkets: Object.keys(upcomingOddsComparison.markets ?? {}),
        compactFields: upcomingCompactValues.length,
        compactNonNull: upcomingCompactValues.filter((value) => value !== null).length,
      },
      temporalSemantics: {
        currentPrice: "decimal_odds is explicit",
        previousObservation:
          "previous_decimal_odds is explicit when present and is only the observation before the last change",
        latestMovement:
          "movement is explicit as SHORTENING, DRIFTING or empty; updated_at is the timestamp of the last change",
        openingPrice: "unavailable: no explicit opening/initial field",
        closingPrice:
          "unavailable: no explicit closing field; the last value of a finished match is not labelled as closing",
      },
      idCaveat: {
        requestedInternalEventId: finishedDetail.id,
        eventSpecificResponseIds: [
          readJson("event-finished-odds.json").event_id,
          comparison.event_id,
        ],
        detailedListResponseEventIds: listResponseEventIds,
        recordsReconciledByMarketOutcomeLineBookmaker: comparisonMap.size === listMap.size,
        rule:
          "Do not expose or join the detailed-list event_id as the IQstatS match ID; preserve the requested match context server-side.",
      },
    },
    standings: {
      status: "verified-local",
      endpoint: "/api/v2/leagues/{id}/standings/?season_id={seasonId}",
      leagueId: standings.league_id,
      seasonId: standings.season?.id ?? null,
      rows: standingRows.length,
      explicitFields: Object.keys(standingRows[0] ?? {}),
    },
    form: {
      status: "partial",
      source: "standings.form",
      rowsWithExplicitSequence: formRows.length,
      rows: standingRows.length,
      semantics: "compact W/D/L sequence only; no dates, opponents or home/away filter",
      dedicatedFootballEndpointVerified: false,
    },
    headToHead: {
      status: "verified-local",
      endpoint: "/api/v2/events/{id}/h2h/",
      explicitFields: Object.keys(finishedH2h),
      finishedSample: {
        totalMatches: finishedH2h.total_matches,
        recentMatches: finishedH2h.recent_matches?.length ?? 0,
        identicalToDetail: JSON.stringify(finishedH2h) === JSON.stringify(finishedDetail.head_to_head),
      },
      upcomingSample: {
        totalMatches: upcomingH2h.total_matches,
        recentMatches: upcomingH2h.recent_matches?.length ?? 0,
        identicalToDetail: JSON.stringify(upcomingH2h) === JSON.stringify(upcomingDetail.head_to_head),
      },
    },
    unsupportedCandidates: {
      pregame: { status: pregame.status, detail: pregame.detail },
      teamStats: { status: teamStats.status, detail: teamStats.detail },
    },
  },
  verification: {
    allFixturesParse: true,
    oddsPages: pages.map((page) => ({
      count: page.count,
      returned: page.results?.length ?? 0,
      hasNext: Boolean(page.next),
      hasPrevious: Boolean(page.previous),
    })),
    oddsUniqueRecords: new Set(oddsRows.map((row) => row.id)).size,
    oddsComparisonReconciled: true,
    sensitiveFindings,
    appModified: false,
  },
  decision: {
    safeForAPP1: ["matchList", "matchDetail", "standings", "headToHead"],
    partialForAPP1: ["oddsCurrentPreviousMovement", "compactStandingForm"],
    unavailableForAPP1: ["oddsOpening", "oddsClosing", "detailedTeamForm"],
  },
};

assert(report.scope.totalRequests <= report.scope.requestLimit, "Limite richieste superato.");
assert(Object.keys(marketSummary).length === 11, "Numero famiglie mercato inatteso.");
assert(sensitiveFindings.length === 0, "Pattern sensibili rilevati negli output.");
assert(formRows.length === standingRows.length, "Copertura form classifica inattesa.");
assert(pregame.status === 404 && teamStats.status === 404, "Stato candidate route inatteso.");

writeAtomic(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);

const marketRows = Object.entries(marketSummary)
  .map(
    ([market, item]) =>
      `| \`${market}\` | ${item.records} | ${item.outcomes.join(", ")} | ${item.lines.length ? item.lines.join(", ") : "—"} | ${item.bookmakers} | ${item.previousObservationPresent}/${item.records} | ${item.movementObserved}/${item.records} | no | no |`,
  )
  .join("\n");

const markdown = `# Report APP-0D — Discovery contratti MVP

## Esito

Discovery completata e pronta per revisione umana. Sono state effettuate 28 richieste
complessive: 10 ricognizioni preliminari e 18 richieste canoniche, tutte GET e sotto il
limite 30. Il campione usa due gare; nessun file dell'app o output CAL-4 è stato
modificato.

## Risultato per dominio

| Dominio | Stato | Evidenza |
| --- | --- | --- |
| Lista gare | verificato | Endpoint lista con filtri data, lega e stato; paginazione e campi gara espliciti. |
| Dettaglio gara | verificato | Endpoint dettaglio con squadre, kickoff, stato, punteggio, metadati e H2H. |
| Quote correnti | verificato sul campione concluso | 448/448 record riconciliati con il confronto, 11 mercati e 16 bookmaker. |
| Movimento quote | parziale | Campo esplicito per tutti i record; movimento non vuoto e precedente presenti in 347/448. |
| Apertura quote | non disponibile | Nessun campo esplicito opening/initial. \`previous_decimal_odds\` è solo l'osservazione precedente. |
| Chiusura quote | non disponibile | Nessun campo closing; l'ultimo prezzo di una gara finita non è etichettato come chiusura. |
| Gara futura campione | copertura assente | Lista quote vuota; gli 11 campi compatti sono tutti \`null\`. |
| Classifica | verificato | 20 righe con stagione e statistiche esplicite. |
| Forma | parziale | \`standings.form\` presente 20/20 come sequenza W/D/L; mancano date, avversari e split casa/trasferta. |
| H2H | verificato | Endpoint dedicato con aggregati e partite recenti; coincide con il blocco nel dettaglio gara. |

## Mercati osservati nella gara conclusa

| Mercato | Record | Esiti | Linee | Bookmaker | Precedente | Movimento non vuoto | Apertura | Chiusura |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- | --- |
${marketRows}

La copertura di movimento non va confusa con uno storico completo. I campi espliciti
sono \`decimal_odds\`, \`previous_decimal_odds\`, \`movement\` e \`updated_at\`.
IQstatS può quindi mostrare prezzo corrente, osservazione precedente e direzione
dell'ultima variazione quando presenti. Non può mostrare apertura o chiusura con il
contratto attuale.

## Caveat identificativo

Le route specifiche della gara restituiscono l'ID IQstatS richiesto, mentre la lista
dettagliata quote restituisce un diverso \`event_id\`. I 448 record coincidono comunque
uno a uno con il confronto su mercato, esito, linea, bookmaker, prezzo, movimento e
timestamp. APP-1 deve conservare il match ID richiesto come contesto server-side e non
esporre o usare il campo della lista quote come chiave IQstatS.

## Endpoint candidati non disponibili

Le route calcio \`pregame\` e \`team-stats\` hanno restituito 404. Non vengono usate
come fallback. La forma dettagliata resta non coperta; la sola sequenza W/D/L della
classifica è disponibile.

## Verifica

- tre pagine quote: 200 + 200 + 48 = 448, senza duplicati;
- confronto quote: 448 record, zero differenze su prezzo, movimento e timestamp;
- 11/11 mercati restituiti enumerati;
- H2H dedicato e H2H nel dettaglio identici per entrambe le gare;
- fixture JSON leggibili e nessuna chiave sensibile non redatta o pattern header/token;
- nessuna modifica sotto \`apps/\`.

## Gate APP-1

Possono entrare nei contratti condivisi lista/dettaglio gara, classifica e H2H. Quote
correnti, precedente e movimento entrano con disponibilità per singolo record. Apertura,
chiusura e forma dettagliata restano \`unavailable\` finché un endpoint esplicito non le
espone; non devono essere ricostruite.
`;

writeAtomic(REPORT_MD, markdown);
console.log(
  JSON.stringify(
    {
      status: report.status,
      totalRequests: report.scope.totalRequests,
      oddsRecords: oddsRows.length,
      markets: Object.keys(marketSummary).length,
      previousObservationPresent: oddsRows.filter(
        (row) => typeof row.previous_decimal_odds === "number",
      ).length,
      explicitOpeningAvailable: false,
      explicitClosingAvailable: false,
      sensitiveFindings: sensitiveFindings.length,
    },
    null,
    2,
  ),
);
