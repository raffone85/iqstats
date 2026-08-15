import type { Metadata } from "next";
import Link from "next/link";

import { ProductShell } from "@/components/product-shell";

export const metadata: Metadata = {
  title: "Metodo e limiti",
  description:
    "Come IQstatS tiene separate provenienza, ordine, calcolo e presentazione dei dati di una gara, e che cosa dichiara quando un dato manca.",
};

const layers = [
  {
    title: "Da dove arriva",
    body: "Ogni dato porta con sé da dove viene e quando è stato letto. Al tuo browser arriva la versione già verificata, mai il materiale grezzo.",
  },
  {
    title: "Una lingua sola",
    body: "Gli stessi fatti arrivano con nomi diversi a seconda di chi li fornisce. Qui vengono riportati tutti allo stesso vocabolario, così una voce vuol dire sempre la stessa cosa.",
  },
  {
    title: "Cosa c'è e cosa manca",
    body: "Ogni sezione dichiara se è completa, parziale, assente, vecchia o in errore. Un dato che manca resta mancante: non diventa uno zero.",
  },
  {
    title: "Su quante gare poggia",
    body: "Quando un numero è calcolato, restano scritti il campione e il periodo su cui poggia. Se non possiamo dichiararli, il numero non si mostra.",
  },
];

export default function MethodPage() {
  return (
    <ProductShell activeSection="method">
      <section className="page-intro method-intro" aria-labelledby="method-page-title">
        <p className="eyebrow">Metodo IQstatS</p>
        <h1 id="method-page-title">Leggere una gara significa poter verificare anche i suoi limiti.</h1>
        <p>
          Teniamo separate quattro cose: da dove arriva un dato, come viene messo in ordine,
          come viene calcolato e come te lo mostriamo. Meglio una lettura che puoi verificare
          di un numero che non sai da dove esce.
        </p>
      </section>

      <section className="method-principles" aria-labelledby="method-principles-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Quattro passaggi</p>
            <h2 id="method-principles-title">Il dato resta leggibile dall&apos;inizio alla fine.</h2>
          </div>
          <p>Nessun passaggio ha il permesso di riempire con una supposizione ciò che manca.</p>
        </div>
        <div className="method-principles-grid">
          {layers.map((layer, index) => (
            <article className="method-principle" key={layer.title}>
              <span aria-hidden="true">0{index + 1}</span>
              <h3>{layer.title}</h3>
              <p>{layer.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="method-boundaries" aria-labelledby="boundaries-title">
        <p className="eyebrow">Confini espliciti</p>
        <h2 id="boundaries-title">Cosa non fa IQstatS.</h2>
        <ul>
          <li>Non trasforma un dato mancante in un numero inventato o in una previsione di esempio.</li>
          <li>Non presenta un&apos;analisi come una promessa di risultato, e non accetta né automatizza scommesse.</li>
          <li>Non lascia passare dal browser chiavi, dati grezzi o decisioni sul tuo accesso.</li>
          <li>Non apre una funzione a pagamento solo perché la pagina la mostra.</li>
        </ul>
      </section>

      <section className="method-panel method-cta-panel" aria-labelledby="method-cta-title">
        <p className="eyebrow">Consultazione</p>
        <h2 id="method-cta-title">Apri una gara e vedi solo ciò che i dati coprono davvero.</h2>
        <p>
          Nell&apos;elenco delle gare i filtri, la disponibilità e il ritorno al dossier
          restano verificabili. Le sezioni senza dati vengono dichiarate, non riempite.
        </p>
        <Link className="button-link" href="/partite">
          Vai alle partite
        </Link>
      </section>
    </ProductShell>
  );
}
