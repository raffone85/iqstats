import assert from "node:assert/strict";
import test from "node:test";

import { authorizeFeature } from "../src/server/auth/access-policy.ts";

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
