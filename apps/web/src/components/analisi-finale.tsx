import type { Analisi, Voce } from "@/server/iqstats/analisi-finale";

/**
 * L'analisi finale, in fondo al dossier.
 *
 * **Prosa, e ogni frase porta al capitolo da cui esce.** Il collegamento non e' un ornamento:
 * e' il modo in cui questa sezione resta una rilettura e non diventa la scorciatoia per
 * saltare i numeri. Qui non c'e' nessuna cifra - stanno tutte nei capitoli, con il loro
 * campione e il loro metro - e chi vuole la prova di una frase la raggiunge con un tocco.
 *
 * **Il secondo elenco e' quello che nessun capitolo puo' fare di se':** i limiti sono gia'
 * dichiarati dove nascono, ma sparsi su undicimila pixel; qui stanno in fila.
 */
function Riga({ voce }: { readonly voce: Voce }) {
  return (
    <li>
      <span>{voce.testo}</span>
      {/* Il rimando sta su riga propria e non in fondo alla frase: un collegamento inline e'
          alto quanto il testo, cioe' meno del minimo tattile del design system, e due frasi
          corte di fila lo metterebbero a ridosso di quello sotto. */}
      <a href={`#${voce.ancora}`}>{voce.capitolo}</a>
    </li>
  );
}

export function AnalisiFinale({ analisi }: { readonly analisi: Analisi | null }) {
  if (analisi === null) return null;
  return (
    <section className="dossier-panel analisi" aria-labelledby="analisi-title">
      <p className="dossier-kick">Analisi finale</p>
      <h2 id="analisi-title" className="sr-only-heading">
        La rilettura in parole di quello che sta sopra
      </h2>
      {analisi.dice.length === 0 ? null : (
        <ul className="analisi-voci">
          {analisi.dice.map((voce) => <Riga key={`${voce.ancora}-${voce.testo}`} voce={voce} />)}
        </ul>
      )}
      {analisi.limiti.length === 0 ? null : (
        <>
          <p className="analisi-titoletto">Quello che questo dossier non dice</p>
          <ul className="analisi-voci analisi-limiti">
            {analisi.limiti.map((voce) => (
              <Riga key={`${voce.ancora}-${voce.testo}`} voce={voce} />
            ))}
          </ul>
        </>
      )}
      <p className="dossier-src">{analisi.nota}</p>
    </section>
  );
}
