/**
 * Lo stato di forma di una squadra: quanto ha prodotto e concesso di recente, dallo stesso
 * lato del campo, contro la media della sua competizione.
 *
 * **Perche' non basta la sequenza di risultati.** Il dossier gia' mostra la forma come
 * lettere - vinta, pareggiata, persa - ma tre vittorie per 1-0 e tre per 4-0 danno la
 * stessa striscia e non sono la stessa squadra. Qui la forma e' numerica: reti fatte e
 * subite a gara, su tre finestre, con il campione di ciascuna.
 *
 * **Tre finestre e non una.** Tre gare dicono il momento, dieci dicono la squadra, cinque
 * stanno in mezzo. Mostrarne una sola vorrebbe dire scegliere per il lettore quanto
 * lontano guardare, e la scelta cambia la risposta: e' la stessa ragione per cui la scala
 * delle soglie mostra cinque linee invece della sola piu' probabile.
 *
 * **Lo stesso lato del campo.** Le gare in casa si confrontano con le gare in casa: il
 * vantaggio del campo non e' un coefficiente da aggiungere dopo, e mescolare i due lati
 * renderebbe la media di ogni squadra una media di due popolazioni diverse.
 *
 * **Nessuna soglia e nessuna freccia.** Non si dichiara «in forma» sopra un numero deciso
 * a tavolino: si mettono accanto la media della squadra e quella della competizione, e la
 * distanza si legge. Un indice che comprime le due cose in una lettera nasconde proprio il
 * confronto che serve.
 *
 * Zero interrogazioni nuove: sono le stesse righe che il motore legge per proiettare.
 */
import type { Lato } from './asof/contratto';
import type { OsservazioneSquadraGara } from './snapshot';

/** Le tre finestre, dalla piu' stretta alla piu' larga. */
export const FINESTRE = [3, 5, 10] as const;

export interface FinestraDiForma {
  /** Quante gare erano richieste: 3, 5 o 10. */
  readonly chieste: number;
  /** Quante ce ne sono davvero. Puo' essere meno, e allora la pagina lo dice. */
  readonly gare: number;
  readonly retiFatte: number;
  readonly retiSubite: number;
}

export interface FormaDiSquadra {
  readonly lato: Lato;
  readonly finestre: readonly FinestraDiForma[];
  /** La media della competizione sullo stesso lato, nella stagione della gara. */
  readonly legaFatte: number;
  readonly legaSubite: number;
  readonly campioneLega: number;
}

/** Le righe di un lato, dalla piu' recente alla piu' vecchia. */
function recenti(
  righe: readonly OsservazioneSquadraGara[],
  lato: Lato,
): readonly OsservazioneSquadraGara[] {
  return righe
    .filter((r) => r.lato === lato && r.retiFatte !== null && r.retiSubite !== null)
    // Gli istanti sono ISO normalizzati dallo store: l'ordine lessicografico e' quello
    // temporale, quindi nessuna conversione a data per ordinare.
    .slice()
    .sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0));
}

function finestra(
  righe: readonly OsservazioneSquadraGara[],
  chieste: number,
): FinestraDiForma | null {
  const prese = righe.slice(0, chieste);
  if (prese.length === 0) return null;
  let fatte = 0;
  let subite = 0;
  for (const r of prese) {
    fatte += r.retiFatte ?? 0;
    subite += r.retiSubite ?? 0;
  }
  return {
    chieste,
    gare: prese.length,
    retiFatte: fatte / prese.length,
    retiSubite: subite / prese.length,
  };
}

/** La media della competizione su un lato, nella stagione dichiarata. */
function metro(
  lega: readonly OsservazioneSquadraGara[],
  lato: Lato,
  stagione: number,
): { fatte: number; subite: number; campione: number } | null {
  let fatte = 0;
  let subite = 0;
  let campione = 0;
  for (const r of lega) {
    if (r.lato !== lato || r.stagione !== stagione) continue;
    if (r.retiFatte === null || r.retiSubite === null) continue;
    fatte += r.retiFatte;
    subite += r.retiSubite;
    campione += 1;
  }
  return campione === 0 ? null : { fatte: fatte / campione, subite: subite / campione, campione };
}

/**
 * La forma di una squadra, o `null` quando manca il materiale.
 *
 * Senza il metro della competizione non si risponde: le tre medie da sole non dicono se
 * 1,4 reti a gara sia molto o poco, e un numero senza il suo riferimento e' proprio cio'
 * che questa sezione esiste per evitare.
 */
export function formaDi(
  righeSquadra: readonly OsservazioneSquadraGara[],
  righeLega: readonly OsservazioneSquadraGara[],
  lato: Lato,
  stagione: number,
): FormaDiSquadra | null {
  const m = metro(righeLega, lato, stagione);
  if (m === null) return null;

  const ordinate = recenti(righeSquadra, lato);
  const finestre = FINESTRE
    .map((n) => finestra(ordinate, n))
    .filter((f): f is FinestraDiForma => f !== null);
  if (finestre.length === 0) return null;

  return {
    lato,
    finestre,
    legaFatte: m.fatte,
    legaSubite: m.subite,
    campioneLega: m.campione,
  };
}
