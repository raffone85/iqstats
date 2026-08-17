/**
 * Il contratto dell'artefatto di modello, dal lato che legge.
 *
 * L'artefatto e' l'unico ponte fra l'addestramento in Python e la previsione qui: questo
 * modulo ne descrive la forma e la verifica prima dell'uso. Non calcola niente e non
 * dipende dall'applicazione, cosi' che possa essere spostato dentro il server senza
 * modifiche.
 *
 * Un artefatto che non supera la verifica non produce una previsione peggiore: non ne
 * produce nessuna.
 *
 * Il caricamento da disco vive in fondo al file ed e' l'unica parte legata al sistema
 * operativo: avviene sempre lato server, mai nel client.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SCHEMA_ARTEFATTO = 'artefatto-modello/1';

export type TipoModello = 'poisson_glm' | 'ridge';
export type Collegamento = 'log' | 'identita';
export type DistribuzioneIntervallo = 'poisson' | 'binomiale_negativa';
export type StatoModello = 'experimental' | 'validated' | 'production' | 'disabled';

export interface Preprocessing {
  readonly tipo: 'standardizzazione';
  readonly media: readonly number[];
  readonly scala: readonly number[];
}

export interface SchemaFeature {
  readonly ordine: readonly string[];
  readonly preprocessing: Preprocessing;
  readonly valori_mancanti: string;
  readonly valori_non_finiti: string;
}

export interface Taglio {
  readonly minimo: number | null;
  readonly massimo: number | null;
  readonly applicato_a: string;
}

export interface Calibrazione {
  readonly dispersione: number;
  readonly soglia_poisson: number;
  readonly distribuzione_intervallo: DistribuzioneIntervallo;
  readonly livello_nominale: number;
  readonly livello_dichiarato: number;
  readonly copertura_sul_periodo_di_addestramento: number | null;
  readonly nota: string;
}

export interface MetadatiAddestramento {
  readonly righe: number;
  readonly da: string;
  readonly a: string;
  readonly leghe: number;
  readonly min_previous_matches: number;
  readonly feature_candidate: number;
  readonly densita_minima_richiesta: number;
}

/** Un gradino di ripiego, con l'errore che gli e' stato misurato in quella fascia. */
export interface RipiegoMisurato {
  readonly colonna: string;
  readonly mae_fuori_campione: number;
  readonly righe_di_prova: number;
}

/**
 * I parametri che dipendono da quanto la squadra ha gia' giocato.
 *
 * Il peso della miscela e' stato stimato sui periodi di addestramento, dove le righe con
 * poco storico sono centinaia, e congelato qui: non si ristima al momento di prevedere.
 */
export interface FasciaDiMaturita {
  readonly da: number;
  readonly a: number | null;
  readonly peso_della_miscela: number;
  readonly mescolato_con: string;
  readonly righe_di_addestramento_nella_fascia: number;
  readonly dispersione: number;
  readonly distribuzione_intervallo: DistribuzioneIntervallo;
  readonly livello_nominale: number;
  readonly copertura_sul_periodo_di_addestramento: number | null;
  readonly ripiego_ordinato: readonly RipiegoMisurato[] | null;
  readonly evidenza_fuori_campione: Record<string, unknown>;
}

export interface Maturita {
  readonly colonna_del_campione: string;
  readonly significato: string;
  readonly regola: string;
  readonly affidabilita: string;
  readonly sotto_il_minimo: string;
  readonly per_fascia: Readonly<Record<string, FasciaDiMaturita>>;
}

export interface RiferimentoChecksum {
  readonly algoritmo: 'sha256';
  readonly ambito: string;
  readonly file: string;
}

export interface ArtefattoModello {
  readonly schema_version: string;
  readonly model_id: string;
  readonly model_version: string;
  readonly target: string;
  readonly model_type: TipoModello;
  readonly stato: StatoModello;
  readonly feature_schema: SchemaFeature;
  readonly coefficients: readonly number[];
  readonly intercept: number;
  readonly collegamento: Collegamento;
  readonly taglio: Taglio;
  readonly calibration: Calibrazione;
  readonly maturita: Maturita | null;
  readonly training_metadata: MetadatiAddestramento;
  readonly validation_metrics: Record<string, unknown> | null;
  readonly checksum: RiferimentoChecksum;
}

/** Un artefatto rifiutato dice perche', in modo che il motivo finisca nel registro. */
export class ArtefattoNonValido extends Error {
  constructor(motivo: string) {
    super(`artefatto non valido: ${motivo}`);
    this.name = 'ArtefattoNonValido';
  }
}

