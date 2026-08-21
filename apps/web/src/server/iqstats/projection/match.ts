/**
 * La proiezione come la legge chi guarda una gara: casa, trasferta, totale.
 *
 * Sopra le due proiezioni di lato — che `production.ts` produce gia', ciascuna con la sua
 * fascia, la sua miscela e la sua affidabilita' — questo modulo aggiunge le due cose che
 * mancano per mostrarle: il **totale di gara** e le **cinque linee**.
 *
 * Quattro regole che questo modulo non negozia.
 *
 * **Il totale e' la somma, sempre.** `E[casa + trasferta] = E[casa] + E[trasferta]` vale
 * anche quando i due processi sono dipendenti, e lo sono: la correlazione fra i residui
 * dei due lati e' stata misurata e va da −0,25 a +0,17. Non esiste un terzo valore atteso
 * che possa contraddire i due lati, perche' non c'e' niente da stimare.
 *
 * **L'incertezza del totale non e' la somma delle incertezze.** Quella si legge
 * dall'artefatto, dove e' stata calibrata sui residui della somma. Comporre le due
 * marginali con la dipendenza misurata e' stato provato fuori campione e non vince:
 * `data/registro-totale.json`.
 *
 * **Le probabilita' delle soglie vengono dalla distribuzione, non dalla distanza
 * dall'atteso.** Ed e' misurato che valga la pena: la distribuzione calibrata batte la
 * tabella «Over a una unita' sopra l'atteso succede il tanto per cento» su tutti e sette
 * i bersagli.
 *
 * **Sotto un ripiego non si dichiara niente di piu' del valore.** L'intervallo, le linee e
 * il totale poggiano su una calibrazione misurata sul modello del bersaglio: attribuirla a
 * una baseline su cui nessuno l'ha misurata sarebbe l'invenzione che il metodo vieta.
 *
 * Modulo puro: nessuna dipendenza dall'applicazione, nessun accesso a rete o disco.
 */

import type { ArtefattoModello } from './artifact-schema';
import type { Intervallo } from './predictor';
import { intervalloDaParametri, probabilitaSopra } from './predictor';
import type {
  EsitoDiProduzione,
  LivelloDiAffidabilita,
  ProiezioneDiProduzione,
} from './production';

/** Una soglia, con le due probabilita' che la distribuzione le assegna. */
export interface Linea {
  readonly soglia: number;
  readonly probabilitaSotto: number;
  readonly probabilitaSopra: number;
}

/** Il totale di gara: centro dai due lati, incertezza dall'artefatto. */
export interface TotaleDiGara {
  readonly valoreAtteso: number;
  readonly intervallo: Intervallo | null;
  readonly linee: readonly Linea[] | null;
  /**
   * L'affidabilita' del totale, letta nella fascia piu' povera dei due lati.
   *
   * Non e' la media ne' il minimo dei due punteggi di lato: entrambi sono stati misurati
   * e sbagliano, il primo in entrambe le direzioni fino a diciannove punti, il secondo
   * sempre. E' una misura propria del totale, con la sua soglia e la sua curva.
   */
  readonly affidabilita: LivelloDiAffidabilita | null;
  readonly perche: string;
}

export interface ProiezioneDiGara {
  readonly target: string;
  readonly modelId: string;
  readonly casa: EsitoDiProduzione;
  readonly trasferta: EsitoDiProduzione;
  readonly linee: {
    readonly casa: readonly Linea[] | null;
    readonly trasferta: readonly Linea[] | null;
  };
  readonly totale: TotaleDiGara | null;
  /** Quanto la probabilita' promessa si e' scostata dalla frequenza osservata. */
  readonly scartoDiCalibrazioneDelleLinee: number | null;
}

/** I cinque passi attorno al centro, la stessa convenzione del lato che misura. */
const PASSI = [-2, -1, 0, 1, 2];

/**
 * Le cinque soglie: il valore atteso arrotondato meno mezzo, poi due sotto e due sopra.
 *
 * Il mezzo punto non e' un vezzo: una soglia intera renderebbe possibile il pareggio con
 * la soglia, e «esattamente dodici tiri» non e' ne' sotto ne' sopra.
 */
export function soglieDi(valoreAtteso: number): number[] {
  const centro = Math.round(valoreAtteso) - 0.5;
  return PASSI.map((passo) => centro + passo);
}

function linea(
  distribuzione: 'poisson' | 'binomiale_negativa',
  dispersione: number,
  valoreAtteso: number,
  soglia: number,
): Linea {
  const sopra = probabilitaSopra(distribuzione, dispersione, valoreAtteso, soglia);
  return { soglia, probabilitaSotto: 1 - sopra, probabilitaSopra: sopra };
}

/**
 * Le cinque linee di un lato, dalla distribuzione calibrata del bersaglio.
 *
 * Si usa la dispersione complessiva dell'artefatto, non quella della fascia: e' quella su
 * cui la calibrazione delle probabilita' e' stata misurata, e mostrare un numero calibrato
 * altrove sarebbe dichiarare una precisione che nessuno ha verificato.
 */
export function lineeDiLato(
  artefatto: ArtefattoModello,
  esito: EsitoDiProduzione,
): readonly Linea[] | null {
  if (esito.stato !== 'prevista' || esito.ripiegoUsato) {
    return null;
  }
  const calibrazione = artefatto.calibration;
  return soglieDi(esito.valoreAtteso).map(
    (soglia) => linea(
      calibrazione.distribuzione_intervallo,
      calibrazione.dispersione,
      esito.valoreAtteso,
      soglia,
    ),
  );
}

