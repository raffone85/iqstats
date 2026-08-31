// Server-only ma senza dipendenze: qui vive solo la decisione di **con chi** si confronta
// un giocatore, e i tipi della tabella di base. Sta in un file suo perche' la lettura
// intera tira dentro la cache di Next e la fonte, e una decisione che si puo' provare da
// sola non deve avere bisogno di tutto quello.

/** Un gruppo porta due numeri diversi, e restano diversi: `frequenza` e' quante volte e'
 *  successo davvero in quel gruppo, `stima` e' la probabilita' tarata - restringimento
 *  verso la base del ruolo e, per il giallo, la raddrizzatura della deriva fra periodi.
 *  `stima` esiste solo sul fattore tarato, e solo dopo `calibra_giocatori.py --per-app`. */
type Fattore = { readonly tagli: readonly number[]; readonly gruppi: readonly { readonly gruppo: number; readonly frequenza: number; readonly casi: number; readonly stima?: number }[] };
export type Bersaglio = {
  readonly base: number;
  readonly fattori: Record<string, Fattore | undefined>;
  /** La base dentro ogni ruolo, dove il campione la regge. */
  readonly ruoli?: Record<string, { readonly base: number; readonly casi: number; readonly stima?: number } | undefined>;
  /** Gli stessi fattori, misurati dentro un ruolo solo. */
  readonly per_ruolo?: Record<string, Record<string, Fattore | undefined> | undefined>;
  /** La stima del livello piu' grosso, quando ne' ruolo ne' gruppo reggono il campione. */
  readonly stima?: number;
  /** Di quanti punti percentuali la stima puo' sbagliare, misurato fuori periodo. */
  readonly incertezza_punti?: number;
  /** Quale fattore porta la stima: gli altri restano frequenze osservate. */
  readonly fattore_tarato?: string;
};
export type VoceLega = { readonly gare: number; readonly casi: number; readonly falli_utilizzabili: boolean; readonly giallo: Bersaglio; readonly gol: Bersaglio };

/** I quattro valori che la fonte usa sulla formazione e sulla rosa. */
const RUOLI = ["G", "D", "M", "F"] as const;
export type Ruolo = (typeof RUOLI)[number];
export function isRuolo(valore: unknown): valore is Ruolo {
  return typeof valore === "string" && (RUOLI as readonly string[]).includes(valore);
}
/**
 * Il nome del ruolo gia' con la sua preposizione articolata.
 *
 * «fra i attaccanti» e «la media dei attaccanti» sono sbagliati in italiano, e una regola
 * scritta nel componente ricadrebbe su chi disegna. Le frasi stanno qui, dove sta la
 * parola: chi le usa le incolla e basta.
 */
const NOME_RUOLO: Record<Ruolo | "lega", { readonly fra: string; readonly dei: string }> = {
  G: { fra: "fra i portieri", dei: "dei portieri" },
  D: { fra: "fra i difensori", dei: "dei difensori" },
  M: { fra: "fra i centrocampisti", dei: "dei centrocampisti" },
  F: { fra: "fra gli attaccanti", dei: "degli attaccanti" },
  lega: { fra: "fra tutti i giocatori", dei: "di tutti i giocatori" },
};

/**
 * Con chi si confronta questo giocatore, e su quale tabella.
 *
 * E' la decisione che questa lettura ha cambiato il 30 agosto 2026, quindi vive in una
 * funzione sua ed e' esportata: si prova da sola, senza dover ricostruire una gara intera.
 * Il ripiego sul campionato non e' un caso d'errore, e' il caso in cui il ruolo esiste ma
 * il suo campione in quel campionato non regge, e chi legge deve saperlo.
 */
export function metroDi(bersaglio: Bersaglio, ruolo: Ruolo | null) {
  const tabelle = ruolo === null ? undefined : bersaglio.per_ruolo?.[ruolo];
  const baseRuolo = ruolo === null ? undefined : bersaglio.ruoli?.[ruolo];
  if (tabelle === undefined || baseRuolo === undefined) {
    return {
      conRuolo: false as const,
      base: bersaglio.base,
      stimaBase: bersaglio.stima ?? bersaglio.base,
      metro: NOME_RUOLO.lega,
      fattori: bersaglio.fattori,
    };
  }
  return {
    conRuolo: true as const,
    base: baseRuolo.base,
    stimaBase: baseRuolo.stima ?? baseRuolo.base,
    metro: NOME_RUOLO[ruolo as Ruolo],
    fattori: tabelle,
  };
}
