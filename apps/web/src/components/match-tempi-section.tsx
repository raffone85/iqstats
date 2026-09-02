import type { Meta, TempiDellaGara } from "@/server/iqstats/tempi";

/**
 * La gara divisa in due tempi.
 *
 * **Solo i gol.** Delle trentotto metriche che osserviamo nessuna e' divisa per tempo:
 * quello che esiste, e su cui poggia tutto qui dentro, e' il punteggio all'intervallo.
 * Tiri, corner e falli del primo tempo non esistono nel dato e non si stimano.
 *
 * **Le fasce di minuto nemmeno.** 46-60, 61-75 e 76-90 chiedono il minuto di ogni gol, che
 * sta negli episodi raccolti per l'addestramento e non nel livello dati che la pagina
 * legge. La sezione lo dichiara invece di riempire lo spazio.
 */
function percento(quota: number): string {
  return `${Math.round(quota * 100)}%`;
}

function numero(valore: number): string {
  return valore.toFixed(2).replace(".", ",");
}

function Riga({ etichetta, casa, trasferta, lega }: {
  readonly etichetta: string;
  readonly casa: string;
  readonly trasferta: string;
  readonly lega: string;
}) {
  return (
    <div className="tempi-riga">
      <span className="tempi-etichetta">{etichetta}</span>
      <span className="tempi-val">{casa}</span>
      <span className="tempi-val">{trasferta}</span>
      <span className="tempi-val tempi-lega">{lega}</span>
    </div>
  );
}

function Tempo({ tempi, meta, titolo }: {
  readonly tempi: TempiDellaGara;
  readonly meta: Meta;
  readonly titolo: string;
}) {
  const casa = tempi.casa.stagione[meta];
  const trasferta = tempi.trasferta.stagione[meta];
  const lega = tempi.lega[meta];
  const mercati = tempi.mercati[meta];
  const over05 = mercati?.overUnder.find((l) => l.linea === 0.5) ?? null;
  const over15 = mercati?.overUnder.find((l) => l.linea === 1.5) ?? null;

  return (
    <div className="tempi-blocco">
      <h3 className="tempi-titolo">{titolo}</h3>
      {mercati !== null ? (
        <p className="tempi-stima">
          {over05 !== null ? (
            <>
              Almeno un gol: <b>{percento(over05.sopra)}</b>.{" "}
            </>
          ) : null}
          {over15 !== null ? <>Almeno due: <b>{percento(over15.sopra)}</b>.</> : null}
        </p>
      ) : (
        <p className="tempi-stima">
          Il campione non basta per una stima di questo tempo: restano le frequenze.
        </p>
      )}
      <div className="tempi-tabella">
        <div className="tempi-riga tempi-testa" aria-hidden="true">
          <span>In questo tempo</span>
          <span>{tempi.casa.nome}</span>
          <span>{tempi.trasferta.nome}</span>
          <span>campionato</span>
        </div>
        <Riga
          etichetta="gol segnati per gara"
          casa={numero(casa.segnati)}
          trasferta={numero(trasferta.segnati)}
          lega={numero(lega.segnati / 2)}
        />
        <Riga
          etichetta="gol subiti per gara"
          casa={numero(casa.subiti)}
          trasferta={numero(trasferta.subiti)}
          lega={numero(lega.segnati / 2)}
        />
        <Riga
          etichetta="gare con almeno un gol"
          casa={percento(casa.conGol)}
          trasferta={percento(trasferta.conGol)}
          lega={percento(lega.conGol)}
        />
        <Riga
          etichetta="gare con almeno due gol"
          casa={percento(casa.overUnoCinque)}
          trasferta={percento(trasferta.overUnoCinque)}
          lega={percento(lega.overUnoCinque)}
        />
        <Riga
          etichetta="gare in cui segnano entrambe"
          casa={percento(casa.entrambe)}
          trasferta={percento(trasferta.entrambe)}
          lega={percento(lega.entrambe)}
        />
      </div>
      <p className="tempi-campione">
        Su {casa.gare} gare in casa e {trasferta.gare} in trasferta, tutte chiuse prima di
        questa. Il campionato conta {tempi.gareDiLega} gare.
      </p>
    </div>
  );
}

export function MatchTempiSection({ tempi }: { readonly tempi: TempiDellaGara }) {
  const intervallo = tempi.casa.intervallo;
  return (
    <section className="dossier-panel tempi-panel" aria-labelledby="tempi-title">
      <p className="dossier-kick">Primo e secondo tempo</p>
      <h2 id="tempi-title" className="squad-section-title">Come si distribuiscono i gol</h2>
      <div className="tempi-due">
        <Tempo tempi={tempi} meta="primo" titolo="Primo tempo" />
        <Tempo tempi={tempi} meta="secondo" titolo="Secondo tempo" />
      </div>
      {intervallo !== null ? (
        <p className="tempi-intervallo">
          {tempi.casa.nome} arriva all’intervallo avanti nel {percento(intervallo.avanti)} delle
          sue gare in casa, in parità nel {percento(intervallo.pari)}, sotto nel{" "}
          {percento(intervallo.sotto)}.
        </p>
      ) : null}
      <p className="dossier-src">
        Tutto qui viene dal punteggio all’intervallo delle gare già chiuse, letto dal nostro
        livello dati: i gol del secondo tempo sono la differenza con il finale. Le statistiche
        di gioco non esistono divise per tempo, quindi tiri, corner e falli del primo tempo
        non compaiono. Le fasce di minuto — 46-60, 61-75, 76-90 — chiedono il minuto di ogni
        gol, che non è in questo livello dati: non vengono stimate.
      </p>
    </section>
  );
}
