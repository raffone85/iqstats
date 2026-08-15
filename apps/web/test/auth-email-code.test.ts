import assert from "node:assert/strict";
import test from "node:test";

import {
  isEmailCodePublicErrorCode,
  normalizeEmailCode,
  normalizeEmailCodeAddress,
  publicEmailCodeDeliveryError,
  publicEmailCodeVerificationError,
} from "../src/lib/auth/email-code.ts";

test("normalizza email reali senza accettare input incompleti", () => {
  assert.equal(normalizeEmailCodeAddress("  Persona@Example.ORG  "), "persona@example.org");
  assert.equal(normalizeEmailCodeAddress("persona@example"), null);
  assert.equal(normalizeEmailCodeAddress("persona @example.org"), null);
  assert.equal(normalizeEmailCodeAddress(null), null);
});

test("accetta soltanto un codice numerico di sei cifre", () => {
  assert.equal(normalizeEmailCode(" 012345 "), "012345");
  assert.equal(normalizeEmailCode("12345"), null);
  assert.equal(normalizeEmailCode("12345a"), null);
  assert.equal(normalizeEmailCode(null), null);
});

test("espone soltanto errori di consegna sanificati e azionabili", () => {
  assert.deepEqual(publicEmailCodeDeliveryError({ code: "email_address_invalid" }), {
    code: "invalid_email",
    status: 422,
  });
  assert.deepEqual(publicEmailCodeDeliveryError({ code: "email_address_not_authorized" }), {
    code: "email_delivery_restricted",
    status: 503,
  });
  assert.deepEqual(publicEmailCodeDeliveryError({ code: "over_email_send_rate_limit" }), {
    code: "rate_limited",
    status: 429,
  });
  assert.deepEqual(publicEmailCodeDeliveryError(new Error("dettaglio interno")), {
    code: "auth_unavailable",
    status: 503,
  });
});

test("un OTP scaduto non espone dettagli interni", () => {
  assert.deepEqual(publicEmailCodeVerificationError({ code: "otp_expired" }), {
    code: "invalid_code",
    status: 422,
  });
  assert.deepEqual(publicEmailCodeVerificationError({ code: "over_request_rate_limit" }), {
    code: "rate_limited",
    status: 429,
  });
  assert.deepEqual(publicEmailCodeVerificationError(new Error("dettaglio interno")), {
    code: "auth_unavailable",
    status: 503,
  });
  assert.equal(isEmailCodePublicErrorCode("invalid_code"), true);
  assert.equal(isEmailCodePublicErrorCode("otp_expired"), false);
});
