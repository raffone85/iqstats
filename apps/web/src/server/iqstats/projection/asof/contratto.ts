/**
 * Che cosa il calcolo delle feature riceve, e con quali garanzie.
 *
 * Il predittore vede una gara per volta: non ha l'archivio, non ha la lega, non ha la
 * storia di tutti gli arbitri. Quello che non puo' ricostruire da solo lo riceve gia'
 * calcolato, e chi glielo passa e' tenuto alla stessa regola descritta in
 * docs/architecture/contratto-feature-al-momento-di.md.
 *
 * Un valore ignoto e' `null`. Non diventa mai zero.
 */

export type Lato = 'home' | 'away';

/** Il profilo dei tiri di una singola gara, gia' misurato su quella gara. */
export interface ProfiloTiri {
  totali: number | null;
  quotaInArea: number | null;
  distanzaMedia: number | null;
  xgPerTiro: number | null;
  quotaQualita: number | null;
  quotaBloccati: number | null;
  quotaDaFermo: number | null;
}

/**
 * Le metriche del pannello di una gara gia' giocata: quanto la squadra ha prodotto su
 * ciascuna. Si ricevono per gara, come il profilo dei tiri, perche' sono la misura di
 * quella gara: le medie si fanno qui sopra, non a monte.
 */
export interface ProfiloDiContesto {
  [metrica: string]: number | null;
}

/** Una gara gia' giocata, vista dal lato di una squadra. */
export interface GaraPrecedente {
  eventId: number;
  quando: string;
  stagione: number | null;
  lato: Lato;
  /** Il valore del bersaglio prodotto dalla squadra in quella gara. */
  prodotto: number | null;
  /** Lo stesso valore, prodotto dall'avversario di quella gara. */
  concesso: number | null;
  punti: number | null;
  retiFatte: number | null;
  retiSubite: number | null;
  tiri?: ProfiloTiri | null;
  tiriConcessi?: ProfiloTiri | null;
  /** Le metriche del pannello prodotte dalla squadra in quella gara. */
  contesto?: ProfiloDiContesto | null;
  /** Le stesse metriche, prodotte dall'avversario di quella gara. */
  contestoConcesso?: ProfiloDiContesto | null;
}

/**
 * Le medie della lega «al momento di», dentro la stagione. Si ricevono: richiedono
 * tutte le gare della competizione, non solo quelle delle due squadre.
 */
export interface RiferimentiDiLega {
  media: number | null;
  sd: number | null;
  latoMedia: number | null;
  latoCampione: number | null;
  falli: number | null;
  ammoniti: number | null;
  espulsioni: number | null;
}

/**
 * Il profilo dell'arbitro prima di questa gara. Si riceve: richiede tutte le gare che
 * quell'arbitro ha diretto. Se l'arbitro non e' noto, l'intero profilo e' `null` e il
 * restringimento porta il record al prior della competizione.
 */
export interface ProfiloArbitro {
  campione: number;
  gareViste: number;
  prodottoMedia: number | null;
  prodottoSd: number | null;
  prodottoEwma: number | null;
  prodottoLatoMedia: number | null;
  falliMedia: number | null;
  ammonitiMedia: number | null;
  espulsioniMedia: number | null;
}

/** Gli aggregati di rosa, gia' calcolati sulle sole gare precedenti della squadra. */
export interface AggregatiRosa {
  [colonna: string]: number | null;
}

/** Tutto cio' che serve per calcolare le feature di una riga squadra-gara. */
export interface IngressoFeature {
  quando: string;
  lato: Lato;
  stagione: number | null;
  turno: number | null;
  derby: number | null;
  /** Gare precedenti della squadra, dalla piu' vecchia alla piu' recente. */
  squadra: GaraPrecedente[]
  /** Gare precedenti dell'avversario, con lo stesso ordine. */
  avversario: GaraPrecedente[]
  /** Gare precedenti dell'allenatore, in qualunque squadra. */
  allenatore?: GaraPrecedente[]
  /** Gare dell'allenatore con questa squadra, per misurare da quanto e' insediato. */
  allenatoreConLaSquadra?: number | null;
  lega: RiferimentiDiLega;
  arbitro?: ProfiloArbitro | null;
  rosa?: AggregatiRosa | null;
}

/** Il risultato: una colonna per nome, con il valore o l'assenza dichiarata. */
export interface Feature {
  [colonna: string]: number | null;
}

export const MIN_PREVIOUS_MATCHES = 3;
export const ORIZZONTI = [3, 5, 10] as const;
export const MEZZA_VITA_EWMA = 4;
export const FORZA_RESTRINGIMENTO = 5;
export const FORZA_RESTRINGIMENTO_ARBITRO = 5;
export const GIORNI_CONGESTIONE = 14;
