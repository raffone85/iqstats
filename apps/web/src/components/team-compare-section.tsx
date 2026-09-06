// Due squadre affiancate, con l'errore accanto alla differenza.
//
// **La differenza da sola mente.** Due medie diverse non sono due squadre diverse: sui tiri
// per gara la variabilita' dentro la stessa squadra vale `sd = 4,86`, quindi con otto gare
// per parte tre tiri di scarto stanno dentro il rumore. Ogni riga dice se lo scarto **regge**
// due errori standard, e quando non regge lo scrive invece di lasciarlo dedurre.
//
// **Niente blu e niente arancio.** Il master li riserva a un verso rispetto a un
// riferimento: qui «piu' falli» non e' meglio ne' peggio, e colorarlo sarebbe un giudizio.
// Le due barre sono quelle di «Casa contro trasferta» — `is-home` e `is-away` — che
// distinguono due lati senza dichiarare un verso. Nessun CSS nuovo.
//
// **I dieci di dettaglio stanno in un menu' richiudibile.** Sono nella stessa riga del
// database e non costano nulla in piu', ma venti righe aperte insieme non si leggono: la
// pagina si apre sui dieci che il prodotto nomina ovunque, il resto si chiede.
import {
  differenzaFraSquadre,
  type ProfiloSquadra,
  type VoceStatistica,
} from "@/server/iqstats/team-stats";

/**
 * Due decimali dove il numero e' piccolo, uno dove non servono.
 *
 * **Le cifre le decide il riferimento, non il numero stampato.** Con medie di 13,6 e 14,7
 * una differenza scritta «1,05» non torna a chi sottrae: le tre quantita' della stessa riga
 * — le due medie e il loro scarto — vanno lette con le stesse cifre.
 */
function valore(voce: VoceStatistica, numero: number, riferimento = numero): string {
  const cifre = voce.percentuale ? 1 : riferimento < 10 ? 2 : 1;
  return numero.toFixed(cifre).replace(".", ",") + (voce.percentuale ? "%" : "");
}

function Bersaglio({
  a, b, voceA, voceB,
}: {
  readonly a: ProfiloSquadra;
  readonly b: ProfiloSquadra;
  readonly voceA: VoceStatistica;
  readonly voceB: VoceStatistica;
}) {
  const scarto = differenzaFraSquadre(voceA, voceB);
  // Le barre sono in proporzione alla piu' alta delle due: e' un confronto fra queste due
  // squadre, non una posizione dentro il campionato, che e' un'altra lettura e sta altrove.
  const massimo = Math.max(voceA.media, voceB.media, 0.0001);
  const larghezza = (n: number) => String(Math.round((n / massimo) * 100)) + "%";
  // La riga si legge con le cifre della media piu' grande: le due medie e la differenza
  // devono tornare fra loro.
  const cifra = (n: number) => valore(voceA, n, Math.max(voceA.media, voceB.media));
  // **Lo scarto stampato e' quello fra i due numeri stampati.** Con medie di 13,645 e
  // 14,697 la pagina scrive 13,6 e 14,7, e una differenza calcolata sui valori pieni
  // uscirebbe 1,0: chi sottrae ne troverebbe 1,1 e non si fiderebbe piu' di nessuno dei tre.
  // Il criterio di sotto — se la differenza regge — resta sulla differenza vera, dove la
  // mezza cifra persa qui non conta nulla contro un errore che vale piu' di un'unita'.
  const stampato = (n: number) => Number(cifra(n).replace(",", "."));
  const scartoVisibile = Math.abs(stampato(voceA.media) - stampato(voceB.media));

  return (
    <div className="squad-metric">
      <p className="squad-metric-name">{voceA.nome}</p>

      <div className="squad-metric-row">
        <span className="squad-metric-side">{a.nome}</span>
        <span className="squad-metric-bar" aria-hidden="true">
          <i className="is-home" style={{ width: larghezza(voceA.media) }} />
        </span>
        <span className="squad-metric-value">
          {cifra(voceA.media)}
          <em>su {voceA.campione} gare</em>
        </span>
      </div>

      <div className="squad-metric-row">
        <span className="squad-metric-side">{b.nome}</span>
        <span className="squad-metric-bar" aria-hidden="true">
          <i className="is-away" style={{ width: larghezza(voceB.media) }} />
        </span>
        <span className="squad-metric-value">
          {cifra(voceB.media)}
          <em>su {voceB.campione} gare</em>
        </span>
      </div>

      <p className="dossier-src">
        {scarto === null ? (
          <>Campione troppo piccolo per dire se la differenza sia vera.</>
        ) : scarto.regge ? (
          <>
            Differenza di {cifra(scartoVisibile)} a favore di{" "}
            {scarto.differenza > 0 ? a.nome : b.nome}, contro un errore di ±
            {cifra(scarto.errore)}: <b>regge</b>, perché supera due volte l&apos;errore
            dei due campioni.
          </>
        ) : (
          <>
            Differenza di {cifra(scartoVisibile)}, ma l&apos;errore dei
            due campioni vale ±{cifra(scarto.errore)}:{" "}
            <b>non regge</b>. Con questi numeri le due squadre non si distinguono, e leggere
            la differenza come un fatto significherebbe fingere una precisione che non
            abbiamo.
          </>
        )}
      </p>
    </div>
  );
}

