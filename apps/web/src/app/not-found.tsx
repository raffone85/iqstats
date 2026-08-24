// La pagina che risponde quando un indirizzo non esiste.
//
// **Prima non c'era.** Next ne ha una di riserva, ma sta fuori dal sistema visivo e non
// dice dove andare: chi ci finiva vedeva un riquadro bianco con scritto 404. Ora la
// risposta e' dentro il prodotto, e porta le tre destinazioni che esistono davvero.
//
// Vale per tutta l'applicazione: la usano il dossier di una gara che la fonte dichiara
// assente e la scheda di un arbitro che non conosciamo, che gia' chiamavano `notFound()`
// e finivano sulla pagina di riserva.
import type { Metadata } from "next";
import Link from "next/link";

import { ProductShell } from "@/components/product-shell";

export const metadata: Metadata = {
  title: "Pagina non trovata",
  // **Lo stato HTTP resta 200, e questa riga e' il rimedio a cio' che quel 200 causa.**
  // Misurato sulla build di produzione: la risposta parte in streaming
  // (`Transfer-Encoding: chunked`), quindi gli header sono gia' stati inviati quando
  // `notFound()` viene raggiunto, e Next non puo' piu' cambiare il codice. Un 404 vero
  // richiede di togliere lo streaming al livello del layout, che e' una decisione
  // architetturale e non una riga. Nel frattempo il danno concreto - un indirizzo che non
  // esiste finisce negli indici come pagina valida - si chiude dichiarando `noindex`.
  robots: { index: false, follow: true },
};

export default function NonTrovata() {
  return (
    <ProductShell>
      <section className="oggi" aria-labelledby="non-trovata-title">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Non trovata</span>
          <span className="oggi-line" aria-hidden="true" />
        </div>
        <div className="oggi-empty">
          <h2 id="non-trovata-title">Questo indirizzo non esiste</h2>
          <p>
            La pagina che hai chiesto non c&apos;è: può essere un collegamento vecchio, oppure
            una gara o un arbitro che la nostra fonte non conosce. Non mostriamo una pagina
            vuota al posto di una che manca.
          </p>
          <nav className="partite-index" aria-label="Dove andare">
            <Link className="partite-index-link" href="/">Home</Link>
            <Link className="partite-index-link" href="/partite">Partite</Link>
            <Link className="partite-index-link" href="/arbitri">Arbitri</Link>
            <Link className="partite-index-link" href="/metodo">Metodo</Link>
          </nav>
        </div>
      </section>
    </ProductShell>
  );
}
