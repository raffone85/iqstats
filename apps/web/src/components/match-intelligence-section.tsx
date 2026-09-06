import type { Convergenza, MatchIntelligence, Segnale } from "@/server/iqstats/match-intelligence";

/**
 * La sintesi della gara: il segnale che regge di piu', il secondo, i conflitti dichiarati
 * e il candidato di valore tenuto separato.
 *
 * **Quattro cose diverse in quattro posti diversi.** Il segnale dice quanto e' probabile e
 * quante letture indipendenti lo sostengono; il valore dice di quanto ci stacchiamo dal
 * prezzo del mercato. Non si sommano e non si mescolano: un segnale forte su un esito che
 * il mercato prezza uguale non e' un'occasione, e un margine su una lettura fiacca non e'
 * un segnale.
 *
 * **Il conflitto si mostra, non si nasconde.** Quando due letture dicono il contrario, la
 * pagina lo scrive: sceglierne una e tacere l'altra sarebbe la cosa piu' facile e la meno
 * onesta.
 */
const ETICHETTA: Record<Convergenza, string> = {
  forte: "forte convergenza",
  convergenza: "convergenza",
  neutrale: "una sola lettura",
  conflitto: "letture discordi",
};

function Blocco({ segnale, rango }: { readonly segnale: Segnale; readonly rango: string }) {
  const pro = segnale.fonti.filter((f) => f.favorevole).length;
  const contro = segnale.fonti.filter((f) => f.contraria).length;
  // In un conflitto contare solo le letture d'accordo racconta meta' della cosa: si dicono
  // tutte e due le parti. E una lettura sola non sono «1 letture».
  const conteggio =
    contro > 0
      ? `${pro} ${pro === 1 ? "lettura" : "letture"} a favore, ${contro} ${contro === 1 ? "contraria" : "contrarie"}`
      : pro > 0
        ? `${pro} ${pro === 1 ? "lettura d’accordo" : "letture d’accordo"}`
        : "";
  return (
    <li className={`intel-blocco intel-${segnale.convergenza}`}>
      <p className="intel-rango">{rango}</p>
      <div className="intel-testa">
        <b className="intel-titolo">{segnale.titolo}</b>
        <span className="intel-prob">{Math.round(segnale.probabilita)}%</span>
      </div>
      <p className="intel-conv">
        {ETICHETTA[segnale.convergenza]}
        {conteggio === "" ? "" : `, ${conteggio}`}
      </p>
      <ul className="intel-fonti">
        {segnale.fonti.map((f) => (
          <li key={f.nome} className={f.contraria ? "intel-contro" : f.favorevole ? "intel-pro" : undefined}>
            {f.nome} <b>{Math.round(f.valore * 100)}%</b>
          </li>
        ))}
      </ul>
      <p className="intel-perche">
        {segnale.perche}{" "}
        {segnale.affidabilita === null
          ? "Su questa lettura l’affidabilità non è misurata."
          : `Affidabilità misurata ${Math.round(segnale.affidabilita)}.`}
        {segnale.campione === null ? "" : ` Campione: ${segnale.campione} gare.`}
      </p>
    </li>
  );
}

export function MatchIntelligenceSection({ dossier }: { readonly dossier: MatchIntelligence }) {
  if (dossier.principale === null && dossier.conflitti.length === 0) return null;
  const valore = dossier.candidatoDiValore;

  return (
    <section className="dossier-panel intel-panel" aria-labelledby="intel-title">
      <p className="dossier-kick">Che cosa dice la gara</p>
      <h2 id="intel-title" className="squad-section-title">Le letture che reggono di più</h2>
      <ul className="intel-blocchi">
        {dossier.principale ? <Blocco segnale={dossier.principale} rango="Segnale principale" /> : null}
        {dossier.secondo ? <Blocco segnale={dossier.secondo} rango="Secondo segnale" /> : null}
        {dossier.conflitti.slice(0, 1).map((s) => (
          <Blocco key={s.titolo} segnale={s} rango="Letture discordi" />
        ))}
      </ul>
      {valore !== null && valore.edge !== null ? (
        <p className="intel-valore">
          <b>Candidato di valore, separato dal segnale:</b> {valore.label}, dove diamo{" "}
          {Math.round(valore.probability)}% contro il {Math.round(valore.marketProbability ?? 0)}%
          che prezza il mercato.{" "}
          {valore.solida
            ? "Il margine è positivo e l’affidabilità supera la soglia misurata."
            : "L’affidabilità non basta a dichiararlo solido."}
        </p>
      ) : null}
      <p className="dossier-src">
        Un segnale è forte quando almeno tre letture indipendenti dicono la stessa cosa e
        nessuna dice il contrario. Le letture tiepide, quelle attorno alla parità, non
        contano da nessuna delle due parti. Niente qui è un consiglio di gioco: sono
        frequenze misurate e probabilità del modello, con accanto quanto reggono.
      </p>
    </section>
  );
}
