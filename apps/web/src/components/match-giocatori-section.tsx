import type { Candidato, LetturaGiocatori, StatisticaGiocatore } from "@/server/iqstats/giocatori-lettura";

/**
 * Chi rischia il cartellino e chi puo' segnare, in questa gara.
 *
 * **La forma nasce da quattro immagini portate dall'utente**, schede a quattro blocchi con
 * un titolo breve e due righe. Si prende la funzione, non i testi ne' i colori: qui i
 * blocchi sono quattro nomi, e ognuno porta il numero che lo ha scelto.
 *
 * **Dal 31 agosto 2026 il numero grande e' una probabilita', e lo e' davvero.** La fase 2
 * del piano l'ha tarata su gare tenute fuori dall'addestramento, tagliate per data: dove la
 * lettura nomina qualcuno, la stima dichiara 24,3% e succede il 22,8% per il gol, dichiara
 * 17,4% e succede il 18,0% per il giallo. L'errore massimo misurato vale 1,5 punti sul gol e
 * 2,3 sul giallo, e **sta scritto accanto al numero**: un numero senza il suo errore promette
 * una precisione che non ha.
 *
 * **Le due letture non pesano uguale e non si presentano uguale.** Il gol regge ovunque, il
 * cartellino no, e la differenza sta sopra i nomi invece che nascosta sotto.
 *
 * **Il metro e' il ruolo.** Ogni giocatore si confronta con quelli del suo stesso ruolo:
 * misurato su 224.836 casi, il difensore prende il giallo il 16,5% delle volte e l'attaccante
 * il 10,6% contro una base del 13,4%, e con il vecchio metro un difensore qualsiasi risultava
 * esposto **solo perche' difensore**.
 *
 * **Il dettaglio che si apre porta i numeri del giocatore, non le scuse della lettura.**
 * Formazione prevista, campione corto e forza del segnale si leggono senza aprire niente.
 */
function percento(quota: number): string {
  return `${(quota * 100).toFixed(0)}%`;
}

function percentoFine(quota: number): string {
  return `${(quota * 100).toFixed(1).replace(".", ",")}%`;
}

function decimale(valore: number): string {
  return valore.toFixed(valore < 10 ? 2 : 1).replace(".", ",");
}

/** Un totale intero si scrive intero: «4,00 gol» sono quattro gol, e i due zeri fingono
 *  una precisione che un conteggio non ha. */
function conteggio(valore: number): string {
  return Number.isInteger(valore) ? String(valore) : decimale(valore);
}

/** Un solo decimale: l'incertezza vale 1,5 punti, non 1,50. */
function punti(valore: number): string {
  return valore.toFixed(1).replace(".", ",");
}

/** Lo scarto dal proprio metro, corto: sta sotto il numero, dove lo spazio e' quello che
 *  e'. Con chi e' stato confrontato lo dice la riga sotto, per esteso e una volta sola.
 *  Misurato il 31 agosto 2026: la versione lunga - «+7,33 punti degli attaccanti» - a 375
 *  px allargava la colonna e spingeva il numero grande fuori dal pannello, che lo tagliava
 *  a «31» senza il segno di percento. */
function scarto(c: Candidato): { readonly testo: string; readonly verso: string | undefined } {
  const punti = (c.stima - c.stimaBase) * 100;
  if (Math.abs(punti) < c.incertezza) return { testo: "in linea", verso: undefined };
  const segno = punti > 0 ? "+" : "−";
  return {
    testo: `${segno}${decimale(Math.abs(punti))} punti`,
    verso: punti > 0 ? "gioc-su" : "gioc-giu",
  };
}

/** «fra gli attaccanti» diventa «gli attaccanti»: la preposizione la mette la frase. */
function soggetto(metro: Candidato["metro"]): string {
  return metro.fra.replace(/^fra /, "");
}

/** Dove sta il giocatore fra i gruppi del suo ruolo. Non aggiunge informazione:
 *  la rende visibile, quindi resta fuori dall'albero accessibile. */
