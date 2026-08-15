import Link from "next/link";

import { ProductShell } from "@/components/product-shell";

export default function MatchNotFound() {
  return (
    <ProductShell>
      <section className="data-state">
        <p className="eyebrow">Partita non disponibile</p>
        <h1>Questa gara non è presente nella fonte normalizzata.</h1>
        <p>La disponibilità può cambiare. Torna alla lista per modificare o ripetere la ricerca.</p>
        <Link className="button-link" href="/partite">Torna alla lista</Link>
      </section>
    </ProductShell>
  );
}
