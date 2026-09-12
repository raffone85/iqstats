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
//
// **Rimisurata su un secondo campionato il 12 settembre 2026, e regge.** L'utente ha chiesto
// come fosse possibile che Monza-Sassuolo del 18 settembre dicesse ancora «non ancora
// designato». Sulle sedici gare di Serie A in calendario fra il 13 e il 20 settembre:
//
// | quando | gare | con il designato |
// | --- | ---: | ---: |
// | giornata 4, entro 47 ore | 6 | **6** |
// | giornata 5, oltre 142 ore | 10 | **0** |
//
// La piu' lontana con l'arbitro era Inter-Udinese a quarantasette ore; la piu' vicina senza
// era proprio Monza-Sassuolo a centoquarantadue. **Manca la giornata intera, non quella
// gara:** la designazione arriva per turno, non per singola partita, e la fonte risponde
// `referee_id: null` su tutte e dieci. Il numero scritto in pagina resta ventiquattro perche'
// promettere quarantasette vorrebbe dire legarsi al campionato piu' rapido dei due misurati:
// una lega piu' lenta renderebbe falsa la promessa, mentre cosi' e' solo pessimista.
//
// Il campione resta piccolo, ma ora sono due campionati e due continenti: se un giorno una
// lega smentisse la promessa, e' questo il numero da rimisurare.

/**
 * Le ore prima del calcio d'inizio entro cui la designazione risulta pubblicata.
 *
 * E' anche il numero che la pagina scrive: promettere ventiquattro ore e' prudente rispetto
 * a quello che abbiamo misurato - nel Brasileirao le nove gare entro le quarantotto ore
 * avevano gia' il designato, la piu' lontana a quarantadue ore dal calcio d'inizio; in Serie
 * A tutte e sei quelle entro quarantasette - e oltre questa soglia la promessa scade, quindi
 * non si fa piu'.
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
