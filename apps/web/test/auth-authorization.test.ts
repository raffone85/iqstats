import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_IN_COSTRUZIONE,
  accessoDaCantiere,
  authorizeFeature,
} from "../src/server/auth/access-policy.ts";

test("rejects unauthenticated requests before checking entitlements", async () => {
  let checked = false;
  const decision = await authorizeFeature("matches.list.read", {
    getUserId: async () => null,
    hasEntitlement: async () => {
      checked = true;
      return true;
    },
  });

  assert.deepEqual(decision, {
    allowed: false,
    status: 401,
    code: "unauthenticated",
  });
  assert.equal(checked, false);
});

test("denies a feature absent from the user's active entitlements", async () => {
  const decision = await authorizeFeature("match.statistics.read", {
    getUserId: async () => "user-1",
    hasEntitlement: async () => false,
  });

  assert.deepEqual(decision, {
    allowed: false,
    status: 403,
    code: "feature_not_entitled",
  });
});

test("allows only an explicitly active feature", async () => {
  const decision = await authorizeFeature("odds.snapshot.read", {
    getUserId: async () => "user-1",
    hasEntitlement: async (_userId, feature) => feature === "odds.snapshot.read",
  });

  assert.deepEqual(decision, { allowed: true, userId: "user-1" });
});

/**
 * L'accesso da cantiere, dal 31 agosto 2026.
 *
 * Il muro e' finito in produzione mentre l'applicazione e' ancora in costruzione e i
 * pagamenti sono in modalita' di prova: chi la costruisce si e' trovato davanti a una
 * cassa che non incassa. Finche' `APP_IN_COSTRUZIONE` e' vera le pagine sono aperte, e
 * questa prova diventa rossa il giorno in cui qualcuno la rimette a `false` senza
 * accorgersene, oppure cambia la forma della decisione.
 */
test("finche' l'applicazione e' in costruzione l'accesso alle pagine e' libero", () => {
  const decisione = accessoDaCantiere();
  assert.equal(APP_IN_COSTRUZIONE, true);
  assert.deepEqual(decisione, { allowed: true, userId: "" });
});

test("la politica sotto resta severa, e non e' stata spenta insieme al muro", async () => {
  const senzaDiritto = await authorizeFeature("engine.read", {
    async getUserId() { return "utente"; },
    async hasEntitlement() { return false; },
  });
  assert.equal(senzaDiritto.allowed, false);
});
