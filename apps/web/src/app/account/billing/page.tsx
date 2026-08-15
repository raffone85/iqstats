import Link from "next/link";

import { BillingPlanSelector } from "@/components/billing-plan-selector";
import { ProductShell } from "@/components/product-shell";
import { getBillingPageData } from "@/server/billing/catalog";

export const dynamic = "force-dynamic";
  const checkoutAvailable = true;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "long",
    timeZone: "Europe/Rome",
  }).format(new Date(value));
}

export default async function BillingPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>) {
  const [query, billing] = await Promise.all([searchParams, getBillingPageData()]);
  const checkoutState = scalar(query.checkout);

  return (
    <ProductShell activeSection="billing">
      <section className="page-intro billing-intro" aria-labelledby="billing-title">
        <p className="eyebrow">Piani e fatturazione</p>
        <h1 id="billing-title">Scegli l&apos;accesso che ti serve, con regole chiare.</h1>
        <p>
          Ogni piano apre soltanto le sezioni che comprende. Quello che vedi in pagina non
          decide nulla: l&apos;accesso vero è quello registrato sul tuo account.
        </p>
      </section>

      {checkoutState === "success" ? (
        <section className="billing-feedback billing-feedback-success" role="status" aria-live="polite">
          <h2>Sei tornato dal pagamento</h2>
          <p>Essere tornati qui non basta a confermare l&apos;accesso: si aggiorna quando il pagamento risulta andato a buon fine.</p>
        </section>
      ) : checkoutState === "canceled" ? (
        <section className="billing-feedback billing-feedback-neutral" role="status" aria-live="polite">
          <h2>Pagamento non completato</h2>
          <p>Nessun accesso è stato modificato. Puoi rivedere i piani quando vuoi.</p>
        </section>
      ) : null}

      {billing.kind === "unauthenticated" ? (
        <section className="data-state" aria-labelledby="billing-auth-title">
          <p className="eyebrow">Accesso richiesto</p>
          <h2 id="billing-auth-title">Accedi per consultare i piani disponibili.</h2>
          <p>I piani e il pagamento si vedono soltanto dopo essere entrati.</p>
          <Link className="button-link" href="/partite">Torna alle partite</Link>
        </section>
      ) : billing.kind === "unavailable" ? (
        <section className="data-state" role="status" aria-live="polite" aria-labelledby="billing-unavailable-title">
          <p className="eyebrow">Catalogo non disponibile</p>
          <h2 id="billing-unavailable-title">Non possiamo verificare i piani in questo momento.</h2>
          <p>Non viene mostrato alcun piano sostitutivo. Riprova più tardi.</p>
        </section>
      ) : billing.plans.length === 0 ? (
        <section className="data-state" role="status" aria-live="polite" aria-labelledby="billing-empty-title">
          <p className="eyebrow">Catalogo senza piani attivi</p>
          <h2 id="billing-empty-title">Non sono disponibili piani attivabili.</h2>
          <p>Non mettiamo un piano al posto di quelli veri: quando ci sono, compaiono qui.</p>
        </section>
      ) : (
        <>
          {billing.currentSubscription ? (
            <section className="billing-current-plan" aria-labelledby="billing-current-plan-title">
              <p className="eyebrow">Accesso attuale</p>
              <h2 id="billing-current-plan-title">
                {billing.currentSubscription.planName ?? "Piano commerciale attivo"}
              </h2>
              <p>
                Valido fino al {formatDate(billing.currentSubscription.currentPeriodEnd)}.
                {billing.currentSubscription.cancelAtPeriodEnd
                  ? " Il rinnovo è disattivato al termine del periodo."
                  : ""}
              </p>
            </section>
          ) : null}
          <BillingPlanSelector plans={billing.plans} checkoutAvailable={checkoutAvailable} />
        </>
      )}

      <section className="method-panel billing-method-panel" aria-labelledby="billing-method-title">
        <p className="eyebrow">Come funziona</p>
        <h2 id="billing-method-title">Scegliere un piano non apre l&apos;accesso da solo.</h2>
        <p>
          Quando scegli, ci dici quale piano vuoi: nient&apos;altro. L&apos;accesso si apre solo
          quando il pagamento risulta andato a buon fine, e quel controllo avviene fuori dalla
          pagina che stai guardando.
        </p>
      </section>
    </ProductShell>
  );
}
