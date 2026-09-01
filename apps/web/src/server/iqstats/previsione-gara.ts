/**
 * La previsione pre-match in quattro frasi, nate solo da cio' che il dossier ha gia'.
 * Nessun dato nuovo, nessuna cifra inventata. Se manca il materiale, la voce resta fuori.
 */

export interface PrevisioneGara {
  readonly titolo: string;
  readonly voci: readonly {
    readonly etichetta: string;
    readonly testo: string;
  }[];
}

export function previsioneDellaGara(input: {
  readonly nomeCasa: string;
  readonly nomeFuori: string;
  readonly favorito: string | null;
  readonly golAttesi: number | null;
  readonly gg: number | null;
  readonly stile: string | null;
  readonly arbitroGiudizio: string | null;
  readonly senzaArbitro: boolean;
}): PrevisioneGara {
  const voci: { etichetta: string; testo: string }[] = [];

  if (input.favorito) {
    voci.push({
      etichetta: "Esito",
      testo: input.favorito,
    });
  }

  if (input.golAttesi !== null) {
    const fascia =
      input.golAttesi >= 3.1 ? "gara aperta sui gol"
        : input.golAttesi <= 2.2 ? "gara stretta sui gol"
          : "gara nella media sui gol";
    voci.push({
      etichetta: "Gol",
      testo: `${fascia}: ${input.golAttesi.toFixed(2).replace(".", ",")} attesi in novanta minuti.`,
    });
  }

  if (input.gg !== null) {
    voci.push({
      etichetta: "Entrambe",
      testo: input.gg >= 0.55
        ? `Entrambe segnano nel ${Math.round(input.gg * 100)}% dei casi del modello.`
        : `Una delle due resta a zero nel ${Math.round((1 - input.gg) * 100)}% dei casi del modello.`,
    });
  }

  if (input.stile) {
    voci.push({ etichetta: "Stile", testo: input.stile });
  }

  if (input.senzaArbitro) {
    voci.push({
      etichetta: "Arbitro",
      testo: "Il designato non c'e' ancora: tre letture di gioco restano senza il suo peso.",
    });
  } else if (input.arbitroGiudizio) {
    voci.push({
      etichetta: "Arbitro",
      testo: `Il designato, sul metro di questa competizione, e' ${input.arbitroGiudizio}.`,
    });
  }

  const titolo = voci.length === 0
    ? `${input.nomeCasa}\u2013${input.nomeFuori}: ancora senza una previsione che poggia su numeri.`
    : `Che gara e' attesa fra ${input.nomeCasa} e ${input.nomeFuori}.`;

  return { titolo, voci: voci.slice(0, 4) };
}
