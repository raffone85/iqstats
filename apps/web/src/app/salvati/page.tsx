import type { Metadata } from "next";

import { ProductShell } from "@/components/product-shell";
import { PronosticiSalvati } from "@/components/pronostici-salvati";

export const metadata: Metadata = {
  title: "Pronostici salvati",
  description:
    "Le schede dei pronostici che hai salvato dalle gare, con l'ora della lettura. Restano su questo dispositivo.",
};

/**
 * Le schede salvate dalle gare. La pagina e' una cornice: l'elenco vive nella memoria del
 * browser, quindi lo legge il componente client e il server non ne sa niente.
 */
export default function SalvatiPage() {
  return (
    <ProductShell activeSection="saved">
      <section className="page-intro" aria-labelledby="salvati-title">
        <p className="eyebrow">Salvati</p>
        <h1 id="salvati-title">I pronostici che ti sei portato via.</h1>
        <p>
          Ogni scheda è la lettura di una gara nel momento in cui l&apos;hai salvata: il
          pronostico e gli eventi più probabili, con la loro ora. Da qui riscarichi
          l&apos;immagine o riapri la gara per vedere i numeri di adesso.
        </p>
      </section>
      <PronosticiSalvati />
    </ProductShell>
  );
}
