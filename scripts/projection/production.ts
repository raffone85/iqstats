/**
 * La proiezione come esce verso l'applicazione: valore atteso, intervallo, evidenza.
 *
 * Il predittore rifa' il conto del modello. Qui sopra si aggiunge cio' che il metodo
 * chiede a una proiezione di produzione: la fascia di maturita' della squadra, la miscela
 * con la baseline quando la squadra ha giocato poco, la gerarchia di ripiego quando i dati
 * non bastano, e le evidenze su cui poggia l'affidabilita'.
 *
 * Tre regole che questo modulo non negozia:
 *
 * **La fascia non decide se prevedere, decide come.** Con tre gare precedenti il motore
 * prevede: EARLY vuol dire campione poco maturo, non motore spento.
 *
 * **Il peso della miscela non si ristima qui.** E' stato stimato sui periodi di
 * addestramento, dove le righe con poco storico sono centinaia, e congelato
 * nell'artefatto. Chi prevede lo legge e basta.
 *
 * **Un intervallo non calibrato non si produce.** Il ripiego ha un valore atteso ma non un
 * intervallo, perche' nessuno lo ha calibrato su quella baseline: si dichiara assente.
 *
 * Modulo puro: nessuna dipendenza dall'applicazione, nessun accesso a rete o disco.
 */

import type { ArtefattoModello, FasciaDiMaturita, RipiegoMisurato } from './artifact-schema';
import type { ValoreFeature } from './feature-transform';
import type { Intervallo } from './predictor';
import { intervalloDaParametri, prevedi } from './predictor';

/** Copertura dei dati su cui poggia la proiezione. */
export type Copertura = 'piena' | 'ridotta';

/** Da dove viene il numero: il modello, la sua miscela con la baseline, o un ripiego. */
export type OrigineDelValore = 'modello' | 'miscela' | 'ripiego';

/**
 * Le evidenze misurate su cui poggia il giudizio di affidabilita'.
 *
 * Il metodo vieta di inventare una percentuale di confidenza, e con il campione attuale
 * la stabilita' temporale in fascia EARLY non e' misurabile: l'oscillazione dell'errore
 * fra origini vi risulta minore di quella che il caso produce da solo. Finche' non esiste
 * una sintesi sostenuta dai dati, qui si espongono le componenti e il livello resta nullo.
 */
export interface EvidenzeDiAffidabilita {
  readonly livello: null;
  readonly perche: string;
  readonly fascia: string | null;
  readonly garePrecedenti: number | null;
  readonly garePrecedentiAvversario: number | null;
  readonly maeFuoriCampione: number | null;
  readonly erroreStandardDelMae: number | null;
  readonly biasFuoriCampione: number | null;
  readonly righeDiProva: number | null;
  readonly righeDiAddestramentoNellaFascia: number | null;
  readonly stabilitaMisurabile: boolean;
  readonly feature: 'complete' | 'incomplete';
  readonly formazione: 'non disponibile: le formazioni non sono raccolte';
}

export interface ProiezioneDiProduzione {
  readonly stato: 'prevista';
  readonly target: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly valoreAtteso: number;
  readonly intervallo: Intervallo | null;
  readonly origineDelValore: OrigineDelValore;
  readonly pesoDelModello: number;
  readonly ripiegoUsato: boolean;
  readonly copertura: Copertura;
  readonly campioneDiAddestramento: number;
  readonly evidenze: EvidenzeDiAffidabilita;
}

export interface ProiezioneAssente {
  readonly stato: 'non_prevista';
  readonly target: string;
  readonly modelId: string;
  readonly motivo: string;
  readonly featureMancanti: readonly string[];
}

export type EsitoDiProduzione = ProiezioneDiProduzione | ProiezioneAssente;

function numeroDa(valore: ValoreFeature | undefined): number | null {
  if (typeof valore !== 'number' || !Number.isFinite(valore)) {
    return null;
  }
  return valore;
}

/** La fascia a cui appartiene un numero di gare precedenti, o null se nessuna la copre. */
export function fasciaDi(
  artefatto: ArtefattoModello,
  garePrecedenti: number,
): { readonly nome: string; readonly fascia: FasciaDiMaturita } | null {
  const maturita = artefatto.maturita;
  if (maturita === null) {
    return null;
  }
  const nomi = Object.keys(maturita.per_fascia);
  for (let indice = 0; indice < nomi.length; indice += 1) {
    const nome = nomi[indice];
    const fascia = maturita.per_fascia[nome];
    const sopraIlMinimo = garePrecedenti >= fascia.da;
    const sottoIlMassimo = fascia.a === null || garePrecedenti <= fascia.a;
    if (sopraIlMinimo && sottoIlMassimo) {
      return { nome, fascia };
    }
  }
  return null;
}

