import "server-only";

import Stripe from "stripe";

import { serverEnv } from "@/server/config/env";

let stripeClient: Stripe | undefined;

export function getStripeClient(): Stripe {
  const secretKey = serverEnv.stripeSecretKey();
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Stripe live mode is not enabled for IQstatS");
  }
  stripeClient ??= new Stripe(secretKey);
  return stripeClient;
}
