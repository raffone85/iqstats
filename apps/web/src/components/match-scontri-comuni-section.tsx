// Le due squadre misurate contro gli stessi avversari, dentro il capitolo Precedenti.
//
// **Perche' sta qui e non apre un capitolo suo.** La domanda e' la stessa del testa a testa
// — com'e' andata prima — allargata dalle gare fra loro due a quelle contro gli stessi terzi.
// Un'area nuova nascerebbe solo da una domanda che nessuna delle nove pone gia'.
//
// **Nessuna parola di merito.** Su gol subiti, falli e cartellini «di piu'» non vuol dire
// «meglio»: la riga dichiara lo scarto e se supera l'errore, e i due numeri stanno scritti.
// Nessun CSS nuovo: sono le classi del confronto che gia' esiste.
import type { ScontriComuni } from "@/server/iqstats/scontri-comuni";

/** Due decimali per i gol, uno per i conteggi: non si scrive 16,80 tiri. */
function cifra(valore: number, chiave: string): string {
  return valore.toFixed(chiave.startsWith("gol_") ? 2 : 1).replace(".", ",");
}

/** Una riga del confronto: i due numeri, lo scarto e il campione. */
function Riga({ v, homeTeam, awayTeam }: Readonly<{
  v: ScontriComuni["voci"][number];
  homeTeam: string;
  awayTeam: string;
}>) {
  return (
    <div className="affronto-prova">
      <p className="affronto-prova-testa">
        <span className="affronto-parola">{v.nome}</span>
        <span className="affronto-prova-fonte">
          {v.diverse
            ? `scarto ${cifra(Math.abs(v.casa.media - v.fuori.media), v.chiave)}, oltre l'errore`
            : "dentro l'errore"}
          {" · "}{v.casa.campione} e {v.fuori.campione} gare
        </span>
      </p>
      <p className="affronto-cifre">
        <span>{homeTeam} <b>{cifra(v.casa.media, v.chiave)}</b></span>
        <span>{awayTeam} <b>{cifra(v.fuori.media, v.chiave)}</b></span>
      </p>
    </div>
  );
}

export function MatchScontriComuniSection({ dati, homeTeam, awayTeam }: Readonly<{
  dati: ScontriComuni | null;
  homeTeam: string;
  awayTeam: string;
}>) {
  if (dati === null) return null;

  // **Aperto sta quello che si scosta, chiuso quello che non si scosta.** Misurato su questa
  // gara: nove metriche, due oltre l'errore. Le sette che restano costavano 700 px a 375 per
  // ripetere sette volte «dentro l'errore»; la porta ne costa 44 e i numeri restano leggibili
  // a un tocco. La sintesi delle chiuse e' scritta nel comando, non nascosta.
  const scostate = dati.voci.filter((v) => v.diverse);
  const uguali = dati.voci.filter((v) => !v.diverse);

  return (
    <section className="dossier-panel" aria-labelledby="comuni-title">
      <p className="dossier-kick">Scontri comuni</p>
      <h2 id="comuni-title" className="sr-only-heading">
        {homeTeam} e {awayTeam} contro gli stessi avversari
      </h2>
      <p className="affronto-titolo">
        Contro i {dati.avversari} avversari che hanno affrontato entrambe
        <span> · {dati.gareCasa} gare {homeTeam}, {dati.gareFuori} {awayTeam}</span>
      </p>
      {scostate.length === 0 ? (
        <p className="affronto-mute">
          Su nessuna delle {dati.voci.length} metriche lo scarto supera l&apos;errore: contro
          gli stessi avversari queste due squadre hanno fatto la stessa cosa.
        </p>
      ) : (
        scostate.map((v) => <Riga key={v.chiave} v={v} homeTeam={homeTeam} awayTeam={awayTeam} />)
      )}
      {uguali.length === 0 ? null : (
        <details className="dossier-spiega">
          <summary>
            {uguali.length === 1
              ? `Dentro l'errore: ${uguali[0]?.nome.toLowerCase()}`
              : `Dentro l'errore: ${uguali.map((v) => v.nome.toLowerCase()).join(", ")}`}
          </summary>
          {uguali.map((v) => <Riga key={v.chiave} v={v} homeTeam={homeTeam} awayTeam={awayTeam} />)}
        </details>
      )}
      <p className="affronto-nota">
        Solo le gare contro le squadre che <b>entrambe</b> hanno affrontato in questa
        competizione, su tutte le stagioni archiviate: nella sola stagione in corso gli
        avversari comuni sono tre di mediana, e a settembre non basterebbero. Tenere fermo
        l&apos;avversario toglie dal confronto la parte di differenza che è calendario. Il
        campo non è tenuto fermo — quelle gare sono in casa e fuori in proporzioni diverse —
        e per quello c&apos;è il confronto per lato, qui sopra. Dove lo scarto non supera
        l&apos;errore delle due medie la riga lo dichiara invece di nominare un vincitore.
        {dati.assenti.length === 0 ? null : (
          <> Fuori per campione insufficiente: {dati.assenti.join(", ")}.</>
        )}
      </p>
    </section>
  );
}
