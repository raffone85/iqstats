// Gli uomini della gara: due rose, chi segna e chi prende i gialli.
//
// **Perche' una barra e non solo la cifra.** Il confronto qui e' fra cinque nomi della
// stessa squadra, e l'occhio lo fa meglio della lettura: la barra dice «questo il doppio
// di quello» prima che il numero venga letto. La cifra resta scritta accanto, sempre, come
// vuole il master: la barra rende visibile l'informazione, non la sostituisce.
//
// La barra e' larga in proporzione al primo della lista, non a un massimo assoluto: la
// lista e' un ordine fra questi cinque, e un fondoscala inventato falserebbe la distanza.
import Link from "next/link";

import type { LatoDegliUomini, UomoDellaGara, UominiDellaGara } from "@/server/iqstats/uomini-gara";

/** Una cifra con la virgola italiana, oppure il trattino dell'assenza. */
function cifra(valore: number | null, decimali: number): string {
  if (valore === null) return "—";
  return valore.toFixed(decimali).replace(".", ",");
}

function Riga({
  uomo,
  massimo,
  unita,
  accantoNome,
  accantoDecimali,
}: Readonly<{
  uomo: UomoDellaGara;
  massimo: number;
  unita: string;
  accantoNome: string;
  accantoDecimali: number;
}>) {
  const quota = massimo > 0 ? Math.max(6, ((uomo.per90 ?? 0) / massimo) * 100) : 0;
  return (
    <li className="uomini-riga">
      <Link className="uomini-nome" href={`/giocatori/${uomo.giocatoreId}`}>
        {uomo.nome}
      </Link>
      <span className="uomini-barra" aria-hidden="true">
        <i style={{ width: `${quota}%` }} />
      </span>
      <span className="uomini-cifre">
        <b>{cifra(uomo.per90, 2)}</b>
        <span className="uomini-unita">{unita}</span>
      </span>
      <span className="uomini-nota">
        {uomo.totale === null ? "totale non esposto" : `${uomo.totale} in ${uomo.presenze} gare`}
        {uomo.accanto === null ? null : ` · ${accantoNome} ${cifra(uomo.accanto, accantoDecimali)}`}
        {uomo.rating === null ? null : (
          // Il rating corretto e' quello che conta; la media grezza resta scritta col suo
          // campione, perche' una correzione che nasconde il numero di partenza e' opaca.
          uomo.ratingCorretto === null || uomo.ratingCorretto === uomo.rating
            ? ` · rating ${cifra(uomo.rating, 2)} su ${uomo.gareDiRating} gare`
            : ` · rating ${cifra(uomo.ratingCorretto, 2)}, media ${cifra(uomo.rating, 2)} su ${uomo.gareDiRating} gare`
        )}
      </span>
    </li>
  );
}

function Lista({
  titolo,
  spiega,
  uomini,
  unita,
  accantoNome,
  accantoDecimali,
  vuoto,
}: Readonly<{
  titolo: string;
  spiega: string;
  uomini: readonly UomoDellaGara[];
  unita: string;
  accantoNome: string;
  accantoDecimali: number;
  vuoto: string;
}>) {
  const massimo = uomini.reduce((m, u) => Math.max(m, u.per90 ?? 0), 0);
  return (
    <div className="uomini-lista">
      <h4>{titolo}</h4>
      <p className="uomini-spiega">{spiega}</p>
      {uomini.length === 0 ? (
        <p className="uomini-vuoto">{vuoto}</p>
      ) : (
        <ul>
          {uomini.map((u) => (
            <Riga
              key={u.giocatoreId}
              uomo={u}
              massimo={massimo}
              unita={unita}
              accantoNome={accantoNome}
              accantoDecimali={accantoDecimali}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Lato({ lato, minutiMinimi }: Readonly<{ lato: LatoDegliUomini; minutiMinimi: number }>) {
  return (
    <div className="uomini-lato">
      <h3>{lato.squadra}</h3>
      <p className="uomini-campione">
        {lato.misurati} giocatori sopra i {minutiMinimi} minuti di stagione, su {lato.inRosa} in rosa
      </p>
      <Lista
        titolo="Chi segna"
        spiega="Gol per novanta minuti in questa stagione, con i gol attesi accanto."
        uomini={lato.marcatori}
        unita="gol / 90'"
        accantoNome="attesi"
        accantoDecimali={2}
        vuoto="Nessuno di questa rosa ha segnato con abbastanza minuti alle spalle."
      />
      <Lista
        titolo="Chi prende i gialli"
        spiega="Cartellini gialli per novanta minuti, con i falli commessi accanto."
        uomini={lato.ammoniti}
        unita="gialli / 90'"
        accantoNome="falli"
        accantoDecimali={1}
        vuoto="Nessun giallo in questa rosa con abbastanza minuti alle spalle."
      />
    </div>
  );
}

export function UominiGaraSection({ uomini }: Readonly<{ uomini: UominiDellaGara }>) {
  return (
    <section className="dossier-panel" aria-labelledby="uomini-title">
      <p className="dossier-kick">Gli uomini</p>
      <h2 id="uomini-title">Chi segna e chi prende i gialli</h2>
      <p className="dossier-intro">
        Il rendimento di stagione dei giocatori delle due rose, per novanta minuti giocati.
        Sono frequenze passate, non previsioni sulla gara: chi ha giocato poco resta fuori,
        e una misura che la fonte non espone resta scritta come assente.
      </p>
      <div className="uomini-griglia">
        <Lato lato={uomini.casa} minutiMinimi={uomini.minutiMinimi} />
        <Lato lato={uomini.trasferta} minutiMinimi={uomini.minutiMinimi} />
      </div>
    </section>
  );
}
