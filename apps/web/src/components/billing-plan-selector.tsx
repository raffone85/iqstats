"use client";

import { useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type BillingFeature = Readonly<{
  code: string;
  description: string;
}>;

export type BillingPlanCard = Readonly<{
  code: string;
  name: string;
  billingMode: "one_time" | "subscription";
  billingInterval: "month" | "year" | null;
  accessDurationDays: number | null;
  currency: string;
  unitAmount: number;
  features: readonly BillingFeature[] | null;
}>;

type CheckoutResponse = Readonly<{ url: string }>;

function isCheckoutResponse(value: unknown): value is CheckoutResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "url" in value &&
    typeof value.url === "string"
  );
}

function priceLabel(plan: BillingPlanCard) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: plan.currency,
  }).format(plan.unitAmount / 100);
}

function cadenceLabel(plan: BillingPlanCard) {
  if (plan.billingMode === "one_time") {
    return plan.accessDurationDays
      ? `Pagamento singolo · accesso per ${plan.accessDurationDays} giorni`
      : "Pagamento singolo";
  }
  return plan.billingInterval === "year" ? "Abbonamento annuale" : "Abbonamento mensile";
}

export function BillingPlanSelector({
  plans,
  checkoutAvailable,
}: Readonly<{
  plans: readonly BillingPlanCard[];
  checkoutAvailable: boolean;
}>) {
  const [pendingPlanCode, setPendingPlanCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function startCheckout(planCode: string) {
    if (!checkoutAvailable) return;
    setPendingPlanCode(planCode);
    setErrorMessage(null);

    try {
      const { data, error } = await getSupabaseBrowserClient().functions.invoke(
        "create-checkout-session",
        { body: { planCode } },
      );
      if (error || !isCheckoutResponse(data)) throw new Error("Checkout session unavailable");

      const checkoutUrl = new URL(data.url);
      if (checkoutUrl.protocol !== "https:") throw new Error("Invalid checkout destination");

      window.location.assign(checkoutUrl.toString());
    } catch {
      setPendingPlanCode(null);
      setErrorMessage(
        "Non riusciamo ad aprire il pagamento in questo momento. Il tuo accesso non è cambiato: riprova scegliendo un piano.",
      );
    }
  }

  return (
    <section className="billing-catalog" aria-labelledby="billing-plans-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">I piani</p>
          <h2 id="billing-plans-title">Scegli il tuo livello di accesso</h2>
        </div>
        <p>Quello che ogni piano include è scritto qui sotto, per esteso.</p>
      </div>

      {errorMessage ? (
        <p className="billing-feedback billing-feedback-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {!checkoutAvailable ? (
        <p className="billing-feedback billing-feedback-neutral" role="status">
          Il pagamento non è ancora attivo: puoi vedere i piani, non scegliere.
        </p>
      ) : null}

      <ol className="billing-plan-grid">
        {plans.map((plan) => {
          const isPending = pendingPlanCode === plan.code;
          return (
            <li key={plan.code} className="billing-plan-card">
              <div className="billing-plan-heading">
                <p className="billing-plan-cadence">{cadenceLabel(plan)}</p>
                <h3>{plan.name}</h3>
                <p className="billing-plan-price">{priceLabel(plan)}</p>
              </div>

              {plan.features ? (
                <ul className="billing-feature-list" aria-label={`Funzionalità incluse in ${plan.name}`}>
                  {plan.features.map((feature) => (
                    <li key={feature.code}>{feature.description}</li>
                  ))}
                </ul>
              ) : (
                <p className="billing-feature-unavailable">
                  Per questo piano non abbiamo l&apos;elenco di cosa include.
                </p>
              )}

              <button
                type="button"
                className="billing-checkout-button"
                disabled={!checkoutAvailable || pendingPlanCode !== null}
                aria-describedby={errorMessage ? "billing-checkout-feedback" : undefined}
                onClick={checkoutAvailable ? () => startCheckout(plan.code) : undefined}
              >
                {!checkoutAvailable
                  ? "Pagamento non disponibile"
                  : isPending
                    ? "Ti stiamo portando al pagamento…"
                    : `Scegli ${plan.name}`}
              </button>
            </li>
          );
        })}
      </ol>

      <p id="billing-checkout-feedback" className="billing-feedback" role="status" aria-live="polite">
        {!checkoutAvailable
          ? "Finché il pagamento non è attivo, nessun piano può essere scelto."
          : pendingPlanCode
          ? "Stiamo aprendo il pagamento sicuro."
          : "L’accesso si apre quando il pagamento risulta andato a buon fine."}
      </p>
    </section>
  );
}
