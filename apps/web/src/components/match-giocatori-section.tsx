import type { Candidato, LetturaGiocatori } from "@/server/iqstats/giocatori-lettura";

/**
 * Chi rischia il cartellino e chi puo' segnare, in questa gara.
 *
 * **La forma nasce da quattro immagini portate dall'utente**, schede a quattro blocchi con
 * un titolo breve e due righe. Si prende la funzione, non i testi ne' i colori: qui i
 * blocchi sono quattro nomi, e ognuno porta il numero che lo ha scelto.
 *
 * **Non e' una probabilita', ed e' scritto in chiaro.** Ogni riga dice in quale quinto del
 * campionato sta quel giocatore e quante volte quel quinto ha poi preso il giallo o
 * segnato, con il campione accanto. Una stima tarata non esiste ancora, e finche' non
 * esiste un numero che finga di esserlo non si mostra.
 *
 * **Le due letture non pesano uguale e non si presentano uguale.** Misurato su 254.743 casi
 * e 28 campionati: chi tira di piu' segna circa il doppio della base del suo campionato, e
 * l'ordine regge in tutti e ventisei i campionati controllati; chi contrasta di piu' prende
 * il giallo 1,25 volte la base, e l'ordine regge in quattordici su ventisei. La debolezza
 * del cartellino sta scritta sopra i nomi, non nascosta sotto.
 *
 * **Il metro e' il ruolo, dal 30 agosto 2026.** Ogni giocatore si confronta con quelli del
 * suo stesso ruolo, non con la media del campionato: misurato su 224.836 casi, il difensore
 * prende il giallo il 16,5% delle volte e l'attaccante il 10,6% contro una base del 13,4%,
 * e con il vecchio metro un difensore qualsiasi risultava esposto **solo perche' difensore**.
 * Il ruolo compare quindi in ogni riga, perche' il numero accanto al nome non si legge
 * senza sapere con chi e' stato confrontato.
 *
 * **Il limite non sta dentro un comando che si apre.** Formazione prevista, campione corto e
 * forza del segnale si leggono senza aprire niente; il dettaglio che si apre aggiunge solo
 * l'aritmetica.
 */
function percento(quota: number): string {
  return `${(quota * 100).toFixed(0)}%`;
}

function decimale(valore: number): string {
  return valore.toFixed(valore < 10 ? 2 : 1).replace(".", ",");
}

/** Dove sta il giocatore fra i gruppi del suo campionato. Non aggiunge informazione:
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

function Blocco({ c, verbo, cosa }: {
  readonly c: Candidato;
  readonly verbo: string;
  readonly cosa: string;
}) {
  const rapporto = c.base > 0 ? c.frequenza / c.base : 1;
  const verso = rapporto >= 1.1 ? "gioc-su" : rapporto <= 0.9 ? "gioc-giu" : undefined;
  return (
    <li className="gioc-blocco">
      <details className="gioc-det">
        <summary className="gioc-sum">
          <span className="gioc-chi">
            <b className="gioc-nome">{c.nome}</b>
            <span className="gioc-squadra">{c.squadra}</span>
          </span>
          <span className="gioc-num">
            <b className={verso}>{percento(c.frequenza)}</b>
            <span className="gioc-base">
              {c.metro.fra} {percento(c.base)}
            </span>
          </span>
        </summary>
        <p className="gioc-perche">
          {decimale(c.valore)} {c.fattore} ogni 90&apos;, su {c.gare}{" "}
          {c.gare === 1 ? "gara" : "gare"} di questa stagione. &Egrave; il{" "}
          <b>{c.gruppo}&ordm; gruppo su {c.gruppi}</b> {c.metro.fra} per questo numero, e chi
          sta in quel gruppo {verbo} <b>{percento(c.frequenza)}</b> delle volte, su {c.casi}{" "}
          casi misurati.
        </p>
        <Posto gruppo={c.gruppo} gruppi={c.gruppi} />
        <p className="gioc-conto">
          {cosa} osservato {percento(c.frequenza)} contro {percento(c.base)} di base:{" "}
          {rapporto >= 1
            ? `${decimale(rapporto)} volte la media ${c.metro.dei}`
            : `sotto la media ${c.metro.dei}`}
          . Il suo passo poggia su {c.minuti} minuti giocati.
          {c.metroDelRuolo
            ? ""
            : " Il suo ruolo non ha un campione abbastanza largo in questo campionato, quindi il confronto è con tutti."}
        </p>
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
  const stagione = `Il passo di ogni giocatore viene dalle ${gareConDato} gare di questa stagione che portano statistiche per giocatore, su ${gareStagione} giocate. I gruppi e le frequenze escono da ${casi} casi di questo campionato, con le medie calcolate sulle sole gare precedenti a quella da leggere.`;

  return (
    <>
      <Lettura
        famiglia="tiri"
        kick="Chi può segnare"
        titolo="I quattro che tirano di più fra quelli attesi in campo"
        verbo="segna"
        cosa="Gol"
        blocchi={marcatori}
        limite={`${formazione} Non è una probabilità: è quante volte, in questo campionato, chi tira come loro ha poi segnato.`}
        provenienza={`${stagione} Il confronto è con i giocatori dello stesso ruolo: l'attaccante segna nel 18,4% delle presenze e il difensore nel 3,6%, e quell'ordine regge in tutti e 27 i campionati misurati. Dentro il ruolo, chi tira di più segna di più: è la lettura per giocatore che tiene meglio.`}
      />
      <Lettura
        famiglia="gialli"
        kick="Chi rischia il cartellino"
        titolo="I quattro più esposti fra quelli attesi in campo"
        verbo="prende il giallo"
        cosa="Giallo"
        blocchi={cartellini}
        limite={`${formazione} Questa lettura è più debole dell'altra: anche il nome più in alto, quattro volte su cinque, il giallo non lo prende. I nomi sono scelti per quanto superano il proprio ruolo, non per la frequenza più alta: un difensore parte da più in alto di un attaccante e non è merito suo.`}
        provenienza={`${stagione} Il confronto è con i giocatori dello stesso ruolo: il difensore prende il giallo il 16,5% delle volte e l'attaccante il 10,6%, e quell'ordine regge in 26 campionati su 27. Dentro il ruolo il segnale è debole: fra i difensori i contrasti valgono 1,12 volte e ordinano in 3 campionati su 28, i falli 1,40 volte in 10 su 28. Per questo qui non c'è nessun numero che finga di essere una probabilità.`}
      />
    </>
  );
}
