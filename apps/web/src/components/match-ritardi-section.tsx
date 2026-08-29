import type { Ritardo } from "@/server/iqstats/projection/ritardi";

/**
 * Da quante gare non succede, accanto a quanto spesso succede.
 *
 * Il ritardo da solo non e' una lettura. «Non tiene la porta inviolata da 9 gare» sembra
 * molto finche' non si sa che le riesce una volta su dieci, e allora nove e' normale.
 * Per questo ogni riga porta due numeri e non uno.
 */
function quota(valore: number): string {
  return `${Math.round(valore)}%`;
}

function Squadra({ nome, ritardi, dove }: {
  readonly nome: string;
  readonly ritardi: readonly Ritardo[];
  readonly dove: string;
}) {
  if (ritardi.length === 0) return null;
  return (
    <li className="engine-row">
      <p className="engine-metric">{nome}, {dove}</p>
      <ul className="engine-splits">
        {ritardi.map((r) => (
          <li className="engine-split" key={r.evento}>
            <span className="engine-who">
              {r.evento}
              <span className="engine-obs">
                le riesce {quota(r.quota)} delle volte, su {r.campione} gare
              </span>
            </span>
            <span className="engine-exp">
              {r.gare}
              <span className="engine-obs">
                {r.gare === 0 ? "successo nell'ultima" : r.gare === 1 ? "gara fa" : "gare fa"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

type Props = {
  readonly casa: readonly Ritardo[];
  readonly trasferta: readonly Ritardo[];
  readonly homeTeam: string;
  readonly awayTeam: string;
};

export function MatchRitardiSection({ casa, trasferta, homeTeam, awayTeam }: Props) {
  if (casa.length === 0 && trasferta.length === 0) return null;

  return (
    <section className="dossier-panel" aria-labelledby="ritardi-title">
      <p className="dossier-kick">Da quanto non succede</p>
      <h2 id="ritardi-title" className="sr-only-heading">
        Quante gare sono passate dall&apos;ultima volta, e quanto spesso succede
      </h2>

      <ul className="engine-rows">
        <Squadra nome={homeTeam} ritardi={casa} dove="in casa" />
        <Squadra nome={awayTeam} ritardi={trasferta} dove="in trasferta" />
      </ul>

      <p className="dossier-src">
        <b>Un ritardo lungo non rende l&apos;evento più probabile.</b> Ogni gara è una prova
        nuova e le precedenti non le devono niente: se una squadra tiene la porta inviolata
        una volta su dieci, dopo nove gare senza continua a tenerla una volta su dieci. È la
        lettura sbagliata più comune di questo numero, e lasciarla implicita significherebbe
        suggerirla.
      </p>
      {/* Il monito resta in pagina: e' la lettura sbagliata piu' comune di questo numero, e
          nasconderla dietro un comando significherebbe suggerirla. La spiegazione di come
          si legge la riga, invece, si apre. */}
      <details className="dossier-spiega">
        <summary>Come si legge questa sezione</summary>
        <p className="dossier-src">
          Ogni riga porta <b>due numeri</b>: da quante gare non succede, e quante volte su
          cento succede davvero. Nove gare senza valgono molto o poco a seconda del secondo
          numero, e il primo da solo non lo dice. Un evento che non abbiamo mai visto non
          compare: «non succede da trenta gare su trenta» non è un ritardo, è una cosa che
          quella squadra, da quel lato del campo, non ha ancora fatto. Si guarda un lato
          solo, perché casa e trasferta sono due popolazioni diverse.
        </p>
      </details>
    </section>
  );
}
