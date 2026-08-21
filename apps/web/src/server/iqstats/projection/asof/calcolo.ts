/**
 * L'orchestratore: dalle colonne che il modello dichiara ai gruppi da calcolare.
 *
 * Un modello che usa quaranta colonne non deve pagarne centotredici. Qui si guarda
 * l'elenco dichiarato nell'artefatto, si deducono i gruppi necessari, si calcolano
 * quelli e nient'altro.
 *
 * L'assegnazione colonna-gruppo e' la stessa del lato che addestra: se una colonna non
 * appartiene a nessun gruppo, il calcolo si ferma invece di restituire un vettore
 * incompleto. Una feature che manca non e' una feature che vale zero.
 */

import { Feature, IngressoFeature } from './contratto';
import { GRUPPI, NomeGruppo } from './gruppi';

interface RegolaDiGruppo {
  gruppo: NomeGruppo;
  prefissi: string[]
  colonne: string[]
}

/** Prima corrispondenza nell'ordine: una colonna appartiene a un gruppo solo. */
const REGOLE: RegolaDiGruppo[] = [
  {
    gruppo: 'base',
    prefissi: ['lega_', 'prodotto_stagione_'],
    colonne: [
      'baseline_lega',
      'baseline_squadra_stagione',
      'baseline_restringimento',
      'gare_precedenti',
      'zeta_dalla_lega',
    ],
  },
  {
    gruppo: 'avversario',
    prefissi: ['avv_', 'concesso_'],
    colonne: [
      'baseline_attacco_contro_concesso',
      'debolezza_difesa_avversario',
      'confronto_produce_meno_concede',
    ],
  },
  {
    gruppo: 'forma',
    prefissi: ['prodotto_ultime', 'prodotto_ewma'],
    colonne: ['baseline_media_mobile'],
  },
  {
    gruppo: 'casa_trasferta',
    prefissi: ['prodotto_lato_'],
    colonne: ['baseline_squadra_lato', 'forza_attacco', 'scarto_dalla_lega'],
  },
  { gruppo: 'riposo', prefissi: ['giorni_'], colonne: [] },
  { gruppo: 'giocatori', prefissi: ['giocatori_'], colonne: [] },
  { gruppo: 'allenatore', prefissi: ['allenatore_'], colonne: [] },
  { gruppo: 'arbitro', prefissi: ['arbitro_'], colonne: [] },
  { gruppo: 'spaziale', prefissi: ['spaziale_'], colonne: [] },
  { gruppo: 'classifica', prefissi: ['classifica_'], colonne: [] },
  { gruppo: 'contesto', prefissi: ['contesto_'], colonne: [] },
  { gruppo: 'interazione', prefissi: ['interazione_'], colonne: [] },
  { gruppo: 'circolazione', prefissi: ['circolazione_'], colonne: [] },
  { gruppo: 'territorio', prefissi: ['territorio_'], colonne: [] },
  { gruppo: 'intensita', prefissi: ['intensita_'], colonne: [] },
  { gruppo: 'ambiente_tiro', prefissi: ['ambiente_tiro_'], colonne: [] },
  { gruppo: 'ambiente_gol', prefissi: ['ambiente_gol_'], colonne: [] },
  { gruppo: 'inattive', prefissi: ['inattive_'], colonne: [] },
  { gruppo: 'incrociato', prefissi: ['incrociato_'], colonne: [] },
]

export function gruppoDi(colonna: string): NomeGruppo | null {
  for (const regola of REGOLE) {
    if (regola.colonne.indexOf(colonna) >= 0) {
      return regola.gruppo;
    }
    for (const prefisso of regola.prefissi) {
      if (colonna.indexOf(prefisso) === 0) {
        return regola.gruppo;
      }
    }
  }
  return null;
}

export function gruppiNecessari(colonne: string[]): NomeGruppo[] {
  const scelti: NomeGruppo[] = []
  const senzaGruppo: string[] = []
  for (const colonna of colonne) {
    const gruppo = gruppoDi(colonna)
    if (gruppo === null) {
      senzaGruppo.push(colonna)
      continue;
    }
    if (scelti.indexOf(gruppo) < 0) {
      scelti.push(gruppo)
    }
  }
  if (senzaGruppo.length > 0) {
    throw new Error('colonne senza gruppo: ' + senzaGruppo.join(', '))
  }
  return scelti;
}

/**
 * Calcola le sole colonne richieste. Una colonna che nessun gruppo produce e' un
 * errore di contratto, non un valore mancante: significa che i due lati non parlano
 * piu' la stessa lingua.
 */
export function calcolaFeature(ingresso: IngressoFeature, colonne: string[]): Feature {
  const prodotte: Feature = {}
  for (const gruppo of gruppiNecessari(colonne)) {
    const parziale = GRUPPI[gruppo](ingresso)
    for (const nome of Object.keys(parziale)) {
      prodotte[nome] = parziale[nome]
    }
  }

  const uscita: Feature = {}
  const mancanti: string[] = []
  for (const colonna of colonne) {
    if (!(colonna in prodotte)) {
      mancanti.push(colonna)
      continue;
    }
    const valore = prodotte[colonna]
    uscita[colonna] = valore === null || !Number.isFinite(valore) ? null : valore;
  }
  if (mancanti.length > 0) {
    throw new Error('colonne dichiarate e non prodotte: ' + mancanti.join(', '))
  }
  return uscita;
}
