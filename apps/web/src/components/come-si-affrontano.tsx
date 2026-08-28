import type {
  Cappello, Confronto, Direzione, Lettura, NumeroDiLato, Tratto,
} from "@/server/iqstats/affronto";

/**
 * Il capitolo «Come si affrontano»: quattro letture dell'incontro, una per riquadro.
 *
 * **Ogni numero porta il metro con cui va letto.** Da solo «60,0%» non dice niente: accanto
 * ci sono la media delle squadre dello **stesso lato** e quante ne supera. Il colore sta
 * solo li', sulla posizione, e dice un verso - sopra o sotto il proprio metro - mai un
 * giudizio. Quando lo scostamento non supera l'errore della media, il colore non c'e' e la
 * riga resta inchiostro: non sapere si dichiara.
 *
 * **Le due direzioni sono separate** perche' un incontro ne ha due, e chi attacca in casa
 * non sta leggendo lo stesso campionato di chi attacca in trasferta.
 */
function Numero({ n, ruolo }: { readonly n: NumeroDiLato; readonly ruolo: string }) {
  const classe = n.verso === 1 ? " is-sopra" : n.verso === -1 ? " is-sotto" : "";
  return (
    <span className="affronto-cella">
      <span className="affronto-num">{n.testo}</span>
      <span className="affronto-obs">
        {ruolo} · lega {n.metro}
      </span>
      <span className={`affronto-pos${classe}`}>
        supera il {Math.round(n.posizione * 100)}%
        {n.verso === 0 ? " · in linea col suo metro" : n.verso === 1 ? " · sopra il suo metro" : " · sotto il suo metro"}
      </span>
    </span>
  );
}

/**
 * Una prova in una riga e un asse.
 *
 * **Il centro dell'asse e' la media delle squadre di quel lato**, e i due punti sono le due
 * squadre. Quando cadono dalla stessa parte del centro il tratto si vede prima di leggerlo,
 * ed e' tutto quello che serve capire in cinque secondi. Il verde e il mattone dicono da che
 * parte, cioe' un verso, come vuole il sistema: non sono decorazione.
 *
 * **La riga non e' fatta di colore.** Sopra e sotto l'asse ci sono i nomi con i numeri
 * esatti, e il centro porta scritta la media: chi non distingue i colori legge tutto uguale.
 * L'asse e' `aria-hidden` perche' non aggiunge niente, rende visibile.
 */
function Prova({ t }: { readonly t: Tratto }) {
  const verso = t.verso === 1 ? " is-sopra" : " is-sotto";
  return (
    <div className="affronto-prova">
      <p className="affronto-prova-testa">
        <span className="affronto-parola">{t.nome}</span>
        <span className="affronto-prova-fonte">{t.campione} gare</span>
      </p>
      <p className="affronto-cifre">
        {t.punti.map((p) => (
          <span key={p.chi}>{p.chi} <b>{p.valore}</b></span>
        ))}
      </p>
      <div className={`affronto-asse${verso}`} aria-hidden="true">
        <i className="affronto-asse-centro" />
        <i className="affronto-asse-punto" style={{ left: `${t.punti[0].x}%` }} />
        <i className="affronto-asse-punto is-secondo" style={{ left: `${t.punti[1].x}%` }} />
      </div>
      <p className="affronto-asse-piede">media di lega {t.metro}</p>
    </div>
  );
}

function Riga({ c }: { readonly c: Confronto }) {
  return (
    <li className="affronto-riga">
      <span className="affronto-metrica">{c.nome}</span>
      <span className="affronto-coppia">
        <Numero n={c.produce} ruolo="produce" />
        <Numero n={c.concede} ruolo="concede" />
      </span>
      <span className="affronto-camp">su {c.campione} gare</span>
    </li>
  );
}

function Verso({ d }: { readonly d: Direzione }) {
  return (
    <div className="affronto-dir">
      <p className="affronto-chi">
        Quando attacca <b>{d.chiAttacca}</b>, difende {d.chiDifende}
      </p>
      <ul className="affronto-righe">
        {d.confronti.map((c) => <Riga key={c.chiave} c={c} />)}
      </ul>
    </div>
  );
}

/**
 * Un riquadro si apre solo se lo si chiede.
 *
 * Misurato a 375 px: con tutti e quattro aperti il capitolo era alto **5.239 px**, sei
 * schermate e mezzo di soli numeri, ed e' il modo piu' sicuro perche' non li guardi
 * nessuno. `details` e' nativo: niente JavaScript, tastiera e lettore di schermo gia'
 * dentro. Il verdetto della lettura sta **nel riassunto**, quindi chi non apre non perde
 * la lettura: perde solo la prova, che resta a un tocco.
 */
function Riquadro({ l }: { readonly l: Lettura }) {
  return (
    <details className="affronto-card">
      <summary className="affronto-sommario">
        <span className="affronto-nome">{l.nome}</span>
        {/* Il trattino non e' decorazione: senza, il nome e il verdetto si incollano nel
            testo letto ad alta voce - «Territorioi numeri non le distinguono» - perche' lo
            stacco fra i due lo dava solo il gap del layout. */}
        <span className="affronto-verdetto">
          {" — "}
          {l.forte === null
            ? "i numeri non le distinguono"
            : `${l.forte.nome.toLowerCase()}: tutt'e due ${l.forte.verso === 1 ? "sopra" : "sotto"} il metro`}
        </span>
      </summary>
      <p className="affronto-frase">{l.frase}</p>
      {l.direzioni.map((d) => <Verso key={d.id} d={d} />)}
      {l.sintesi ? <p className="affronto-sintesi">{l.sintesi}</p> : null}
      {l.assenti.length > 0 ? (
        <p className="affronto-assenti">
          Non osservate abbastanza in questo torneo: {l.assenti.join(", ")}.
        </p>
      ) : null}
    </details>
  );
}

export function ComeSiAffrontano({ letture, cappello }: {
  readonly letture: readonly Lettura[];
  readonly cappello: Cappello | null;
}) {
  if (letture.length === 0) return null;
  return (
    <section className="dossier-panel" aria-labelledby="affronto-title">
      <p className="dossier-kick">Come si affrontano</p>
      <h2 id="affronto-title" className="sr-only-heading">
        Quello che una squadra produce dal suo lato contro quello che l&apos;altra concede dal suo
      </h2>
      {/* La lettura prima delle prove. Non contiene un numero che non stia anche sotto. */}
      {cappello ? (
        <div className="affronto-cappello">
          <p className="affronto-titolo">
            {cappello.titolo}
            {cappello.fase === null ? null : <span> {cappello.fase}</span>}
          </p>
          {cappello.tratti.map((t) => <Prova key={t.chiave} t={t} />)}
          {cappello.mute === null ? null : <p className="affronto-mute">{cappello.mute}</p>}
          <p className="affronto-nota">{cappello.nota}</p>
        </div>
      ) : null}
      <div className="affronto-griglia">
        {letture.map((l) => <Riquadro key={l.id} l={l} />)}
      </div>
      <p className="dossier-src">
        Dalle nostre osservazioni di questo campionato e di questa stagione, separate per
        casa e trasferta. Ogni numero è confrontato con la media delle squadre dello
        <b> stesso lato</b>: mescolare i due lati farebbe sembrare straordinaria una squadra
        normale. La riga in corsivo compare solo quando <b>entrambi</b> gli scostamenti
        superano l&apos;errore della loro media e vanno nello stesso verso; dove non compare,
        i numeri non si distinguono dal caso.
      </p>
    </section>
  );
}
