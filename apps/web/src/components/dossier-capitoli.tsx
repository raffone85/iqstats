"use client";

// La barra dei capitoli del dossier: dice sempre dove sei mentre scorri.
//
// **Perche' esiste.** Misurato a 375 px su una gara reale, il dossier e' alto **31.462 px**:
// circa trentanove schermate di telefono, ventuno blocchi in fila e nessun titolo che
// separi un argomento dall'altro. I numeri ci sono tutti, ma per sapere dove si e' arrivati
// bisogna leggere il contenuto.
//
// **Non aggiunge contenuto e non sposta niente.** Le intestazioni di capitolo stanno gia' in
// pagina; questa barra le segue e basta. Chi arriva da un collegamento diretto o da una
// ricerca trova la pagina identica a prima, con un indice in cima.
//
// **Senza JavaScript resta un indice funzionante:** i collegamenti sono ancore vere, quindi
// portano al capitolo anche se l'osservatore non parte. Solo l'evidenziazione del capitolo
// corrente ha bisogno del client.
import { useEffect, useState } from "react";

export interface Capitolo {
  /** L'`id` dell'intestazione in pagina, senza cancelletto. */
  readonly id: string;
  readonly nome: string;
}

type Props = Readonly<{ capitoli: readonly Capitolo[] }>;

export function DossierCapitoli({ capitoli }: Props) {
  const [corrente, setCorrente] = useState<string | null>(capitoli[0]?.id ?? null);

  useEffect(() => {
    const intestazioni = capitoli
      .map((c) => document.getElementById(c.id))
      .filter((n): n is HTMLElement => n !== null);
    if (intestazioni.length === 0) return;

    // **Si osserva una fascia alta in cima, non il centro dello schermo.** Un capitolo lungo
    // resta corrente per tutta la sua altezza: con il centro, un blocco piu' alto della
    // finestra farebbe sparire l'evidenziazione mentre lo si sta ancora leggendo.
    const osservatore = new IntersectionObserver(
      (voci) => {
        const entrate = voci
          .filter((v) => v.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (entrate[0]) { setCorrente(entrate[0].target.id); return; }
        // Nessuna intestazione nella fascia: corrente e' l'ultima gia' superata.
        const superate = intestazioni.filter((n) => n.getBoundingClientRect().top < 96);
        const ultima = superate[superate.length - 1];
        if (ultima) setCorrente(ultima.id);
      },
      { rootMargin: "-56px 0px -80% 0px", threshold: 0 },
    );
    for (const nodo of intestazioni) osservatore.observe(nodo);
    return () => { osservatore.disconnect(); };
  }, [capitoli]);

  if (capitoli.length < 2) return null;

  return (
    <nav className="dossier-capitoli" aria-label="Capitoli del dossier">
      <ul>
        {capitoli.map((c) => (
          <li key={c.id}>
            <a
              href={`#${c.id}`}
              className={c.id === corrente ? "is-corrente" : undefined}
              aria-current={c.id === corrente ? "true" : undefined}
            >
              {c.nome}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * L'intestazione di un capitolo, con la riga che dice che cosa ci si trova dentro.
 *
 * Il sottotitolo non e' decorazione: e' la risposta a «dove sono e che cosa sto guardando»,
 * che su una pagina lunga trentanove schermate nessun titolo da solo riesce a dare.
 */
export function DossierCapitolo({
  id,
  nome,
  descrizione,
}: Readonly<{ id: string; nome: string; descrizione: string }>) {
  return (
    <div className="dossier-capitolo">
      <h2 id={id}>{nome}</h2>
      <p>{descrizione}</p>
    </div>
  );
}
