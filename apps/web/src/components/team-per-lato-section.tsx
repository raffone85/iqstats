import type { LatoDelBersaglio, ProfiloPerLato } from "@/server/iqstats/team-stats";

/**
 * Che cosa fa e che cosa subisce, in casa e in trasferta separatamente.
 *
 * **«La Roma subisce 11,8 tiri» non e' un fatto della Roma.** E' la media di due
 * popolazioni diverse, e in trasferta il numero e' un altro. La sezione «Che cosa fa in una
 * gara» da' i totali e solo il prodotto: qui i due lati stanno separati, e accanto a ogni
 * numero prodotto c'e' quello subito.
 *
 * **Il subito e' meta' del comportamento di una squadra.** Senza, si sa che cosa fa e non
 * che cosa lascia fare, e una gara la decidono tutte e due le cose.
 *
 * I dettagli stanno dietro un `details` chiuso: sono venti bersagli, e su un telefono una
 * tabella da venti righe aperta spinge fuori schermo tutto il resto.
 */
const GIORNO: Intl.DateTimeFormatOptions = {
  day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome",
};

function giorno(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "data non disponibile"
    : data.toLocaleDateString("it-IT", GIORNO);
}

function cifra(valore: number | null, percentuale: boolean): string {
  if (valore === null) return "n/d";
  return percentuale
    ? `${valore.toFixed(0)}%`
    : valore.toFixed(1).replace(".", ",");
}

function Lato({ dove, lato, percentuale }: {
  readonly dove: string;
  readonly lato: LatoDelBersaglio | null;
  readonly percentuale: boolean;
}) {
  if (lato === null) {
    return (
      <li className="engine-split">
        <span className="engine-who">{dove}</span>
        <span className="engine-exp">
          n/d
          <span className="engine-obs">sotto le cinque gare, non si dichiara</span>
        </span>
      </li>
    );
  }
  return (
    <li className="engine-split">
      <span className="engine-who">
        {dove}
        <span className="engine-obs">su {lato.gare} gare</span>
      </span>
      <span className="engine-exp">
        {cifra(lato.prodotto, percentuale)}
        <span className="engine-obs">prodotti</span>
        <span className="engine-obs">
          <b>{cifra(lato.subito, percentuale)}</b> subiti
        </span>
      </span>
    </li>
  );
}

function Bersaglio({ voce }: { readonly voce: ProfiloPerLato["voci"][number] }) {
  return (
    <li className="engine-row">
      <p className="engine-metric">{voce.nome}</p>
      <ul className="engine-splits">
        <Lato dove="In casa" lato={voce.casa} percentuale={voce.percentuale} />
        <Lato dove="In trasferta" lato={voce.trasferta} percentuale={voce.percentuale} />
      </ul>
    </li>
  );
}

type Props = {
  readonly profilo: ProfiloPerLato;
};

export function TeamPerLatoSection({ profilo }: Props) {
  const principali = profilo.voci.filter((v) => v.gruppo === "principale");
  const dettagli = profilo.voci.filter((v) => v.gruppo === "dettaglio");
  if (principali.length === 0 && dettagli.length === 0) return null;

  return (
    <section className="dossier-panel" aria-labelledby="per-lato-title">
      <p className="dossier-kick">In casa e in trasferta</p>
      <h2 id="per-lato-title" className="squad-section-title">
        Che cosa fa, e che cosa subisce, dai due lati del campo
      </h2>
      <p className="dossier-src">
        <b>Un numero solo sui due lati &egrave; la media di due squadre diverse.</b> La stessa
        squadra concede in trasferta quello che non concede in casa, e il vantaggio del campo
        non &egrave; un coefficiente da aggiungere dopo. Accanto a ogni valore prodotto c&apos;
        &egrave; quello <b>subito</b>: senza, si sa che cosa fa e non che cosa lascia fare, e
        una gara la decidono tutte e due le cose.
      </p>

      {principali.length === 0 ? null : (
        <ul className="engine-rows">
          {principali.map((v) => <Bersaglio key={v.chiave} voce={v} />)}
        </ul>
      )}

      {dettagli.length === 0 ? null : (
        <details className="giornata">
          <summary className="giornata-head">
            Apri gli altri {dettagli.length} bersagli
          </summary>
          <ul className="engine-rows">
            {dettagli.map((v) => <Bersaglio key={v.chiave} voce={v} />)}
          </ul>
        </details>
      )}

      <p className="dossier-src">
        {profilo.gareCasa} gare in casa e {profilo.gareTrasferta} in trasferta, dal{" "}
        {giorno(profilo.dal)} al {giorno(profilo.al)}. Il subito &egrave; la riga gemella
        della stessa gara, non una colonna a parte: quello che una squadra concede &egrave;
        quello che l&apos;altra ha prodotto. Il campione scritto accanto a ogni lato &egrave;
        quello che porta <b>quel</b> dato, non le gare giocate: le colonne non si riempiono
        tutte insieme, e sotto cinque gare non si dichiara niente.
      </p>
    </section>
  );
}
