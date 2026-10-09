/**
 * I pronostici che una persona si e' portata via da una gara.
 *
 * **Restano sul dispositivo**, come i campionati preferiti e per la stessa ragione: legarli
 * all'account vorrebbe dire una tabella nuova sul livello dati in linea, che non si tocca
 * senza una decisione esplicita. Qui c'e' solo la forma della scheda e la lettura di quello
 * che il browser restituisce, che non e' fidato: puo' essere vecchio, troncato o scritto a
 * mano.
 *
 * **Una scheda e' una fotografia, e porta la sua ora.** Le probabilita' cambiano fino al
 * calcio d'inizio: senza `salvata` un'immagine girata il giorno dopo passerebbe per la
 * lettura di oggi.
 */
export type RigaSalvata = Readonly<{
  /** La voce come la scrive il dossier: «Over 8,5 calci d'angolo», «1-3 · Multigol». */
  titolo: string;
  /** Di chi e' la linea; `null` sui mercati di partita. */
  chi: string | null;
  /** La probabilita' mostrata in pagina, da 0 a 100. */
  percento: number;
}>;

export type SchedaSalvata = Readonly<{
  gara: number;
  casa: string;
  trasferta: string;
  lega: string | null;
  /** Il calcio d'inizio, ISO. */
  inizio: string;
  /** Quando e' stata salvata, ISO. */
  salvata: string;
  pronostico: RigaSalvata | null;
  /**
   * Come si chiamano le righe sotto il pronostico. Cambia con la pagina da cui si salva:
   * dalla gara sono gli eventi piu' probabili, dalle schede di Oggi e di Expected gli altri
   * consigli, e scrivere l'uno al posto dell'altro direbbe un criterio che non e' il loro.
   */
  elenco: string;
  eventi: readonly RigaSalvata[];
}>;

/** Quello che la pagina della gara prepara: l'ora la mette il tocco. */
export type SchedaDaSalvare = Omit<SchedaSalvata, "salvata">;

export const CHIAVE_SALVATI = "iqstats.salvati.pronostici";

// ponytail: tetto fisso, le piu' vecchie escono. Un archivio vero e' una tabella legata
// all'account, quando verra' decisa.
const MASSIMO = 50;

function riga(v: unknown): RigaSalvata | null {
  if (typeof v !== "object" || v === null) return null;
  const { titolo, chi, percento } = v as Record<string, unknown>;
  if (typeof titolo !== "string" || typeof percento !== "number" || !Number.isFinite(percento)) {
    return null;
  }
  return { titolo, chi: typeof chi === "string" ? chi : null, percento };
}

function scheda(v: unknown): SchedaSalvata | null {
  if (typeof v !== "object" || v === null) return null;
  const s = v as Record<string, unknown>;
  if (
    typeof s.gara !== "number" || typeof s.casa !== "string" || typeof s.trasferta !== "string"
    || typeof s.inizio !== "string" || typeof s.salvata !== "string" || !Array.isArray(s.eventi)
  ) return null;
  return {
    gara: s.gara,
    casa: s.casa,
    trasferta: s.trasferta,
    lega: typeof s.lega === "string" ? s.lega : null,
    inizio: s.inizio,
    salvata: s.salvata,
    pronostico: riga(s.pronostico),
    elenco: typeof s.elenco === "string" ? s.elenco : "Gli eventi più probabili",
    eventi: s.eventi.map(riga).filter((r): r is RigaSalvata => r !== null),
  };
}

/** Le schede lette dalla memoria del browser: quello che non ha la forma giusta si scarta. */
export function schedeSalvate(grezzo: string): readonly SchedaSalvata[] {
  try {
    const letto: unknown = JSON.parse(grezzo);
    return Array.isArray(letto)
      ? letto.map(scheda).filter((s): s is SchedaSalvata => s !== null)
      : [];
  } catch {
    return [];
  }
}

/**
 * L'elenco con una scheda in piu', la piu' recente in cima. **Una per gara:** salvare di
 * nuovo la stessa gara sostituisce la lettura di prima, perche' due schede della stessa
 * partita con numeri diversi non dicono quale vale.
 */
export function conScheda(
  elenco: readonly SchedaSalvata[],
  nuova: SchedaSalvata,
): readonly SchedaSalvata[] {
  return [nuova, ...elenco.filter((s) => s.gara !== nuova.gara)].slice(0, MASSIMO);
}