function previstaDalModello(esito: EsitoDiProduzione): esito is ProiezioneDiProduzione {
  return esito.stato === 'prevista' && !esito.ripiegoUsato;
}

/**
 * Il totale di gara dai due lati.
 *
 * Il valore atteso c'e' ogni volta che entrambi i lati hanno un numero, ripiego compreso:
 * la somma resta esatta. Intervallo e linee invece **no**, perche' la dispersione del
 * totale e' stata calibrata sui residui del modello, non su quelli di una baseline.
 */
export function totaleDiGara(
  artefatto: ArtefattoModello,
  casa: EsitoDiProduzione,
  trasferta: EsitoDiProduzione,
): TotaleDiGara | null {
  if (casa.stato !== 'prevista' || trasferta.stato !== 'prevista') {
    return null;
  }
  const valoreAtteso = casa.valoreAtteso + trasferta.valoreAtteso;
  const parametri = artefatto.totale;

  if (parametri === null || parametri === undefined) {
    return {
      valoreAtteso,
      intervallo: null,
      linee: null,
      affidabilita: null,
      perche: 'l\'artefatto non porta la calibrazione del totale: si dichiara solo la somma',
    };
  }
  if (!previstaDalModello(casa) || !previstaDalModello(trasferta)) {
    return {
      valoreAtteso,
      intervallo: null,
      linee: null,
      affidabilita: null,
      perche: (
        'almeno un lato viene da un ripiego: la somma resta esatta, ma la dispersione del '
        + 'totale e\' stata calibrata sui residui del modello e non su quelli di una baseline'
      ),
    };
  }

  const intervallo = intervalloDaParametri(
    parametri.distribuzione,
    parametri.dispersione,
    parametri.livello_nominale,
    parametri.livello_dichiarato,
    valoreAtteso,
  );
  const linee = soglieDi(valoreAtteso).map(
    (soglia) => linea(parametri.distribuzione, parametri.dispersione, valoreAtteso, soglia),
  );
  return {
    valoreAtteso,
    intervallo,
    linee,
    affidabilita: affidabilitaDelTotale(artefatto, casa, trasferta),
    perche: (
      'somma dei due attesi, con l\'incertezza calibrata sui residui della somma: la '
      + 'dipendenza fra i due lati e\' stata misurata e non migliora questa stima'
    ),
  };
}

/**
 * La fascia con cui leggere il totale: la piu' povera dei due lati.
 *
 * E' la storia piu' corta a governare l'incertezza, ed e' la stessa regola con cui la
 * fascia e' stata assegnata alle paia di gara quando il punteggio e' stato misurato. Una
 * fascia che l'artefatto non descrive non entra nel confronto: senza il suo `da` non c'e'
 * modo di sapere quale delle due sia la piu' povera, e indovinare non e' permesso.
 */
function fasciaPiuPoveraFra(
  artefatto: ArtefattoModello,
  prima: string | null,
  seconda: string | null,
): string | null {
  const fasce = artefatto.maturita?.per_fascia;
  if (fasce === undefined) {
    return null;
  }
  const note = [prima, seconda].filter(
    (nome): nome is string => nome !== null && fasce[nome] !== undefined,
  );
  if (note.length === 0) {
    return null;
  }
  return note.reduce((povera, nome) => (fasce[nome].da < fasce[povera].da ? nome : povera));
}

/**
 * Il punteggio del totale per questa gara: quello della fascia se c'e', altrimenti il
 * complessivo. Sotto un ripiego non ci si arriva, perche' chi chiama e' gia' uscito prima.
 */
function affidabilitaDelTotale(
  artefatto: ArtefattoModello,
  casa: ProiezioneDiProduzione,
  trasferta: ProiezioneDiProduzione,
): LivelloDiAffidabilita | null {
  const affidabilita = artefatto.totale?.affidabilita;
  if (affidabilita === null || affidabilita === undefined) {
    return null;
  }
  const nomeFascia = fasciaPiuPoveraFra(
    artefatto, casa.evidenze.fascia, trasferta.evidenze.fascia,
  );
  const dellaFascia = nomeFascia === null ? undefined : affidabilita.per_fascia[nomeFascia];
  const voce = dellaFascia === undefined ? affidabilita.complessivo : dellaFascia;
  if (voce === undefined) {
    return null;
  }
  return {
    punteggio: voce.punteggio,
    punteggioBasso: voce.punteggio_basso,
    punteggioAlto: voce.punteggio_alto,
    fasciaDiLettura: voce.fascia_di_lettura,
    soglia: affidabilita.soglia_assoluta,
    misuratoSu: dellaFascia === undefined ? 'complessivo' : 'fascia',
    righeDiProva: voce.righe_di_prova,
  };
}

/** La gara intera per un bersaglio: i due lati, le loro linee, e il totale. */
export function proiezioneDiGara(
  artefatto: ArtefattoModello,
  casa: EsitoDiProduzione,
  trasferta: EsitoDiProduzione,
): ProiezioneDiGara {
  const parametri = artefatto.totale;
  return {
    target: artefatto.target,
    modelId: artefatto.model_id,
    casa,
    trasferta,
    linee: {
      casa: lineeDiLato(artefatto, casa),
      trasferta: lineeDiLato(artefatto, trasferta),
    },
    totale: totaleDiGara(artefatto, casa, trasferta),
    scartoDiCalibrazioneDelleLinee: (
      parametri === null || parametri === undefined
        ? null
        : parametri.calibrazione_delle_linee_sui_due_lati
    ),
  };
}