type Props = Readonly<{
  a: ProfiloSquadra;
  b: ProfiloSquadra;
}>;

export function TeamCompareSection({ a, b }: Props) {
  // Si confrontano solo i bersagli che **entrambe** portano: un numero contro un'assenza
  // non e' un confronto, e riempire il vuoto con uno zero e' l'errore che tutto questo
  // livello dati evita.
  const comuni = a.voci
    .map((voceA) => ({ voceA, voceB: b.voci.find((v) => v.chiave === voceA.chiave) }))
    .filter((c): c is { voceA: VoceStatistica; voceB: VoceStatistica } => c.voceB !== undefined);
  const principali = comuni.filter((c) => c.voceA.gruppo === "principale");
  const dettagli = comuni.filter((c) => c.voceA.gruppo === "dettaglio");
  const soloDiUno = a.voci.filter(
    (v) => !b.voci.some((w) => w.chiave === v.chiave),
  ).length + b.voci.filter((v) => !a.voci.some((w) => w.chiave === v.chiave)).length;

  const giorno = (quando: string) => new Date(quando).toLocaleDateString("it-IT", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <section className="dossier-panel" aria-labelledby="confronto-title">
      <p className="dossier-kick">Confronto</p>
      <h2 id="confronto-title" className="squad-title">
        {a.nome} contro {b.nome}
      </h2>

      <p className="dossier-src">
        Medie per gara degli <b>ultimi 365 giorni</b>: {a.nome} su {a.gare} gare dal{" "}
        {giorno(a.dal)} al {giorno(a.al)}, {b.nome} su {b.gare} gare dal {giorno(b.dal)} al{" "}
        {giorno(b.al)}. La finestra scavalca il confine di stagione, ed è voluto: dentro la
        sola stagione corrente le squadre hanno 7,1 gare di media e l&apos;errore della media
        sui tiri vale 1,84, cioè l&apos;85% della differenza vera fra squadre. Su 365 giorni
        le gare diventano 30,9 e l&apos;errore scende a 0,87. Le classifiche restano invece
        dentro la stagione, dove la finestra non si sceglie.
      </p>

      {principali.length === 0 ? (
        <p className="dossier-src">
          Nessun bersaglio è osservato per entrambe le squadre: non c&apos;è niente da
          confrontare, e riempire il vuoto con degli zeri direbbe il falso.
        </p>
      ) : (
        <div className="squad-metric-list">
          {principali.map((c) => (
            <Bersaglio key={c.voceA.chiave} a={a} b={b} voceA={c.voceA} voceB={c.voceB} />
          ))}
        </div>
      )}

      {dettagli.length > 0 ? (
        <details className="squad-group">
          <summary>
            Il resto della partita
            <span>{dettagli.length} bersagli</span>
          </summary>
          <div className="squad-metric-list">
            {dettagli.map((c) => (
              <Bersaglio key={c.voceA.chiave} a={a} b={b} voceA={c.voceA} voceB={c.voceB} />
            ))}
          </div>
        </details>
      ) : null}

      <p className="dossier-src">
        Una differenza <b>regge</b> quando supera due volte l&apos;errore dei due campioni,
        cioè quando è più grande di quanto le due squadre già oscillino da una gara
        all&apos;altra. È il
        motivo per cui a volte il numero più alto non è la lettura più solida: fra due letture
        si sceglie quella che regge, non quella che colpisce.
        {soloDiUno > 0 ? (
          <>
            {" "}
            {soloDiUno === 1 ? "Un bersaglio è" : `${soloDiUno} bersagli sono`} osservati per
            una sola delle due squadre e restano fuori dal confronto: un numero contro
            un&apos;assenza non è un confronto.
          </>
        ) : null}
      </p>
    </section>
  );
}
