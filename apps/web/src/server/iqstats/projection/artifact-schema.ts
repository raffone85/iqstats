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

/**
 * Un punto della curva di accuratezza, letto come punteggio 0-100 con la sua incertezza.
 *
 * Il punteggio e' la quota misurata fuori campione, moltiplicata per cento. Non e' una
 * sintesi di altre grandezze e non contiene giudizi: l'incertezza che lo accompagna e'
 * quella binomiale della quota, e in fascia EARLY e' larga venti punti.
 */
export interface PunteggioDiAffidabilita {
  readonly punteggio: number;
  readonly punteggio_basso: number;
  readonly punteggio_alto: number;
  readonly fascia_di_lettura: string;
  readonly quota: number;
  readonly righe_entro_soglia: number;
  readonly righe_di_prova: number;
}

export interface FasciaDiLettura {
  readonly da: number;
  readonly fino_a: number;
  readonly nome: string;
}

/**
 * L'affidabilita' del bersaglio: la probabilita' che lo scarto resti entro la soglia.
 *
 * La soglia e' assoluta e specifica del bersaglio, nelle sue unita' reali. La curva intera
 * resta nell'artefatto perche' una soglia diversa si possa leggere domani senza
 * riaddestrare nulla.
 *
 * Questo numero non e' la probabilita' dell'evento. Sono due grandezze diverse.
 */
/**
 * Lo strato condizionale: la probabilita' stimata per **questa** gara, invece della
 * costante della fascia.
 *
 * E' una regressione logistica su condizioni note prima del calcio d'inizio, addestrata
 * sugli errori fuori campione del motore. C'e' solo dove ha battuto la costante su Brier
 * e log-loss: dove non l'ha battuta, l'artefatto non lo porta e resta la costante.
 *
 * L'incertezza che dichiara non e' binomiale: e' lo scarto medio fra probabilita' promessa
 * e frequenza osservata, misurato per decili.
 */
export interface StratoCondizionale {
  readonly condizioni: readonly string[];
  readonly standardizzazione: { readonly media: readonly number[]; readonly scala: readonly number[] };
  readonly coefficienti: readonly number[];
  readonly intercetta: number;
  readonly collegamento: 'logistico';
  readonly righe_di_addestramento: number;
  readonly scarto_medio_di_calibrazione: number;
  readonly origini_vinte_su_brier: string;
  readonly regola: string;
  readonly significato: string;
}

export interface Affidabilita {
  readonly definizione: string;
  readonly soglia_assoluta: number;
  readonly come_e_stata_scelta: string;
  readonly fasce_di_lettura: readonly FasciaDiLettura[];
  readonly misurata_sulla_miscela_congelata: boolean;
  readonly condizionale: StratoCondizionale | null;
  readonly complessivo: PunteggioDiAffidabilita;
  readonly per_fascia: Readonly<Record<string, PunteggioDiAffidabilita>>;
  readonly curva_completa: Record<string, unknown>;
  readonly avvertenza: string;
}

export interface RiferimentoChecksum {
  readonly algoritmo: 'sha256';
  readonly ambito: string;
  readonly file: string;
}

/**
 * L'incertezza del totale di gara.
 *
 * **Il valore atteso del totale non e' qui, ed e' voluto:** e' la somma dei due attesi, e
 * conservarne una versione propria vorrebbe dire avere un terzo numero capace di
 * contraddire i due lati. Qui sta solo cio' che la somma non sa: quanto e' dispersa.
 *
 * Il metodo e' la calibrazione diretta sui residui della somma. La composizione delle due
 * marginali con la dipendenza misurata e' stata confrontata fuori campione e non vince:
 * il registro della decisione e' in `data/registro-totale.json`.
 */
export interface TotaleDiGaraArtefatto {
  readonly metodo: 'calibrazione_diretta';
  readonly dispersione: number;
  readonly distribuzione: DistribuzioneIntervallo;
  readonly livello_nominale: number;
  readonly livello_dichiarato: number;
  readonly gare_di_addestramento: number;
  readonly prova_fuori_campione: Record<string, unknown> | null;
  readonly calibrazione_delle_linee_sui_due_lati: number | null;
  readonly avvertenza: string;
  readonly affidabilita?: AffidabilitaDelTotale | null;
}

