// Dove sta questa squadra rispetto alle altre del suo campionato.
//
// **Non ripete le medie di «Casa contro trasferta».** Quella tabella viene dal provider e
// guarda una squadra sola; qui si dice l'unica cosa che quella non puo' dire — la posizione
// nella distribuzione — e la media compare solo come ancoraggio di quella posizione.
//
// **Niente verde e niente mattone.** Il master li riserva a un verso rispetto a un
// riferimento, e qui sarebbero letti come un giudizio: verde su «piu' falli» direbbe
// «bravo». La posizione la dicono le parole; la barra e' quella bordeaux del dossier, che
// non dichiara nessun verso. Nessun CSS nuovo: la riga etichetta-barra-valore esiste gia'.
import type { MetroDiLega, VoceDelMetro } from "@/server/iqstats/team-metro";

function valore(numero: number): string {
  return numero.toFixed(1).replace(".", ",");
}

/**
 * Quante squadre ne supera, in numero e non in percentuale.
 *
 * `percent_rank()` vale `(posizione - 1) / (squadre - 1)`, quindi la quota moltiplicata per
 * le altre squadre da' quante ne stanno sotto. Un numero intero su un totale dichiarato si
 * verifica guardando la classifica; una percentuale no.
 */
function superate(voce: VoceDelMetro, squadre: number): number {
  return Math.round(voce.quota * (squadre - 1));
}

function Riga({ voce, squadre }: { readonly voce: VoceDelMetro; readonly squadre: number }) {
  const altre = squadre - 1;
  const sotto = superate(voce, squadre);
  return (
    <div className="dossier-1x2-row">
      <span className="dossier-1x2-label">
        {voce.nome}
        <em className="engine-obs">
          ne supera {sotto} su {altre} · {valore(voce.mediaDiLega)} di lega · su{" "}
          {voce.campione} {voce.campione === 1 ? "gara" : "gare"}
        </em>
      </span>
      <span className="dossier-bar" aria-hidden="true">
        <i style={{ width: String(Math.round(voce.quota * 100)) + "%" }} />
      </span>
      <span className="dossier-1x2-val">{valore(voce.media)}</span>
    </div>
  );
}

type Props = Readonly<{
  metro: MetroDiLega;
  teamName: string;
}>;

export function TeamMetroSection({ metro, teamName }: Props) {
  return (
    <section className="dossier-panel" aria-labelledby="metro-title">
      <p className="dossier-kick">Dove sta nel campionato</p>
      <h2 id="metro-title" className="sr-only-heading">
        Posizione di {teamName} fra le squadre della sua competizione
      </h2>

      <div className="dossier-1x2">
        {metro.voci.map((voce) => (
          <Riga key={voce.nome} voce={voce} squadre={metro.squadre} />
        ))}
      </div>

      <p className="dossier-src">
        Il numero a destra è la media di {teamName}; accanto al nome, quante delle altre{" "}
        {metro.squadre - 1} squadre della {metro.competizione} ne supera, la media della
        competizione e <b>su quante gare</b> quella media poggia. Il campione è dichiarato
        per ogni bersaglio e non una volta sola: delle {metro.gare} gare osservate non
        tutte portano ogni statistica, e una media su poche gare non va letta come una su
        molte. Il metro è la distribuzione vera del campionato, non una scala fissa: cambia
        con il campionato invece di pretendere di valere ovunque.
      </p>

      {metro.assenti.length > 0 ? (
        <p className="dossier-src">
          Non osservati in questa competizione: {metro.assenti.join(", ")}. Sono dichiarati
          assenti, non contati come zero.
        </p>
      ) : null}

      <p className="dossier-src">
        Entrano nel metro solo le squadre con almeno cinque gare osservate: sotto quel
        campione una tendenza non c&apos;è, e una squadra con due gare falserebbe la
        posizione anche alle altre. Medie calcolate sulle gare che abbiamo osservato, non su
        quelle dichiarate da altri.
      </p>
    </section>
  );
}
