import type { Salto } from "@/server/iqstats/lati";

/**
 * Come stanno arrivando le due squadre: dove le ultime gare si staccano dalle loro medie.
 *
 * **Le cinque gare sono quelle giocate davvero, casa e trasferta insieme**, mentre la media
 * accanto e' quella del lato che si giochera'. Sono due perimetri diversi e la pagina lo
 * dice: senza, il confronto sembrerebbe fra due cose uguali.
 *
 * **Entra solo quello che supera l'errore delle due medie.** Cinque gare sono poche: senza
 * quel filtro ogni oscillazione diventerebbe una tendenza, ed e' il motivo per cui questa
 * sezione a volte non compare affatto.
 */
function riga(salto: Salto, lato: "casa" | "trasferta"): string {
  const dove = lato === "casa" ? "in casa" : "in trasferta";
  const cosa = salto.quale === "prodotto" ? "fa" : "concede";
  const verso = salto.verso === 1 ? "più" : "meno";
  const [ultime, media] = coppia(salto.ultime, salto.media);
  return `${cosa} ${verso} ${salto.nome.toLowerCase()} · ${ultime} contro ${media} ${dove}`;
}

function numero(v: number, cifre: number): string {
  return v.toLocaleString("it-IT", {
    minimumFractionDigits: cifre, maximumFractionDigits: cifre,
  });
}

/**
 * I due numeri scritti con le cifre che bastano a distinguerli.
 *
 * **Difetto visto in pagina, non nelle misure:** la qualità del tiro usciva «0,1 contro
 * 0,1», due numeri identici accanto alla parola «meno». Con un decimale fisso una quota si
 * appiattisce; qui si scende finché i due numeri si separano, e non oltre le tre cifre.
 */
function coppia(a: number, b: number): [string, string] {
  for (const cifre of [1, 2, 3]) {
    const primo = numero(a, cifre);
    const secondo = numero(b, cifre);
    if (primo !== secondo) return [primo, secondo];
  }
  return [numero(a, 3), numero(b, 3)];
}

function Squadra({
  nome,
  salti,
  lato,
  gare,
}: Readonly<{ nome: string; salti: readonly Salto[]; lato: "casa" | "trasferta"; gare: number }>) {
  if (salti.length === 0) {
    return (
      <div className="trend-squadra">
        <p className="trend-nome">{nome}</p>
        <p className="trend-vuoto">
          Nelle ultime {gare} gare non si scosta dalle proprie medie più di quanto valga
          l&apos;errore: niente da segnalare.
        </p>
      </div>
    );
  }
  return (
    <div className="trend-squadra">
      <p className="trend-nome">{nome}</p>
      <ul className="trend-salti">
        {salti.map((salto) => (
          <li key={`${salto.chiave}-${salto.quale}`} className={salto.verso === 1 ? "is-su" : "is-giu"}>
            {riga(salto, lato)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendRecente({
  casa,
  fuori,
  nomeCasa,
  nomeFuori,
  gareCasa,
  gareFuori,
}: Readonly<{
  casa: readonly Salto[];
  fuori: readonly Salto[];
  nomeCasa: string;
  nomeFuori: string;
  gareCasa: number;
  gareFuori: number;
}>) {
  if (casa.length === 0 && fuori.length === 0) return null;
  return (
    <section className="dossier-panel trend" aria-labelledby="trend-title">
      <p className="dossier-kick">Come stanno arrivando</p>
      <h2 id="trend-title" className="sr-only-heading">
        Dove le ultime gare si staccano dalle medie della stagione
      </h2>
      <div className="trend-due">
        <Squadra nome={nomeCasa} salti={casa} lato="casa" gare={gareCasa} />
        <Squadra nome={nomeFuori} salti={fuori} lato="trasferta" gare={gareFuori} />
      </div>
      <p className="dossier-src">
        Ultime gare giocate davvero, <b>casa e trasferta insieme</b>; la media accanto è del
        lato che si giocherà qui. Compare solo ciò che supera l&apos;errore delle due medie.
      </p>
    </section>
  );
}
