import type { Metadata } from "next";

import { ProductShell } from "@/components/product-shell";

export const metadata: Metadata = {
  title: "Database",
  description: "Campionati, squadre, giocatori, arbitri, stadi e TV. Sezione in preparazione.",
};

export default function DatabasePage() {
  return (
    <ProductShell activeSection="database">
      <div className="oggi-backdrop" aria-hidden="true" />
      <section className="oggi" aria-labelledby="database-title" aria-live="polite">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Database</span>
          <span className="oggi-line" aria-hidden="true" />
        </div>
        <div className="oggi-empty">
          <h2 id="database-title">Sezione in preparazione</h2>
          <p>
            Campionati, squadre, giocatori, arbitri, stadi e TV saranno consultabili in una
            fase successiva della migrazione, con fonte e freschezza dichiarate. Nessun
            contenuto viene simulato.
          </p>
        </div>
      </section>
    </ProductShell>
  );
}