/**
 * La fascia con meno storico richiesto, quando la riga non ne ha nessuna.
 *
 * Serve solo a scegliere l'ordine dei ripieghi: sotto il minimo di gare, o senza sapere
 * quante siano, la condizione piu' vicina e' quella di chi ha giocato pochissimo, non
 * quella di chi ha giocato tutta la stagione. L'ordine dei due gradini non e' lo stesso
 * nelle due fasce, quindi la scelta cambia il numero che esce.
 */
function fasciaPiuPovera(artefatto: ArtefattoModello): FasciaDiMaturita | null {
  const maturita = artefatto.maturita;
  if (maturita === null) {
    return null;
  }
  let piuPovera: FasciaDiMaturita | null = null;
  Object.keys(maturita.per_fascia).forEach((nome) => {
    const fascia = maturita.per_fascia[nome];
    if (piuPovera === null || fascia.da < piuPovera.da) {
      piuPovera = fascia;
    }
  });
  return piuPovera;
}

function evidenzeDa(
  nomeFascia: string | null,
  fascia: FasciaDiMaturita | null,
  garePrecedenti: number | null,
  garePrecedentiAvversario: number | null,
  feature: 'complete' | 'incomplete',
): EvidenzeDiAffidabilita {
  const evidenza = (fascia === null ? {} : fascia.evidenza_fuori_campione) as Record<
    string,
    unknown
  >;
  const instabilita = evidenza.instabilita_fra_origini as Record<string, unknown> | null;
  const vera = instabilita === null || instabilita === undefined
    ? null
    : (instabilita.deviazione_vera as number | undefined);

  return {
    livello: null,
    perche: (
      'l\'affidabilita\' sintetica non e\' ancora definita: con il campione attuale la '
      + 'stabilita\' temporale non e\' misurabile nella fascia con meno storico, e una '
      + 'percentuale non sostenuta dai dati sarebbe inventata'
    ),
    fascia: nomeFascia,
    garePrecedenti,
    garePrecedentiAvversario,
    maeFuoriCampione: (evidenza.mae as number | undefined) ?? null,
    erroreStandardDelMae: (evidenza.errore_standard_mae as number | undefined) ?? null,
    biasFuoriCampione: (evidenza.bias as number | undefined) ?? null,
    righeDiProva: (evidenza.righe_di_prova as number | undefined) ?? null,
    righeDiAddestramentoNellaFascia:
      fascia === null ? null : fascia.righe_di_addestramento_nella_fascia,
    stabilitaMisurabile: typeof vera === 'number' && vera > 0,
    feature,
    formazione: 'non disponibile: le formazioni non sono raccolte',
  };
}

function primoRipiegoDisponibile(
  gradini: readonly RipiegoMisurato[] | null,
  valori: Readonly<Record<string, ValoreFeature>>,
): { readonly colonna: string; readonly valore: number } | null {
  if (gradini === null) {
    return null;
  }
  for (let indice = 0; indice < gradini.length; indice += 1) {
    const valore = numeroDa(valori[gradini[indice].colonna]);
    if (valore !== null) {
      return { colonna: gradini[indice].colonna, valore };
    }
  }
  return null;
}

function conRipiego(
  artefatto: ArtefattoModello,
  valori: Readonly<Record<string, ValoreFeature>>,
  nomeFascia: string | null,
  fascia: FasciaDiMaturita | null,
  garePrecedenti: number | null,
  garePrecedentiAvversario: number | null,
  motivo: string,
  featureMancanti: readonly string[],
): EsitoDiProduzione {
  const daFascia = fascia === null ? fasciaPiuPovera(artefatto) : fascia;
  const scelto = primoRipiegoDisponibile(
    daFascia === null ? null : daFascia.ripiego_ordinato,
    valori,
  );
  if (scelto === null) {
    return {
      stato: 'non_prevista',
      target: artefatto.target,
      modelId: artefatto.model_id,
      motivo: motivo + ', e nessun ripiego misurato e\' disponibile nell\'ingresso',
      featureMancanti,
    };
  }

  return {
    stato: 'prevista',
    target: artefatto.target,
    modelId: artefatto.model_id,
    modelVersion: artefatto.model_version,
    valoreAtteso: scelto.valore,
    // Nessuno ha calibrato un intervallo su questa baseline: dichiararne uno sarebbe
    // precisione falsa, che e' proprio cio' che il ripiego deve evitare.
    intervallo: null,
    origineDelValore: 'ripiego',
    pesoDelModello: 0,
    ripiegoUsato: true,
    copertura: 'ridotta',
    campioneDiAddestramento: artefatto.training_metadata.righe,
    evidenze: evidenzeDa(
      nomeFascia,
      fascia,
      garePrecedenti,
      garePrecedentiAvversario,
      featureMancanti.length > 0 ? 'incomplete' : 'complete',
    ),
  };
}