function elencoDiNumeri(valore: unknown, campo: string): readonly number[] {
  if (!Array.isArray(valore)) {
    throw new ArtefattoNonValido(`${campo} non e' un elenco`);
  }
  valore.forEach((elemento, indice) => {
    if (typeof elemento !== 'number' || !Number.isFinite(elemento)) {
      throw new ArtefattoNonValido(`${campo}[${indice}] non e' un numero finito`);
    }
  });
  return valore as readonly number[];
}

function numero(valore: unknown, campo: string): number {
  if (typeof valore !== 'number' || !Number.isFinite(valore)) {
    throw new ArtefattoNonValido(`${campo} non e' un numero finito`);
  }
  return valore;
}

function testo(valore: unknown, campo: string): string {
  if (typeof valore !== 'string' || valore.length === 0) {
    throw new ArtefattoNonValido(`${campo} non e' un testo`);
  }
  return valore;
}

function oggetto(valore: unknown, campo: string): Record<string, unknown> {
  if (typeof valore !== 'object' || valore === null || Array.isArray(valore)) {
    throw new ArtefattoNonValido(`${campo} non e' un oggetto`);
  }
  return valore as Record<string, unknown>;
}

/**
 * Legge un artefatto gia' decodificato da JSON e ne verifica la coerenza interna.
 *
 * Le verifiche non sono formali: un ordine di feature che non combacia con il numero di
 * coefficienti o con le medie di standardizzazione produrrebbe una previsione plausibile
 * e sbagliata, che e' il modo peggiore di sbagliare.
 */
export function leggiArtefatto(grezzo: unknown): ArtefattoModello {
  const radice = oggetto(grezzo, 'artefatto');

  const schema = testo(radice.schema_version, 'schema_version');
  if (schema !== SCHEMA_ARTEFATTO) {
    throw new ArtefattoNonValido(`schema ${schema} non riconosciuto, atteso ${SCHEMA_ARTEFATTO}`);
  }

  const tipo = testo(radice.model_type, 'model_type');
  if (tipo !== 'poisson_glm' && tipo !== 'ridge') {
    throw new ArtefattoNonValido(`modello ${tipo} non riproducibile`);
  }

  const collegamento = testo(radice.collegamento, 'collegamento');
  if (collegamento !== 'log' && collegamento !== 'identita') {
    throw new ArtefattoNonValido(`collegamento ${collegamento} non riconosciuto`);
  }

  const schemaFeature = oggetto(radice.feature_schema, 'feature_schema');
  const preprocessing = oggetto(schemaFeature.preprocessing, 'feature_schema.preprocessing');
  if (preprocessing.tipo !== 'standardizzazione') {
    throw new ArtefattoNonValido(`preprocessing ${String(preprocessing.tipo)} non riconosciuto`);
  }

  const ordine = schemaFeature.ordine;
  if (!Array.isArray(ordine) || ordine.some((nome) => typeof nome !== 'string')) {
    throw new ArtefattoNonValido('feature_schema.ordine non e\' un elenco di nomi');
  }
  if (new Set(ordine as string[]).size !== ordine.length) {
    throw new ArtefattoNonValido('feature_schema.ordine contiene nomi ripetuti');
  }

  const media = elencoDiNumeri(preprocessing.media, 'preprocessing.media');
  const scala = elencoDiNumeri(preprocessing.scala, 'preprocessing.scala');
  const coefficienti = elencoDiNumeri(radice.coefficients, 'coefficients');

  if (ordine.length !== coefficienti.length
    || ordine.length !== media.length
    || ordine.length !== scala.length) {
    throw new ArtefattoNonValido(
      `lunghezze incoerenti: ${ordine.length} feature, ${coefficienti.length} coefficienti, `
      + `${media.length} medie, ${scala.length} scale`,
    );
  }

  const calibrazione = oggetto(radice.calibration, 'calibration');
  const distribuzione = testo(calibrazione.distribuzione_intervallo, 'distribuzione_intervallo');
  if (distribuzione !== 'poisson' && distribuzione !== 'binomiale_negativa') {
    throw new ArtefattoNonValido(`distribuzione ${distribuzione} non riconosciuta`);
  }
  const dispersione = numero(calibrazione.dispersione, 'calibration.dispersione');
  if (dispersione < 1) {
    throw new ArtefattoNonValido('la dispersione non puo\' essere minore di uno');
  }
  const livelloNominale = numero(calibrazione.livello_nominale, 'calibration.livello_nominale');
  if (livelloNominale <= 0 || livelloNominale >= 1) {
    throw new ArtefattoNonValido('il livello nominale deve stare fra zero e uno');
  }

  verificaMaturita(radice.maturita, ordine as readonly string[]);

  return radice as unknown as ArtefattoModello;
}

