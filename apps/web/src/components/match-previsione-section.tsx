import type { PrevisioneGara } from "@/server/iqstats/previsione-gara";

export function MatchPrevisioneSection({ previsione }: { readonly previsione: PrevisioneGara }) {
  if (previsione.voci.length === 0) return null;
  return (
    <section className="dossier-panel" aria-labelledby="previsione-title">
      <p className="dossier-kick">Previsione</p>
      <h2 id="previsione-title" className="sr-only-heading">Che gara è attesa</h2>
      <p className="dossier-verdict-lead">{previsione.titolo}</p>
      <ol className="analisi-punti">
        {previsione.voci.map((voce) => (
          <li key={voce.etichetta}>
            <span className="analisi-titoletto">{voce.etichetta}</span>
            {" "}
            <span>{voce.testo}</span>
          </li>
        ))}
      </ol>
      <p className="dossier-src">
        Quattro frasi al massimo, tutte nate da numeri già in pagina. Non è un pronostico
        chiuso e non dice quanto mettere.
      </p>
    </section>
  );
}