/**
 * L'affidabilita' del totale: la stessa definizione delle marginali, altra grandezza.
 *
 * La soglia assoluta viene dalla migliore baseline **del totale**, non da quella del lato,
 * e la curva ha una griglia piu' larga perche' il totale ha una scala piu' grande.
 *
 * Non c'e' lo strato condizionale: sul totale non e' stato misurato, e il tipo lo dice
 * invece di lasciare un campo che sarebbe sempre nullo.
 */
export type AffidabilitaDelTotale = Omit<Affidabilita, 'condizionale'>;

/** La convenzione delle cinque soglie centrali, dichiarata invece che scritta nel codice. */
export interface LineeArtefatto {
  readonly quante: number;
  readonly passi: readonly number[];
  readonly regola: string;
  readonly probabilita_da: string;
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
  readonly affidabilita: Affidabilita | null;
  // Assenti negli artefatti esportati prima del 20 agosto 2026: chi legge si regola
  // sulla loro assenza invece di darla per scontata.
  readonly totale?: TotaleDiGaraArtefatto | null;
  readonly linee?: LineeArtefatto | null;
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
  verificaAffidabilita(radice.affidabilita, ordine as readonly string[]);
  verificaTotale(radice.totale);

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
 * Verifica il blocco di affidabilita', quando l'artefatto lo porta.
 *
 * Un punteggio incoerente con la quota da cui dice di venire, o un estremo dell'incertezza
 * dalla parte sbagliata, sarebbero un numero credibile e falso proprio dove il metodo
 * vieta di inventare: si rifiuta l'artefatto invece di mostrarlo.
 */
function verificaPunteggio(grezzo: unknown, campo: string): void {
  const voce = oggetto(grezzo, campo);
  const quota = numero(voce.quota, campo + '.quota');
  if (quota < 0 || quota > 1) {
    throw new ArtefattoNonValido(campo + '.quota deve stare fra zero e uno');
  }
  const punteggio = numero(voce.punteggio, campo + '.punteggio');
  const basso = numero(voce.punteggio_basso, campo + '.punteggio_basso');
  const alto = numero(voce.punteggio_alto, campo + '.punteggio_alto');
  if (punteggio < 0 || punteggio > 100) {
    throw new ArtefattoNonValido(campo + '.punteggio deve stare fra zero e cento');
  }
  if (basso > punteggio || alto < punteggio) {
    throw new ArtefattoNonValido(campo + ' ha un intervallo di incertezza che non contiene il punteggio');
  }
  if (Math.abs(punteggio - Math.round(100 * quota)) > 1) {
    throw new ArtefattoNonValido(campo + '.punteggio non viene dalla quota che dichiara');
  }
  testo(voce.fascia_di_lettura, campo + '.fascia_di_lettura');
  const righe = numero(voce.righe_di_prova, campo + '.righe_di_prova');
  if (righe <= 0) {
    throw new ArtefattoNonValido(campo + '.righe_di_prova deve essere maggiore di zero');
  }
}

function verificaCondizionale(grezzo: unknown, ordine: readonly string[]): void {
  if (grezzo === null || grezzo === undefined) {
    return;
  }
  const strato = oggetto(grezzo, 'affidabilita.condizionale');
  const condizioni = strato.condizioni;
  if (!Array.isArray(condizioni) || condizioni.some((nome) => typeof nome !== 'string')) {
    throw new ArtefattoNonValido('affidabilita.condizionale.condizioni non e\' un elenco di nomi');
  }
  // Una condizione che il modello non riceve renderebbe il punteggio incalcolabile in
  // produzione: meglio rifiutare l\'artefatto che scoprirlo davanti a una gara.
  condizioni.forEach((nome) => {
    if (nome !== 'valore_atteso' && !ordine.includes(nome as string)) {
      throw new ArtefattoNonValido(
        'affidabilita.condizionale.condizioni contiene ' + String(nome)
        + ', che non e\' fra le feature del modello',
      );
    }
  });
  const standardizzazione = oggetto(strato.standardizzazione, 'affidabilita.condizionale.standardizzazione');
  const media = elencoDiNumeri(standardizzazione.media, 'affidabilita.condizionale.media');
  const scala = elencoDiNumeri(standardizzazione.scala, 'affidabilita.condizionale.scala');
  const coefficienti = elencoDiNumeri(strato.coefficienti, 'affidabilita.condizionale.coefficienti');
  if (condizioni.length !== media.length || condizioni.length !== scala.length
    || condizioni.length !== coefficienti.length) {
    throw new ArtefattoNonValido('affidabilita.condizionale ha lunghezze incoerenti');
  }
  if (scala.some((valore) => valore === 0)) {
    throw new ArtefattoNonValido('affidabilita.condizionale.scala contiene uno zero');
  }
  numero(strato.intercetta, 'affidabilita.condizionale.intercetta');
  if (strato.collegamento !== 'logistico') {
    throw new ArtefattoNonValido('affidabilita.condizionale.collegamento non riconosciuto');
  }
  const calibrazione = numero(strato.scarto_medio_di_calibrazione,
    'affidabilita.condizionale.scarto_medio_di_calibrazione');
  if (calibrazione < 0 || calibrazione > 1) {
    throw new ArtefattoNonValido(
      'affidabilita.condizionale.scarto_medio_di_calibrazione deve stare fra zero e uno',
    );
  }
}

/**
 * L'incertezza del totale, quando l'artefatto la porta.
 *
 * Un artefatto senza il blocco e' valido: gli artefatti esportati prima del 20 agosto
 * 2026 non ce l'hanno, e chi legge lo tratta come «totale non dichiarato». Un blocco
 * malformato invece e' un errore, perche' vorrebbe dire che l'esportazione ha scritto
 * qualcosa che il predittore non sa usare.
 */
function verificaTotale(grezzo: unknown): void {
  if (grezzo === null || grezzo === undefined) {
    return;
  }
  const totale = oggetto(grezzo, 'totale');
  const metodo = testo(totale.metodo, 'totale.metodo');
  if (metodo !== 'calibrazione_diretta') {
    throw new ArtefattoNonValido(
      `metodo del totale ${metodo} non riconosciuto: il predittore sa solo comporre la `
      + 'somma dei due attesi e leggerne la dispersione',
    );
  }
  const distribuzione = testo(totale.distribuzione, 'totale.distribuzione');
  if (distribuzione !== 'poisson' && distribuzione !== 'binomiale_negativa') {
    throw new ArtefattoNonValido(`distribuzione del totale ${distribuzione} non riconosciuta`);
  }
  const dispersione = numero(totale.dispersione, 'totale.dispersione');
  if (dispersione < 1) {
    throw new ArtefattoNonValido('la dispersione del totale non puo\' essere minore di uno');
  }
  const livello = numero(totale.livello_nominale, 'totale.livello_nominale');
  if (livello <= 0 || livello >= 1) {
    throw new ArtefattoNonValido('il livello nominale del totale deve stare fra zero e uno');
  }
  // L'affidabilita' del totale e' facoltativa per la stessa ragione del blocco che la
  // contiene: gli artefatti esportati prima non ce l'hanno. Se c'e', vale la stessa
  // regola delle marginali, e la soglia e' quella del totale.
  if (totale.affidabilita !== null && totale.affidabilita !== undefined) {
    verificaSogliaEPunteggi(totale.affidabilita, 'totale.affidabilita');
  }
}

function verificaAffidabilita(grezza: unknown, ordine: readonly string[]): void {
  if (grezza === null || grezza === undefined) {
    return;
  }
  const affidabilita = verificaSogliaEPunteggi(grezza, 'affidabilita');
  verificaCondizionale(affidabilita.condizionale, ordine);
}

/**
 * Soglia assoluta, punteggio complessivo e punteggi per fascia: la parte che il bersaglio
 * e il totale hanno in comune, verificata una volta sola.
 *
 * Due verificatori paralleli sarebbero due posti dove la stessa regola puo' divergere, e
 * questo progetto ne ha gia' pagate tre.
 */
function verificaSogliaEPunteggi(grezza: unknown, campo: string): Record<string, unknown> {
  const blocco = oggetto(grezza, campo);
  const soglia = numero(blocco.soglia_assoluta, campo + '.soglia_assoluta');
  if (soglia <= 0) {
    throw new ArtefattoNonValido(campo + '.soglia_assoluta deve essere positiva');
  }
  verificaPunteggio(blocco.complessivo, campo + '.complessivo');
  const perFascia = oggetto(blocco.per_fascia, campo + '.per_fascia');
  Object.keys(perFascia).forEach((nome) => {
    verificaPunteggio(perFascia[nome], campo + '.per_fascia.' + nome);
  });
  return blocco;
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