function Posto({ gruppo, gruppi }: { readonly gruppo: number; readonly gruppi: number }) {
  return (
    <span className="gioc-posto" aria-hidden="true">
      {Array.from({ length: gruppi }, (_, i) => (
        <i key={i} className={i + 1 === gruppo ? "gioc-posto-qui" : undefined} />
      ))}
    </span>
  );
}

/** Tutti i numeri del giocatore in questa stagione, per novanta minuti e in totale.
 *  Vengono dalle stesse righe gia' scaricate per la lettura: nessuna chiamata in piu'. */
function Numeri({ voci }: { readonly voci: readonly StatisticaGiocatore[] }) {
  return (
    <div className="gioc-numeri">
      <p className="gioc-numeri-testa">
        Ogni 90 minuti <span>totale</span>
      </p>
      <dl className="gioc-griglia">
        {voci.map((v) => (
          <div key={v.etichetta} className={v.scelto ? "gioc-voce gioc-voce-scelta" : "gioc-voce"}>
            <dt>
              {v.etichetta}
              {v.scelto ? <b className="gioc-tag">il numero che lo ha scelto</b> : null}
            </dt>
            <dd>
              <b>{decimale(v.per90)}</b>
              <span>{conteggio(v.totale)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Blocco({ c, verbo, cosa }: {
  readonly c: Candidato;
  readonly verbo: string;
  readonly cosa: string;
}) {
  const s = scarto(c);
  return (
    <li className="gioc-blocco">
      <details className="gioc-det">
        <summary className="gioc-sum">
          <span className="gioc-riga">
            <span className="gioc-chi">
              <b className="gioc-nome">{c.nome}</b>
              <span className="gioc-squadra">{c.squadra}</span>
            </span>
            <span className="gioc-num">
              <b>{percento(c.stima)}</b>
              <span className={s.verso ? `gioc-base ${s.verso}` : "gioc-base"}>{s.testo}</span>
            </span>
          </span>
          <Posto gruppo={c.gruppo} gruppi={c.gruppi} />
          <span className="gioc-sotto">
            <span className="gioc-sotto-testo">
              {decimale(c.valore)} {c.fattore} ogni 90&apos;, su {c.gare}{" "}
              {c.gare === 1 ? "gara" : "gare"}. Nel suo campionato {soggetto(c.metro)}{" "}
              {verbo} il {percento(c.stimaBase)} delle volte.
            </span>
            <span className="gioc-apri" aria-hidden="true">
              tutti i numeri
            </span>
          </span>
        </summary>
        <div className="gioc-dentro">
          <Numeri voci={c.statistiche} />
          <p className="gioc-conto">
            {cosa} stimato {percentoFine(c.stima)} contro {percentoFine(c.stimaBase)} di chi sta
            al centro del suo ruolo. La stima puo&apos; sbagliare fino a {punti(c.incertezza)}{" "}
            punti: e&apos; lo scarto massimo misurato su gare tenute fuori
            dall&apos;addestramento. Nel suo gruppo, il {c.gruppo}&ordm; su {c.gruppi}{" "}
            {c.metro.fra}, {cosa.toLowerCase()} e&apos; poi arrivato nel{" "}
            {percentoFine(c.frequenza)} dei {c.casi.toLocaleString("it-IT")} casi misurati. Il
            suo passo poggia su {c.minuti} minuti giocati.
            {c.metroDelRuolo
              ? ""
              : " Il suo ruolo non ha un campione abbastanza largo in questo campionato, quindi il confronto è con tutti."}
          </p>
        </div>
      </details>
    </li>
  );
}

function Lettura({ titolo, kick, limite, provenienza, blocchi, verbo, cosa, famiglia }: {
  readonly titolo: string;
  readonly kick: string;
  /** Il limite che cambia il senso della lettura: sta sopra i nomi, sempre visibile. */
  readonly limite: string;
  /** Da dove escono i numeri: sta sotto, dove serve a chi vuole controllare. */
  readonly provenienza: string;
  readonly blocchi: readonly Candidato[];
  readonly verbo: string;
  readonly cosa: string;
  readonly famiglia: string;
}) {
  if (blocchi.length === 0) return null;
  const id = `gioc-${famiglia}-title`;
  return (
    <section className="dossier-panel gioc-panel" aria-labelledby={id}>
      <span className={`gioc-fascia gioc-fascia-${famiglia}`} aria-hidden="true" />
      <p className="dossier-kick">{kick}</p>
      <h3 id={id} className="squad-section-title">{titolo}</h3>
      {/* Il limite prima dei nomi: chi si ferma qui deve averlo letto lo stesso. */}
      <p className="gioc-limite">{limite}</p>
      <ul className="gioc-blocchi">
        {blocchi.map((c) => (
          <Blocco key={`${c.id}-${famiglia}`} c={c} verbo={verbo} cosa={cosa} />
        ))}
      </ul>
      <p className="dossier-src">{provenienza}</p>
    </section>
  );
}

type Props = {
  readonly lettura: LetturaGiocatori;
  /** Falso finche' la formazione e' solo prevista: cambia che cosa la lettura promette. */
  readonly formazioneConfermata: boolean;
};

export function MatchGiocatoriSection({ lettura, formazioneConfermata }: Props) {
  const { cartellini, marcatori, gareConDato, gareStagione, campioneTabella } = lettura;
  if (cartellini.length === 0 && marcatori.length === 0) return null;

  const formazione = formazioneConfermata
    ? "Formazioni ufficiali."
    : "Formazione prevista dalla fonte, non ancora ufficiale: se gli undici cambiano, cambiano anche questi nomi.";
  const casi = campioneTabella.casi.toLocaleString("it-IT");
  const stagione = `Il passo di ogni giocatore viene dalle ${gareConDato} gare di questa stagione che portano statistiche per giocatore, su ${gareStagione} giocate. I gruppi e le stime escono da ${casi} casi di questo campionato, con le medie calcolate sulle sole gare precedenti a quella da leggere.`;
  const taratura =
    "La stima è tarata su gare tenute fuori dall'addestramento e divise per data, non a caso: quando dice 24% succede il 22,8%, quando dice 17% succede il 18%.";

  return (
    <>
      <Lettura
        famiglia="tiri"
        kick="Chi può segnare"
        titolo="I quattro più probabili fra quelli attesi in campo"
        verbo="segnano"
        cosa="Gol"
        blocchi={marcatori}
        limite={`${formazione} È una probabilità misurata, non un pronostico: sbaglia fino a 1,5 punti, e nessuno di questi nomi segna più spesso di così.`}
        provenienza={`${stagione} ${taratura} Il confronto è con i giocatori dello stesso ruolo: l'attaccante segna nel 18,4% delle presenze e il difensore nel 3,6%, e quell'ordine regge in tutti e 27 i campionati misurati. Dentro il ruolo, chi tira di più segna di più: è la lettura per giocatore che tiene meglio.`}
      />
      <Lettura
        famiglia="gialli"
        kick="Chi rischia il cartellino"
        titolo="I quattro più esposti fra quelli attesi in campo"
        verbo="prendono il giallo"
        cosa="Giallo"
        blocchi={cartellini}
        limite={`${formazione} Questa lettura è più debole dell'altra: anche il nome più in alto, quattro volte su cinque, il giallo non lo prende, e la stima sbaglia fino a 2,3 punti. I nomi sono scelti per quanto superano il proprio ruolo, non per la frequenza più alta.`}
        provenienza={`${stagione} ${taratura} Il confronto è con i giocatori dello stesso ruolo: il difensore prende il giallo il 16,5% delle volte e l'attaccante il 10,6%, e quell'ordine regge in 26 campionati su 27. La severità dei cartellini cambia da una stagione all'altra, e la stima lo corregge: senza quella correzione prometteva 20,2% dove poi succedeva il 18,0%.`}
      />
    </>
  );
}
