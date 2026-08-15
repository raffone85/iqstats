import fs from "node:fs";
import path from "node:path";

const MIGRATION_PATH = path.resolve(
  "infra/supabase/20260809_iqstats_football_data.sql",
);
const BATCH_MIGRATION_PATH = path.resolve(
  "infra/supabase/20260809_iqstats_data1_batch_ingest.sql",
);
const SMOKE_PATH = path.resolve("scripts/app-ingestion/smoke-data-1.sql");
const BENCHMARK_PATH = path.resolve("scripts/app-ingestion/benchmark-data-1.sql");
const BATCH_TEST_PATH = path.resolve("scripts/app-ingestion/test-data1-batch.sql");
const SUPABASE_MIGRATIONS_DIR = path.resolve("supabase/migrations");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

assert(fs.existsSync(MIGRATION_PATH), "Migrazione DATA-1 assente.");
assert(fs.existsSync(BATCH_MIGRATION_PATH), "Migrazione batch DATA-1 assente.");
assert(fs.existsSync(SMOKE_PATH), "Smoke SQL DATA-1 assente.");
assert(fs.existsSync(BENCHMARK_PATH), "Benchmark SQL DATA-1 assente.");
assert(fs.existsSync(BATCH_TEST_PATH), "Test batch SQL DATA-1 assente.");
assert(fs.existsSync(SUPABASE_MIGRATIONS_DIR), "Directory migrazioni Supabase assente.");

const migration = fs.readFileSync(MIGRATION_PATH, "utf8");
const batchMigration = fs.readFileSync(BATCH_MIGRATION_PATH, "utf8");
const smoke = fs.readFileSync(SMOKE_PATH, "utf8");
const benchmark = fs.readFileSync(BENCHMARK_PATH, "utf8");
const batchTest = fs.readFileSync(BATCH_TEST_PATH, "utf8");
const generatedMigrationFiles = fs
  .readdirSync(SUPABASE_MIGRATIONS_DIR)
  .filter((file) => file.endsWith("_iqstats_football_data.sql"));
assert(generatedMigrationFiles.length === 1, "Migrazione Supabase DATA-1 non univoca.");
const generatedMigration = fs.readFileSync(
  path.join(SUPABASE_MIGRATIONS_DIR, generatedMigrationFiles[0]),
  "utf8",
);
assert(generatedMigration === migration, "Migrazione Supabase e sorgente SQL divergenti.");
const generatedBatchFiles = fs
  .readdirSync(SUPABASE_MIGRATIONS_DIR)
  .filter((file) => file.endsWith("_iqstats_data1_batch_ingest.sql"));
assert(generatedBatchFiles.length === 1, "Migrazione Supabase batch DATA-1 non univoca.");
const generatedBatchMigration = fs.readFileSync(
  path.join(SUPABASE_MIGRATIONS_DIR, generatedBatchFiles[0]),
  "utf8",
);
assert(
  generatedBatchMigration === batchMigration,
  "Migrazione Supabase batch e sorgente SQL divergenti.",
);
const normalized = migration.replace(/\r\n/g, "\n").trim();

const expectedFootballTables = [
  "competitions",
  "seasons",
  "teams",
  "venues",
  "referees",
  "matches",
  "standing_snapshots",
  "standing_rows",
];
const expectedPrivateTables = ["football_sync_runs", "football_sync_jobs"];

assert(normalized.startsWith("begin;"), "La migrazione non apre una transazione.");
assert(normalized.endsWith("commit;"), "La migrazione non chiude la transazione.");
assert(!/\bdrop\s+(?:table|schema)\b/i.test(migration), "DATA-1 contiene drop distruttivi.");
assert(!/\bgrant\b[^;]*(?:\banon\b|\bauthenticated\b)/i.test(migration), "Grant client diretto rilevato.");
assert(!/(?:raw_payload|provider_payload|response_body|request_headers)/i.test(migration), "Persistenza raw rilevata.");
assert(!/(?:https?:\/\/|price_[a-z0-9_]+)/i.test(migration), "Valore esterno non ammesso nella migrazione.");
assert(!/(?:https?:\/\/|price_[a-z0-9_]+)/i.test(batchMigration), "Valore esterno non ammesso nel batch.");
assert(!/(?:raw_payload|provider_payload|response_body|request_headers)/i.test(batchMigration), "Persistenza raw nel batch.");
assert(/security invoker/i.test(batchMigration), "Batch ingest non invoker-safe.");
assert(/apply_football_data1_batch/i.test(batchMigration), "Funzione batch assente.");
assert(/on conflict \(source_id\) do update/gi.test(batchMigration), "Upsert entità assente.");
assert(/on conflict \(season_id, content_checksum\) do nothing/i.test(batchMigration), "Snapshot change-only assente.");
assert(/source_sequence >= football\.matches\.source_sequence/i.test(batchMigration), "Protezione ordine match assente.");
assert(!/grant execute[^;]*(?:anon|authenticated)/i.test(batchMigration), "Grant client sul batch rilevato.");

