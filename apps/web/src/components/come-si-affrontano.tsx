import type { Cappello, Tratto } from "@/server/iqstats/affronto";

/**
 * Il capitolo «Come si affrontano»: un titolo e le righe che lo reggono, tutte uguali.
 *
 * **Prima erano due strutture per la stessa cosa.** In cima due prove con l'asse, sotto
 * quattro riquadri con ventotto righe in colonne prodotto/concesso e due direzioni: chi
 * leggeva doveva imparare due linguaggi. Ora la forma e' una sola, e si ripete.
 *
 * **Si mostra solo cio' che supera l'errore delle medie.** Gli altri confronti non sono
 * nascosti per fare spazio: per nostra stessa regola non si distinguono dal caso, e
 * mostrarli direbbe che c'e' una differenza dove non si vede. Quanti restano fuori si dice.
 *
 * **Il centro dell'asse e' la media delle squadre di quel lato**, i due punti sono le due
 * squadre. Quando cadono dalla stessa parte del centro il tratto si vede prima di leggerlo.
 * Verde e mattone dicono da che parte, cioe' un verso: non sono decorazione. Le cifre
 * esatte stanno scritte sopra l'asse, quindi niente vive solo nel colore.
 */
function Prova({ t, faseDelTitolo }: {
  readonly t: Tratto;
  /** La fase gia' scritta nel titolo: quando coincide, la riga non la ripete. */
  readonly faseDelTitolo: string | null;
}) {
  const verso = t.verso === 1 ? " is-sopra" : " is-sotto";
  const fase = t.fase === faseDelTitolo ? null : t.fase;
  return (
    <div className="affronto-prova">
      <p className="affronto-prova-testa">
        <span className="affronto-parola">{t.parola}</span>
        <span className="affronto-prova-fonte">
          {t.nome} · {t.lettura}
          {fase === null ? null : <> · quando attacca {fase}</>}
          {" · "}{t.campione} gare
        </span>
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
      <p className="affronto-asse-piede">
        media di lega {t.metro}{t.metroSecondo === null ? null : ` e ${t.metroSecondo}`}
      </p>
    </div>
  );
}

export function ComeSiAffrontano({ cappello }: { readonly cappello: Cappello | null }) {
  if (cappello === null) return null;
  return (
    <section className="dossier-panel" aria-labelledby="affronto-title">
      <p className="dossier-kick">Come si affrontano</p>
      <h2 id="affronto-title" className="sr-only-heading">
        Quello che una squadra fa dal suo lato contro quello che fanno gli avversari dell&apos;altra
      </h2>
      <p className="affronto-titolo">
        {cappello.titolo}
        {cappello.fase === null ? null : <span> {cappello.fase}</span>}
      </p>
      {cappello.tratti.map((t) => (
        <Prova key={t.chiave} t={t} faseDelTitolo={cappello.fase === null ? null : cappello.fase.replace("quando attacca ", "")} />
      ))}
      {cappello.mute === null ? null : <p className="affronto-mute">{cappello.mute}</p>}
      <p className="affronto-nota">{cappello.nota}</p>
    </section>
  );
}
