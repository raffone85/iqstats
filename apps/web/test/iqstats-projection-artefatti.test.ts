/**
 * Gli artefatti che l'applicazione porta con se' sono quelli che Python ha generato?
 *
 * Vivono in due posti: `scripts/projection/models/output/artefatti/`, dove li scrive
 * l'esportatore, e `apps/web/src/server/iqstats/projection/artefatti/`, da dove il
 * pacchetto di produzione li importa. Due verita' in due posti divergono in silenzio, e
 * questo progetto ne ha gia' pagate tre: qui la divergenza fa rosso.
 *
 * Si verificano tre cose, e la terza e' quella che conta:
 *
 * 1. i byte della copia sono identici a quelli dell'originale;
 * 2. l'impronta dichiarata nel file `.sha256` accanto corrisponde ai byte;
 * 3. i sette portati in produzione sono **esattamente** quelli che il registro dichiara
 *    `production` — ne' uno in piu' ne' uno in meno.
 *
 * Esecuzione: npm run test:projection-artefatti
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { ARTEFATTI_DI_PRODUZIONE } from "../src/server/iqstats/projection-artefatti.ts";

const RADICE = resolve(import.meta.dirname, "..", "..", "..");
const GENERATI = join(RADICE, "scripts", "projection", "models", "output", "artefatti");
const PORTATI = join(RADICE, "apps", "web", "src", "server", "iqstats", "artefatti");

function promossiDalRegistro(): string[] {
  const registro = JSON.parse(
    readFileSync(join(RADICE, "data", "registro-modelli.json"), "utf8"),
  ) as { modelli: { model_id: string; stato: string }[] };
  return registro.modelli
    .filter((voce) => voce.stato === "production")
    .map((voce) => voce.model_id)
    .sort();
}

test("i sette portati in produzione sono quelli che il registro promuove", () => {
  const dalRegistro = promossiDalRegistro();
  const dalPacchetto = Array.from(ARTEFATTI_DI_PRODUZIONE.values())
    .map((artefatto) => artefatto.model_id)
    .sort();

  assert.deepEqual(
    dalPacchetto, dalRegistro,
    "il pacchetto e il registro non sono d'accordo su chi va in produzione",
  );
  assert.equal(dalRegistro.length, 7, "attesi sette modelli promossi, uno per bersaglio");

  const bersagli = new Set(
    Array.from(ARTEFATTI_DI_PRODUZIONE.values()).map((artefatto) => artefatto.target),
  );
  assert.equal(bersagli.size, 7, "un bersaglio ha piu' di un artefatto promosso");
});

test("i file portati sono identici a quelli generati, byte per byte", () => {
  const portati = readdirSync(PORTATI).filter((nome) => nome.endsWith(".json"));
  assert.equal(portati.length, 7, "attesi sette artefatti nella cartella del pacchetto");

  for (const nome of portati) {
    const copia = readFileSync(join(PORTATI, nome));
    const originale = readFileSync(join(GENERATI, nome));
    assert.ok(
      copia.equals(originale),
      nome + ": la copia nel pacchetto non e' quella generata da Python",
    );

    const impronta = createHash("sha256").update(copia).digest("hex");
    const dichiarata = readFileSync(join(PORTATI, nome + ".sha256"), "utf8").trim().toLowerCase();
    assert.equal(impronta, dichiarata, nome + ": i byte non corrispondono all'impronta");
  }
});

test("ogni artefatto promosso porta la misura completa della gara", () => {
  for (const [target, artefatto] of ARTEFATTI_DI_PRODUZIONE) {
    assert.equal(artefatto.stato, "production", target + ": stato non promosso");
    assert.ok(artefatto.maturita !== null, target + ": nessun parametro di maturita'");
    assert.ok(artefatto.affidabilita !== null, target + ": nessuna affidabilita'");
    assert.ok(
      artefatto.totale !== null && artefatto.totale !== undefined,
      target + ": nessuna calibrazione del totale",
    );
    assert.ok(
      artefatto.totale.affidabilita !== null && artefatto.totale.affidabilita !== undefined,
      target + ": nessuna affidabilita' del totale",
    );
  }
});