/**
 * Verifica i parametri di fascia, quando l'artefatto li porta.
 *
 * Un peso fuori da zero e uno, o una colonna di miscela che il modello non riceve,
 * produrrebbero un valore atteso plausibile e sbagliato: e' il modo peggiore di sbagliare,
 * quindi si rifiuta l'artefatto invece di correggere in silenzio.
 */
function verificaMaturita(grezza: unknown, ordine: readonly string[]): void {
  if (grezza === null || grezza === undefined) {
    return;
  }
  const maturita = oggetto(grezza, 'maturita');
  const colonna = testo(maturita.colonna_del_campione, 'maturita.colonna_del_campione');
  if (!ordine.includes(colonna)) {
    throw new ArtefattoNonValido(
      'maturita.colonna_del_campione ' + colonna + ' non e\' fra le feature del modello',
    );
  }

  const perFascia = oggetto(maturita.per_fascia, 'maturita.per_fascia');
  const nomi = Object.keys(perFascia);
  if (nomi.length === 0) {
    throw new ArtefattoNonValido('maturita.per_fascia e\' vuoto');
  }

  nomi.forEach((nome) => {
    const campo = 'maturita.per_fascia.' + nome;
    const fascia = oggetto(perFascia[nome], campo);

    const peso = numero(fascia.peso_della_miscela, campo + '.peso_della_miscela');
    if (peso < 0 || peso > 1) {
      throw new ArtefattoNonValido(campo + '.peso_della_miscela deve stare fra zero e uno');
    }
    const mescolatoCon = testo(fascia.mescolato_con, campo + '.mescolato_con');
    if (peso < 1 && !ordine.includes(mescolatoCon)) {
      throw new ArtefattoNonValido(
        campo + '.mescolato_con ' + mescolatoCon + ' non e\' fra le feature del modello',
      );
    }

    const da = numero(fascia.da, campo + '.da');
    if (fascia.a !== null && numero(fascia.a, campo + '.a') < da) {
      throw new ArtefattoNonValido(campo + ' ha estremi invertiti');
    }

    const dispersione = numero(fascia.dispersione, campo + '.dispersione');
    if (dispersione < 1) {
      throw new ArtefattoNonValido(campo + '.dispersione non puo\' essere minore di uno');
    }
    const livello = numero(fascia.livello_nominale, campo + '.livello_nominale');
    if (livello <= 0 || livello >= 1) {
      throw new ArtefattoNonValido(campo + '.livello_nominale deve stare fra zero e uno');
    }
    const distribuzione = testo(fascia.distribuzione_intervallo, campo + '.distribuzione_intervallo');
    if (distribuzione !== 'poisson' && distribuzione !== 'binomiale_negativa') {
      throw new ArtefattoNonValido(campo + '.distribuzione_intervallo non riconosciuta');
    }
  });
}

/**
 * Confronta l'impronta del file letto con quella dichiarata al momento della validazione.
 *
 * Il confronto e' sui byte del file e non su una riscrittura del JSON: due linguaggi
 * scrivono i numeri in modo diverso, i byte no.
 */
export function verificaChecksum(impronta: string, atteso: string): void {
  const normalizzata = impronta.trim().toLowerCase();
  const riferimento = atteso.trim().toLowerCase();
  if (normalizzata !== riferimento) {
    throw new ArtefattoNonValido('il file non corrisponde al checksum validato');
  }
}

/**
 * Carica un artefatto dal disco verificandone prima l'impronta.
 *
 * E' l'unica funzione di questo modulo che tocca il sistema operativo: sta qui perche' il
 * caricamento avviene sempre sul server, e resta separata dal resto perche' tutto il
 * resto e' puro.
 */
export function caricaArtefattoDaFile(percorso: string): ArtefattoModello {
  const contenuto = readFileSync(percorso);
  const impronta = createHash('sha256').update(contenuto).digest('hex');

  const grezzo: unknown = JSON.parse(contenuto.toString('utf8'));
  const artefatto = leggiArtefatto(grezzo);

  const percorsoImpronta = join(dirname(percorso), artefatto.checksum.file);
  const atteso = readFileSync(percorsoImpronta, 'utf8');
  verificaChecksum(impronta, atteso);

  return artefatto;
}