/**
 * La proiezione di produzione a partire dai valori delle feature «al momento di».
 *
 * L'ordine dei controlli e' quello della gerarchia di ripiego: prima il modello del
 * bersaglio, poi i ripieghi nell'ordine che l'errore misurato ha stabilito per quella
 * fascia, infine il rifiuto di prevedere.
 */
export function proietta(
  artefatto: ArtefattoModello,
  valori: Readonly<Record<string, ValoreFeature>>,
): EsitoDiProduzione {
  const maturita = artefatto.maturita;
  const minimo = artefatto.training_metadata.min_previous_matches;
  const colonnaDelCampione = maturita === null ? 'gare_precedenti' : maturita.colonna_del_campione;
  const garePrecedenti = numeroDa(valori[colonnaDelCampione]);
  const garePrecedentiAvversario = numeroDa(valori.avv_gare_precedenti);

  if (garePrecedenti === null) {
    return conRipiego(
      artefatto, valori, null, null, null, garePrecedentiAvversario,
      'il numero di gare precedenti non e\' noto', [colonnaDelCampione],
    );
  }

  const trovata = fasciaDi(artefatto, garePrecedenti);
  const nomeFascia = trovata === null ? null : trovata.nome;
  const fascia = trovata === null ? null : trovata.fascia;

  if (garePrecedenti < minimo) {
    return conRipiego(
      artefatto, valori, nomeFascia, fascia, garePrecedenti, garePrecedentiAvversario,
      'la squadra ha meno di ' + String(minimo) + ' gare precedenti', [],
    );
  }

  const esito = prevedi(artefatto, valori);
  if (esito.stato === 'non_prevista') {
    const mancanti = esito.featureMancanti.concat(esito.featureNonFinite);
    return conRipiego(
      artefatto, valori, nomeFascia, fascia, garePrecedenti, garePrecedentiAvversario,
      'al modello mancano ' + String(mancanti.length) + ' feature', mancanti,
    );
  }

  // Senza parametri di fascia il modello vale per intero, con la calibrazione complessiva.
  if (fascia === null) {
    return {
      stato: 'prevista',
      target: artefatto.target,
      modelId: artefatto.model_id,
      modelVersion: artefatto.model_version,
      valoreAtteso: esito.valoreAtteso,
      intervallo: esito.intervallo,
      origineDelValore: 'modello',
      pesoDelModello: 1,
      ripiegoUsato: false,
      copertura: 'piena',
      campioneDiAddestramento: artefatto.training_metadata.righe,
      evidenze: evidenzeDa(nomeFascia, null, garePrecedenti, garePrecedentiAvversario, 'complete'),
    };
  }

  const peso = fascia.peso_della_miscela;
  let valoreAtteso = esito.valoreAtteso;
  if (peso < 1) {
    const daMescolare = numeroDa(valori[fascia.mescolato_con]);
    if (daMescolare === null) {
      return conRipiego(
        artefatto, valori, nomeFascia, fascia, garePrecedenti, garePrecedentiAvversario,
        'manca ' + fascia.mescolato_con + ', che la fascia ' + nomeFascia + ' mescola',
        [fascia.mescolato_con],
      );
    }
    valoreAtteso = peso * esito.valoreAtteso + (1 - peso) * daMescolare;
  }

  return {
    stato: 'prevista',
    target: artefatto.target,
    modelId: artefatto.model_id,
    modelVersion: artefatto.model_version,
    valoreAtteso,
    intervallo: intervalloDaParametri(
      fascia.distribuzione_intervallo,
      fascia.dispersione,
      fascia.livello_nominale,
      artefatto.calibration.livello_dichiarato,
      valoreAtteso,
    ),
    origineDelValore: peso < 1 ? 'miscela' : 'modello',
    pesoDelModello: peso,
    ripiegoUsato: false,
    copertura: 'piena',
    campioneDiAddestramento: artefatto.training_metadata.righe,
    evidenze: evidenzeDa(
      nomeFascia, fascia, garePrecedenti, garePrecedentiAvversario, 'complete',
    ),
  };
}
