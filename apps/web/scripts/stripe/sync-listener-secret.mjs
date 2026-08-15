import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const secretFile = process.argv[2];
if (!secretFile) throw new Error("A Stripe CLI secret file path is required");

const secretBytes = readFileSync(secretFile);
const secretText =
  secretBytes[0] === 0xff && secretBytes[1] === 0xfe
    ? secretBytes.toString("utf16le")
    : secretBytes.toString("utf8");
const webhookSecret = secretText.replace(/^\uFEFF/, "").match(/\bwhsec_[A-Za-z0-9_-]+\b/)?.[0];
if (!webhookSecret) {
  throw new Error("Stripe CLI did not return a valid webhook signing secret");
}

const envPath = resolve(process.cwd(), ".env.local");
const current = readFileSync(envPath, "utf8");
const newline = current.includes("\r\n") ? "\r\n" : "\n";
const lines = current.split(/\r?\n/);
const variable = "STRIPE_WEBHOOK_SECRET";
const index = lines.findIndex((line) => new RegExp(`^\\s*${variable}\\s*=`).test(line));

if (index >= 0) lines[index] = `${variable}=${webhookSecret}`;
else lines.push(`${variable}=${webhookSecret}`);

writeFileSync(envPath, lines.join(newline), { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ stripeWebhookSecret: "updated_from_cli" }));
