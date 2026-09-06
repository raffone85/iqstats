import { affidabilita } from "@/lib/affidabilita";
import type { Assetto, QuandoSpingono } from "@/server/iqstats/assetto";

/**
 * Come stanno in campo e quando spingono: due letture, la stessa forma.
 *
 * **Un verdetto e poche righe.** In cima la frase, sotto i numeri con la barra: chi
 * legge deve capire in un colpo d'occhio se una squadra difende alta o bassa e in che
 * tratto della gara le due producono. Sono le classi della gara giocata, quindi nessun
 * CSS nuovo e nessun rischio di larghezza su telefono.
 *
 * **La barra e' un confronto, non un merito.** Riempie quanto pesa la squadra di casa
 * sulle due misure; i numeri stanno scritti ai lati, quindi niente vive solo nel colore.
 */
function Righe({ righe }: {
  readonly righe: readonly { chiave: string; nome: string; casa: string; trasferta: string; quotaCasa: number }[];
}) {
  return (
    <div className="gamestat-table">
      {righe.map((r) => (
        <div className="gamestat-row" key={r.chiave}>
          <span className="gamestat-val">{r.casa}</span>
          <span className="gamestat-label">{r.nome}</span>
          <span className="gamestat-val gamestat-val-away">{r.trasferta}</span>
          <span className="gamestat-bar" aria-hidden="true">
            <i style={{ width: String(Math.round(r.quotaCasa * 100)) + "%" }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function MatchAssettoSection({ assetto, fasce }: {
  readonly assetto: Assetto | null;
  readonly fasce: QuandoSpingono | null;
}) {
  if (assetto === null && fasce === null) return null;
  const teste = assetto ?? fasce;
  if (teste === null) return null;

  // **Senza verdetto i numeri restano, ma non aperti.** Quando ne' l'assetto ne' le fasce
  // hanno un verdetto la card dichiara «troppe poche gare» e poi mostrava 559 px di numeri
  // costruiti su quelle poche gare - misurato a 375 px su una gara di inizio stagione, con
  // una partita per squadra. E' lo stesso principio di `2f02fa32`: sotto soglia non si
  // dichiara. I numeri non spariscono, si aprono, e il comando dice su quante gare poggiano.
  const senzaVerdetto = (assetto?.verdetto ?? null) === null && (fasce?.verdetto ?? null) === null;
  // «1 gara e 1 gara» si legge male: quando il campione e' lo stesso da tutte e due le parti
  // si dice una volta sola, e quando cambia si dice da che lato sta ciascuno.
  const quanteGare = teste.gareCasa === teste.gareTrasferta
    ? `${teste.gareCasa} ${teste.gareCasa === 1 ? "gara" : "gare"} per squadra`
    : `${teste.gareCasa} ${teste.gareCasa === 1 ? "gara" : "gare"} in casa e ${teste.gareTrasferta} in trasferta`;

  const numeri = (
    <>
      {assetto === null ? null : <Righe righe={assetto.righe} />}

      {fasce === null ? null : (
        <>
          <p className="engine-why">
            {fasce.verdetto === null || assetto?.verdetto === fasce.verdetto
              ? "Gol attesi prodotti a gara, quarto d'ora per quarto d'ora."
              : fasce.verdetto + ". Gol attesi prodotti a gara, quarto d'ora per quarto d'ora."}
          </p>
          <Righe
            righe={fasce.fasce.map((f) => ({
              chiave: "b" + String(f.band),
              nome: f.etichetta,
              casa: f.casa.toFixed(2).replace(".", ","),
              trasferta: f.trasferta.toFixed(2).replace(".", ","),
              quotaCasa: f.quotaCasa,
            }))}
          />
        </>
      )}
    </>
  );

  return (
    <section className="dossier-panel" aria-labelledby="assetto-title">
      <p className="dossier-kick">Assetto in campo</p>
      <h2 id="assetto-title" className="squad-section-title">
        {assetto?.verdetto ?? fasce?.verdetto ?? "Troppe poche gare in questa stagione per un assetto"}
      </h2>

      <div className="gamestat-heads">
        <span>
          {teste.nomeCasa} · {teste.gareCasa} {teste.gareCasa === 1 ? "gara" : "gare"}
          {affidabilita(teste.gareCasa) === null ? null : ` · ${affidabilita(teste.gareCasa)}`}
        </span>
        <span>
          {teste.nomeTrasferta} · {teste.gareTrasferta}{" "}
          {teste.gareTrasferta === 1 ? "gara" : "gare"}
          {affidabilita(teste.gareTrasferta) === null
            ? null
            : ` · ${affidabilita(teste.gareTrasferta)}`}
        </span>
      </div>
      {senzaVerdetto ? (
        <details className="dossier-spiega">
          <summary>I numeri, su {quanteGare}</summary>
          {numeri}
        </details>
      ) : numeri}

      <p className="dossier-src">
        Dalle posizioni medie dei giocatori e dai gol attesi minuto per minuto che la fonte
        manda con le statistiche della gara, sulle partite di <b>questa stagione</b>: nessun
        recupero dall&apos;anno scorso. L&apos;altezza va da 0, la propria porta, a 100,
        quella avversaria, e vale per entrambe allo stesso modo. Sono gare avvenute: i numeri
        attesi di questa partita restano quelli delle Proiezioni.
      </p>
    </section>
  );
}
