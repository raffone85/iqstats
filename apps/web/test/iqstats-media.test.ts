import assert from "node:assert/strict";
import test from "node:test";

import { GatewayError } from "../src/server/iqstats/errors.ts";
import { ProviderMediaClient } from "../src/server/iqstats/media-client.ts";

test("richiede un tipo media e un ID validi prima di contattare la fonte", async () => {
  let calls = 0;
  const client = new ProviderMediaClient({
    baseUrl: "https://provider.example/",
    fetchImplementation: async () => {
      calls += 1;
      return new Response(null, { status: 404 });
    },
  });

  await assert.rejects(client.getImage("unknown", "35"), GatewayError);
  await assert.rejects(client.getImage("team", "0"), GatewayError);
  assert.equal(calls, 0);
});

test("usa soltanto il percorso media consentito e conserva il corpo binario", async () => {
  let target = "";
  let request: RequestInit | undefined;
  const client = new ProviderMediaClient({
    baseUrl: "https://provider.example/",
    fetchImplementation: async (input, init) => {
      target = String(input);
      request = init;
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "Content-Type": "image/png", "Content-Length": "4" },
      });
    },
  });

  const result = await client.getImage("team", "35");

  assert.equal(target, "https://provider.example/img/team/35/?bg=transparent");
  assert.equal(request?.method, "GET");
  assert.equal(result.status, "available");
  if (result.status === "available") {
    assert.equal(result.contentType, "image/png");
    assert.deepEqual([...new Uint8Array(await new Response(result.body).arrayBuffer())], [137, 80, 78, 71]);
  }
});

test("traduce assenza e risposte non immagine senza esporre il provider", async () => {
  const absentClient = new ProviderMediaClient({
    baseUrl: "https://provider.example/",
    fetchImplementation: async () => new Response(null, { status: 404 }),
  });
  assert.deepEqual(await absentClient.getImage("league", "7"), { status: "absent" });

  const invalidClient = new ProviderMediaClient({
    baseUrl: "https://provider.example/",
    fetchImplementation: async () => new Response("not an image", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    }),
  });
  await assert.rejects(
    invalidClient.getImage("player", "12994"),
    (reason: unknown) => reason instanceof GatewayError && reason.code === "source_invalid_response",
  );
});

test("interrompe uno stream che supera il limite binario anche senza content-length", async () => {
  const client = new ProviderMediaClient({
    baseUrl: "https://provider.example/",
    fetchImplementation: async () =>
      new Response(new Uint8Array(5 * 1024 * 1024 + 1), {
        status: 200,
        headers: { "Content-Type": "image/webp" },
      }),
  });

  const result = await client.getImage("venue", "42");
  assert.equal(result.status, "available");
  if (result.status === "available") {
    await assert.rejects(new Response(result.body).arrayBuffer(), GatewayError);
  }
});
