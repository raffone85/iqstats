import type { Contesa } from "@/server/iqstats/lati";

/**
 * Chi vince il confronto, gara per gara.
 *
 * **Non e' la media, ed e' il punto.** Due squadre con la stessa media di corner possono
 * arrivarci in modi opposti: una che ne fa sempre uno o due piu' dell'avversario, l'altra che
 * alterna gare da otto e gare da zero. La media le confonde, il conto delle gare no.
 *
 * **Ogni percentuale porta il suo conto per esteso**, perche' «il 60%» su cinque gare e su
 * venti non sono la stessa cosa, e la percentuale da sola non lo dice.
 */
function quota(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function Riga({
  contesa,
  nomeCasa,
  nomeFuori,
}: Readonly<{ contesa: Contesa; nomeCasa: string; nomeFuori: string }>) {
  const { casa, fuori } = contesa;
  return (
    <li className="contesa">
      <p className="contesa-nome">{contesa.nome}</p>
      <div className="contesa-lati">
        <span className={casa.quota >= fuori.quota ? "contesa-lato is-avanti" : "contesa-lato"}>
          <b>{quota(casa.quota)}</b>
          <span>
            {nomeCasa} in casa · {casa.piu} gare su {casa.gare}
            {casa.pari > 0 ? `, ${casa.pari} pari` : ""}
          </span>
        </span>
        <span className={fuori.quota > casa.quota ? "contesa-lato is-avanti" : "contesa-lato"}>
          <b>{quota(fuori.quota)}</b>
          <span>
            {nomeFuori} in trasferta · {fuori.piu} gare su {fuori.gare}
            {fuori.pari > 0 ? `, ${fuori.pari} pari` : ""}
          </span>
        </span>
      </div>
    </li>
  );
}

export function ConteseSection({
  contese,
  nomeCasa,
  nomeFuori,
}: Readonly<{ contese: readonly Contesa[]; nomeCasa: string; nomeFuori: string }>) {
  if (contese.length === 0) return null;
  return (
    <section className="dossier-panel contese" aria-labelledby="contese-title">
      <p className="dossier-kick">Chi lo vince, gara per gara</p>
      <h2 id="contese-title" className="sr-only-heading">
        In quante gare ciascuna squadra ne fa più dell&apos;avversario
      </h2>
      <p className="contese-legenda">
        In quante gare la squadra ne ha fatti <b>più dell&apos;avversario</b>, ciascuna dal
        lato che giocherà qui. È un&apos;altra domanda rispetto alla media: si può fare la
        stessa media vincendo sempre di poco o alternando gare estreme.
      </p>
      <ul className="contese-elenco">
        {contese.map((c) => (
          <Riga key={c.chiave} contesa={c} nomeCasa={nomeCasa} nomeFuori={nomeFuori} />
        ))}
      </ul>
      <p className="dossier-src">
        Compaiono solo le famiglie in cui le due quote si distanziano più del loro errore:
        sotto quella soglia due percentuali non si distinguono. I pareggi sono contati e
        scritti dove ci sono.
      </p>
    </section>
  );
}
