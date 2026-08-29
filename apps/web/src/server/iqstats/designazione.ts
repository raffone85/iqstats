// L'avviso che va in testata quando la fonte non dichiara l'arbitro della gara.
//
// **Perche' esiste.** Su una gara senza designato la testata non scriveva niente: dove sta
// il riquadro dell'arbitro restava il vuoto, e l'assenza si trovava solo in fondo, dentro
// «Il contorno». Un blocco che sparisce senza una riga si legge come un guasto - e' lo
// stesso difetto gia' corretto per la proiezione assente e per i gol assenti - quindi
// l'assenza si dichiara dove starebbe il nome.
//
// **Le due assenze non sono la stessa cosa, e non si dicono con la stessa frase.** A gara
// lontana l'arbitro non c'e' ancora perche' nessuno l'ha designato, e dirlo e' un'informazione
// utile: si torna piu' avanti. A ridosso del calcio d'inizio, se manca, e' la fonte che non
// lo espone, e promettere una designazione sarebbe una promessa che non possiamo mantenere.
//
// **Le ventiquattro ore che la pagina promette sono prudenti, e la misura lo dice.** Sulle
// undici gare del Brasileirao in calendario fra il 29 agosto e il 2 settembre 2026, tutte e
// nove quelle entro quarantotto ore dal calcio d'inizio avevano gia' il designato - la piu'
// lontana a quarantadue ore - e nessuna delle due oltre, la piu' vicina delle quali a
// sessantasei ore. Chi legge trova quindi l'arbitro prima del momento promesso, non dopo.
// Il campione e' piccolo e di un campionato solo: se un giorno una lega smentisse la
// promessa, e' questo il numero da rimisurare.

/**
 * Le ore prima del calcio d'inizio entro cui la designazione risulta pubblicata.
 *
 * E' anche il numero che la pagina scrive: promettere ventiquattro ore e' prudente rispetto
 * a quello che abbiamo misurato - le nove gare entro le quarantotto ore avevano gia' il
 * designato, la piu' lontana a quarantadue ore dal calcio d'inizio - e oltre questa soglia
 * la promessa scade, quindi non si fa piu'.
 */
const ORE_DELLA_DESIGNAZIONE = 24;

export interface AvvisoArbitro {
  /** Che cosa manca, in due parole: la parola «Arbitro» la mette gia' l'etichetta accanto. */
  readonly titolo: string;
  /** Perche' manca e che cosa aspettarsi, nella riga di servizio sotto. */
  readonly riga: string;
}

/**
 * L'avviso da mostrare al posto del riquadro dell'arbitro.
 *
 * `kickoff` e' l'orario della gara in ISO; `adesso` si passa sempre, cosi' la funzione resta
 * pura e la prova puo' fissare il momento invece di inseguire l'orologio.
 */
export function avvisoSenzaArbitro(kickoff: string, adesso: Date): AvvisoArbitro {
  const quando = new Date(kickoff);
  const ore = Number.isNaN(quando.getTime())
    ? null
    : (quando.getTime() - adesso.getTime()) / 3_600_000;

  // Orario illeggibile o gara vicina: si dice che manca, senza dire quando arriverebbe.
  if (ore === null || ore <= ORE_DELLA_DESIGNAZIONE) {
    return {
      titolo: "non dichiarato dalla fonte",
      riga: "Il designato non risulta, e nessuna media viene messa al suo posto.",
    };
  }

  return {
    titolo: "non ancora designato",
    riga: "La fonte lo dichiara entro le ventiquattro ore prima del calcio d'inizio.",
  };
}
