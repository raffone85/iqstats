// Che cosa fa questa squadra in una gara, sugli ultimi 365 giorni.
//
// **Non ripete «Casa contro trasferta».** Quella tabella viene dal provider, guarda la sola
// stagione corrente e divide i due lati del campo. Qui si dice un'altra cosa: la media su
// una finestra abbastanza lunga da reggere, con il campione di ogni singolo bersaglio.
// Nella stagione corrente le squadre hanno 7,1 gare di media e l'errore della media sui
// tiri vale 1,84, cioe' l'85% della differenza vera fra squadre; su 365 giorni le gare
// diventano 30,9 e l'errore scende a 0,87.
//
// **Nessun verso dichiarato.** Qui non c'e' un riferimento rispetto a cui stare sopra o
// sotto — quello e' il metro di lega, che sta nella sezione accanto — quindi niente verde e
// niente mattone: restano inchiostro, come vuole il master. Nessun CSS nuovo: la casella
// `.squad-stat` e il gruppo richiudibile `.squad-group` esistono gia'.
import type { ProfiloSquadra, VoceStatistica } from "@/server/iqstats/team-stats";

function valore(voce: VoceStatistica): string {
  const cifre = voce.percentuale ? 1 : voce.media < 10 ? 2 : 1;
  return voce.media.toFixed(cifre).replace(".", ",") + (voce.percentuale ? "%" : "");
}

function Caselle({ voci }: { readonly voci: readonly VoceStatistica[] }) {
  return (
    <div className="squad-player-stats">
      {voci.map((v) => (
        <div className="squad-stat" key={v.chiave}>
          <em>{v.nome}</em>
          <b>{valore(v)}</b>
          <em>su {v.campione} {v.campione === 1 ? "gara" : "gare"}</em>
        </div>
      ))}
    </div>
  );
}

type Props = Readonly<{
  profilo: ProfiloSquadra;
}>;

export function TeamStatsSection({ profilo }: Props) {
  const principali = profilo.voci.filter((v) => v.gruppo === "principale");
  const dettagli = profilo.voci.filter((v) => v.gruppo === "dettaglio");
  const giorno = (quando: string) => new Date(quando).toLocaleDateString("it-IT", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <section className="dossier-panel" aria-labelledby="stat-squadra-title">
      <p className="dossier-kick">Che cosa fa in una gara</p>
      <h2 id="stat-squadra-title" className="sr-only-heading">
        Medie per gara di {profilo.nome} negli ultimi 365 giorni
      </h2>

      <Caselle voci={principali} />

      {dettagli.length > 0 ? (
        <details className="squad-group">
          <summary>
            Il resto della partita
            <span>{dettagli.length} bersagli</span>
          </summary>
          <div className="squad-metric-list">
            <Caselle voci={dettagli} />
          </div>
        </details>
      ) : null}

      <p className="dossier-src">
        Medie per gara delle <b>{profilo.gare} gare</b> giocate dal {giorno(profilo.dal)} al{" "}
        {giorno(profilo.al)}, in ogni competizione. La finestra è di 365 giorni e scavalca il
        confine di stagione: dentro la sola stagione corrente le squadre hanno 7,1 gare di
        media, e su quel campione l&apos;errore della media sui tiri vale 1,84 — l&apos;85%
        della differenza vera fra due squadre, cioè quasi tutto quello che si vorrebbe
        misurare. Su 365 giorni le gare diventano 30,9 e l&apos;errore scende a 0,87.
      </p>

      <p className="dossier-src">
        Il <b>campione è dichiarato per ogni bersaglio</b>, non una volta sola: delle{" "}
        {profilo.gare} gare non tutte portano ogni statistica, e una media su poche gare non
        va letta come una su molte.
        {profilo.assenti.length > 0 ? (
          <>
            {" "}
            Non osservati abbastanza per dirne qualcosa: {profilo.assenti.join(", ")}. Sono
            dichiarati assenti, non contati come zero.
          </>
        ) : null}
      </p>
    </section>
  );
}
