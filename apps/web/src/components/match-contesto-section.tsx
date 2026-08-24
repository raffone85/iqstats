import type { FamigliaResa, VoceDiContesto } from "@/server/iqstats/projection/contesto";

/**
 * Il contesto: perché quei numeri, e non altri.
 *
 * Un atteso di 17 tiri non dice se nasca da una squadra che arriva in area o da una che
 * tira da fuori. Queste sono le stesse colonne che i modelli usano come feature, mostrate
 * accanto a chi le subisce: un tiro nasce dall'incontro fra chi lo tira e chi lo lascia
 * tirare, quindi ogni riga accosta la produzione di una squadra a quanto l'altra concede.
 *
 * Sta dentro un `details` chiuso: sono quindici metriche, e su un telefono una tabella da
 * quindici righe aperta di default spinge fuori schermo tutto il resto.
 */
function cifra(valore: number | null, percentuale: boolean): string {
  if (valore === null) return "n/d";
  const testo = percentuale ? valore.toFixed(0) : valore.toFixed(1).replace(".", ",");
  return percentuale ? `${testo}%` : testo;
}

/** Lo scostamento dal metro, quando entrambi ci sono: e' la parte che si legge davvero. */
function controIlMetro(valore: number | null, metro: number | null): string {
  if (valore === null || metro === null || metro <= 0) return "";
  const quota = Math.round(((valore - metro) / metro) * 100);
  if (quota === 0) return " · in linea";
  return ` · ${quota > 0 ? "+" : ""}${quota}%`;
}

function Voce({ voce, homeTeam, awayTeam }: {
  readonly voce: VoceDiContesto;
  readonly homeTeam: string;
  readonly awayTeam: string;
}) {
  return (
    <li className="engine-split">
      <span className="engine-who">
        {voce.nome}
        <span className="engine-obs">su {voce.campione} gare per lato</span>
      </span>
      <span className="engine-exp">
        {cifra(voce.casaProduce, voce.percentuale)}
        <span className="engine-obs">
          {homeTeam} produce{controIlMetro(voce.casaProduce, voce.metroCasa)}
        </span>
        <span className="engine-obs">
          {awayTeam} concede {cifra(voce.trasfertaConcede, voce.percentuale)}
        </span>
        <span className="engine-obs">
          {awayTeam} produce {cifra(voce.trasfertaProduce, voce.percentuale)}
          {controIlMetro(voce.trasfertaProduce, voce.metroTrasferta)}
        </span>
        <span className="engine-obs">
          {homeTeam} concede {cifra(voce.casaConcede, voce.percentuale)}
        </span>
      </span>
    </li>
  );
}

type Props = {
  readonly contesto: readonly FamigliaResa[];
  readonly homeTeam: string;
  readonly awayTeam: string;
};

export function MatchContestoSection({ contesto, homeTeam, awayTeam }: Props) {
  if (contesto.length === 0) return null;

  const metriche = contesto.reduce((somma, f) => somma + f.voci.length, 0);

  return (
    <section className="dossier-panel" aria-labelledby="contesto-title">
      <p className="dossier-kick">Il contesto</p>
      <h2 id="contesto-title" className="squad-section-title">
        Perch&eacute; quei numeri, e non altri
      </h2>
      <p className="dossier-src">
        Un atteso di diciassette tiri non dice se nasca da una squadra che arriva in area o
        da una che tira da fuori. Queste sono le <b>stesse colonne che i modelli usano</b> per
        proiettare, finora invisibili in pagina. Ogni riga accosta quanto una squadra produce
        a quanto l&apos;altra concede, ciascuna dal proprio lato del campo: un tiro nasce
        dall&apos;incontro fra chi lo tira e chi lo lascia tirare.
      </p>

      <details className="giornata">
        <summary className="giornata-head">
          Apri le {metriche} metriche <i>{contesto.length} famiglie</i>
        </summary>
        <ul className="engine-rows">
          {contesto.map((famiglia) => (
            <li className="engine-row" key={famiglia.nome}>
              <p className="engine-metric">{famiglia.nome}</p>
              <ul className="engine-splits">
                {famiglia.voci.map((voce) => (
                  <Voce
                    key={voce.nome}
                    voce={voce}
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>

      <p className="dossier-src">
        <b>La finestra &egrave; di 365 giorni</b>, la stessa scelta per le statistiche
        descrittive, e non la stagione: nei cinque campionati principali la stagione in corso
        ha una o due gare a squadra, e un contesto costruito l&igrave; sarebbe una serata, non
        un modo di giocare. Le percentuali accanto ai numeri dicono la distanza dalla media
        della competizione <b>sullo stesso lato del campo</b>. Dove una metrica manca la riga
        non compare: le colonne di contesto sono piene all&apos;87% su 21.292 righe, e
        un&apos;assenza non diventa uno zero.
      </p>
    </section>
  );
}
