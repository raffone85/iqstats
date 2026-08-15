import type { Metadata } from "next";

import { ProductShell } from "@/components/product-shell";

export const metadata: Metadata = {
  title: "Le mie giocate",
  description: "Schedine salvate, track-record e calibrazione. Sezione in preparazione.",
};

export default function GiocatePage() {
  return (
    <ProductShell activeSection="mybets">
      <div className="oggi-backdrop" aria-hidden="true" />
      <section className="oggi" aria-labelledby="giocate-title" aria-live="polite">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Le mie giocate</span>
          <span className="oggi-line" aria-hidden="true" />
        </div>
        <div className="oggi-empty">
          <h2 id="giocate-title">Sezione in preparazione</h2>
          <p>
            Schedine salvate, track-record e calibrazione arriveranno in una fase successiva
            della migrazione, legate al tuo accesso verificato. Nessun contenuto viene
            simulato.
          </p>
        </div>
      </section>
    </ProductShell>
  );
}