for (const table of expectedFootballTables) {
  assert(
    new RegExp(`create table football\\.${table}\\s*\\(`, "i").test(migration),
    `Tabella football.${table} assente.`,
  );
  assert(
    new RegExp(`alter table football\\.${table} enable row level security;`, "i").test(migration),
    `RLS non abilitata su football.${table}.`,
  );
}

for (const table of expectedPrivateTables) {
  assert(
    new RegExp(`create table private\\.${table}\\s*\\(`, "i").test(migration),
    `Tabella private.${table} assente.`,
  );
  assert(
    new RegExp(`alter table private\\.${table} enable row level security;`, "i").test(migration),
    `RLS non abilitata su private.${table}.`,
  );
}

assert(occurrences(migration, /create index /gi) >= 19, "Copertura indici insufficiente.");
assert(/for update skip locked/i.test(migration), "Claim queue non concorrente.");
assert(occurrences(migration, /security_invoker\s*=\s*true/gi) === 2, "Read model non invoker-safe.");
assert(/unique \(season_id, content_checksum\)/i.test(migration), "Deduplicazione classifiche assente.");
assert(/source_updated_at timestamptz/i.test(migration), "Timestamp sorgente assente.");
assert(/content_checksum text not null/i.test(migration), "Checksum dati assente.");
assert(/fresh_until timestamptz/i.test(migration), "Contratto freschezza assente.");
assert(/home_score smallint,\s*\n\s*away_score smallint,/i.test(migration), "Score non nullable come richiesto.");
assert(!/home_score smallint[^,]*default\s+0/i.test(migration), "Score mancante convertito in zero.");
assert(/rollback;\s*$/i.test(smoke.trim()), "Lo smoke non termina con rollback.");
assert(/explain \(analyze, buffers/i.test(smoke), "EXPLAIN reale non predisposto.");
assert(/information_schema\.role_table_grants/i.test(smoke), "Verifica privilegi assente.");
assert(/generate_series\(1, 10361\)/i.test(benchmark), "Volume benchmark non allineato a DATA-0.");
assert(occurrences(benchmark, /explain \(analyze, buffers/gi) === 4, "Piani benchmark incompleti.");
assert(/claim_football_sync_jobs/i.test(benchmark), "Claim queue non verificato nel benchmark.");
assert(/rollback;\s*$/i.test(benchmark.trim()), "Il benchmark non termina con rollback.");
assert(/apply_football_data1_batch/i.test(batchTest), "La funzione batch non è testata.");
assert(/stale match update was accepted/i.test(batchTest), "Protezione stale non testata.");
assert(/replay duplicated/i.test(batchTest), "Replay non testato.");
assert(/rollback;\s*$/i.test(batchTest.trim()), "Il test batch non termina con rollback.");

console.log(
  JSON.stringify(
    {
      status: "static-contract-valid",
      migrationTransaction: true,
      supabaseMigrationSynchronized: true,
      batchMigrationSynchronized: true,
      footballTables: expectedFootballTables.length,
      privateTables: expectedPrivateTables.length,
      indexes: occurrences(migration, /create index /gi),
      rlsTables: occurrences(migration, /enable row level security;/gi),
      clientDirectGrants: 0,
      rawPersistenceColumns: 0,
      runtimeDatabaseVerifiedByThisCommand: false,
      runtimeVerification: "separate smoke and benchmark suite",
    },
    null,
    2,
  ),
);
