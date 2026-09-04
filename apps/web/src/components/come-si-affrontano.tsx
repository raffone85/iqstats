import type { Cappello, Tratto } from "@/server/iqstats/affronto";
import type { RitmoDeiTempi } from "@/server/iqstats/ritmo-tempi";

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
        {/* Dove lo scostamento non supera l'errore non c'e' una parola da dire: la riga
            porta il nome della metrica e basta. Scriverli tutt'e due dava «passaggi
            Passaggi · Palla». */}
        <span className="affronto-parola">{t.verso === 0 ? t.nome : t.parola}</span>
        <span className="affronto-prova-fonte">
          {t.verso === 0 ? null : <>{t.nome} · </>}
          {t.lettura}
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

/** La quota scritta come si legge: 45% e non 0,4520. */
function quota(parte: number): string {
  return `${Math.round(parte * 100)}%`;
}

/** Due decimali per i gol attesi, uno per i conteggi: non si scrive 11,00 tiri. */
function cifra(valore: number, chiave: string): string {
  return valore.toFixed(chiave === "xg" ? 2 : 1).replace(".", ",");
}

/**
 * **Il ritmo fra i due tempi**, dentro lo stesso capitolo e nella stessa forma delle
 * altre prove: la domanda e' sempre come si affrontano, guardata nel tempo invece
 * che metrica per metrica.
 *
 * **La barra e' la quota, non un merito.** Riempie quanto pesa il primo tempo, e il
 * resto e' la ripresa: e' un taglio, non una classifica, quindi non c'e' un verso
 * buono. Le due cifre stanno scritte sopra, quindi niente vive solo nel colore.
 */
function Tempi({ ritmo }: { readonly ritmo: RitmoDeiTempi }) {
  return (
    <>
      <p className="affronto-titolo">{ritmo.titolo}</p>
      {ritmo.voci.map((v) => (
        <div className="affronto-prova" key={v.chiave}>
          <p className="affronto-prova-testa">
            <span className="affronto-parola">{v.nome}</span>
            <span className="affronto-prova-fonte">
              {quota(v.quotaPrimo)} nel 1° tempo · {quota(1 - v.quotaPrimo)} nel 2°
              {v.metro === null ? null : <> · media della lega {quota(v.metro)}</>}
              {v.oltreIlRumore ? null : <> · dentro l&apos;errore</>}
              {" · "}{v.gare} gare
            </span>
          </p>
          <p className="affronto-cifre">
            <span>1° tempo <b>{cifra(v.primo, v.chiave)}</b></span>
            <span>2° tempo <b>{cifra(v.secondo, v.chiave)}</b></span>
          </p>
          <div className="dossier-bar" aria-hidden="true">
            <i style={{ width: quota(v.quotaPrimo) }} />
          </div>
        </div>
      ))}
      <p className="affronto-nota">
        Quote misurate gara per gara sulle partite già giocate di queste due squadre, dalle
        statistiche archiviate della fonte: sono gare avvenute, non una previsione, e non
        entrano in nessun mercato. Il metro è la media della competizione nello stesso
        periodo, non la metà: in quasi tutte queste metriche si produce di più nella
        ripresa, e misurare dal 50% chiamerebbe tendenza della squadra una proprietà del
        gioco. Dove lo scarto da quella media non supera l&apos;errore la riga lo dichiara.
        {ritmo.escluse.length === 0 ? null : (
          <> Fuori per campione insufficiente: {ritmo.escluse.join(", ")}.</>
        )}{" "}
        Il possesso non compare: per tempo è la percentuale fra le due squadre di quel
        tempo, non una quantità che si divide fra primo e secondo.
      </p>
    </>
  );
}

export function ComeSiAffrontano({ cappello, ritmoTempi = null }: {
  readonly cappello: Cappello | null;
  readonly ritmoTempi?: RitmoDeiTempi | null;
}) {
  // **I due contenuti si reggono da soli.** Il confronto per metrica vuole il campione
  // della stagione in corso; il ritmo per tempo guarda indietro e c'e' anche prima. Il
  // pannello compare se ne ha almeno uno, e non promette l'altro.
  if (cappello === null && ritmoTempi === null) return null;
  return (
    <section className="dossier-panel" aria-labelledby="affronto-title">
      <p className="dossier-kick">Come si affrontano</p>
      <h2 id="affronto-title" className="sr-only-heading">
        Quello che una squadra fa dal suo lato contro quello che fanno gli avversari dell&apos;altra
      </h2>
      {cappello === null ? null : (
        <>
          <p className="affronto-titolo">
            {cappello.titolo}
            {cappello.fase === null ? null : <span> {cappello.fase}</span>}
          </p>
          {cappello.tratti.map((t) => (
            <Prova key={t.chiave} t={t} faseDelTitolo={cappello.fase === null ? null : cappello.fase.replace("quando attacca ", "")} />
          ))}
          {cappello.mute === null ? null : <p className="affronto-mute">{cappello.mute}</p>}
          {/* **La tabella completa, nella stessa forma.** Era la sezione «Il contesto»: faceva
              lo stesso confronto con un'altra finestra, e per lo stesso fatto scriveva 18,4
              dove qui c'era 18,9. Ora la finestra e' una sola e i numeri sono questi. */}
          {cappello.tutte.length === 0 ? null : (
            <details className="affronto-tutte">
              <summary>
                Tutte le metriche, dai due lati ({cappello.tutte.length} confronti)
              </summary>
              {cappello.tutte.map((t) => (
                <Prova key={t.chiave} t={t} faseDelTitolo={null} />
              ))}
            </details>
          )}
          <p className="affronto-nota">{cappello.nota}</p>
        </>
      )}
      {ritmoTempi === null ? null : <Tempi ritmo={ritmoTempi} />}
    </section>
  );
}
