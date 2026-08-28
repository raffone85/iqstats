import type { Confronto, Direzione, Lettura, NumeroDiLato } from "@/server/iqstats/affronto";

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

function Riquadro({ l }: { readonly l: Lettura }) {
  return (
    <article className="affronto-card">
      <h3 className="affronto-nome">{l.nome}</h3>
      <p className="affronto-frase">{l.frase}</p>
      {l.direzioni.map((d) => <Verso key={d.id} d={d} />)}
      {l.sintesi ? <p className="affronto-sintesi">{l.sintesi}</p> : null}
      {l.assenti.length > 0 ? (
        <p className="affronto-assenti">
          Non osservate abbastanza in questo torneo: {l.assenti.join(", ")}.
        </p>
      ) : null}
    </article>
  );
}

export function ComeSiAffrontano({ letture }: { readonly letture: readonly Lettura[] }) {
  if (letture.length === 0) return null;
  return (
    <section className="dossier-panel" aria-labelledby="affronto-title">
      <p className="dossier-kick">Come si affrontano</p>
      <h2 id="affronto-title" className="sr-only-heading">
        Quello che una squadra produce dal suo lato contro quello che l&apos;altra concede dal suo
      </h2>
      <div className="affronto-griglia">
        {letture.map((l) => <Riquadro key={l.id} l={l} />)}
      </div>
      <p className="dossier-src">
        Dalle nostre osservazioni di questo campionato e di questa stagione, separate per
        casa e trasferta. Ogni numero e&apos; confrontato con la media delle squadre dello
        <b> stesso lato</b>: mescolare i due lati farebbe sembrare straordinaria una squadra
        normale. La riga in corsivo compare solo quando <b>entrambi</b> gli scostamenti
        superano l&apos;errore della loro media e vanno nello stesso verso; dove non compare,
        i numeri non si distinguono dal caso.
      </p>
    </section>
  );
}
