"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * La guida in tre passi al calendario, per chi arriva la prima volta.
 *
 * **Perche' tre e non dieci.** Ogni passo indica un comando che sta in questa pagina e che
 * non si trova guardandola: il giorno all'indietro, la stella dei preferiti, la riga che
 * dichiara cosa si trovera' aprendo la gara. Le cose che si vedono da sole non hanno bisogno
 * di essere spiegate, e un passo che spiega l'ovvio insegna a saltare i passi.
 *
 * **Non copre la pagina.** Sta in linea, sotto il titolo, e si puo' ignorare scorrendo: un
 * velo sopra il contenuto costringerebbe a rispondere prima di vedere di che si parla.
 *
 * **Si salta, e non ricompare.** La scelta sta nella memoria del browser, con lo stesso
 * idioma dei campionati preferiti e dell'invito a installare: vale su questo dispositivo, e
 * quando la memoria non c'e' la guida semplicemente non si mostra piu' per quella visita.
 */
const VISTA = "iqstats.guida.partite";

const PASSI = [
  {
    titolo: "Il giorno si sceglie, anche all'indietro",
    testo: "La barra dei giorni e «Vai a una data» arrivano anche al passato. Le gare finite servono: sono le uniche su cui si può controllare che cosa aveva detto il modello prima che si giocasse.",
  },
  {
    titolo: "I campionati che segui salgono in cima",
    testo: "La stella accanto al nome di una competizione la porta in testa all'elenco. Nessuna gara viene nascosta: cambia soltanto l'ordine. La scelta resta su questo dispositivo.",
  },
  {
    titolo: "Ogni gara dice cosa troverai, prima di aprirla",
    testo: "Sotto il nome delle due squadre c'è scritto che cosa la gara porta con sé. Dentro, il dossier mostra solo i capitoli che i dati coprono davvero, e a gara finita confronta quello che aveva previsto con quello che è successo.",
  },
] as const;

const ascoltatori = new Set<() => void>();

function sottoscrivi(avvisa: () => void): () => void {
  ascoltatori.add(avvisa);
  window.addEventListener("storage", avvisa);
  return () => {
    ascoltatori.delete(avvisa);
    window.removeEventListener("storage", avvisa);
  };
}

/** Il server non ha memoria da leggere: non rende la guida, e il client la mostra se serve. */
const SUL_SERVER = "1";

function istantanea(): string {
  try {
    return window.localStorage.getItem(VISTA) ?? "0";
  } catch {
    // Memoria non disponibile: non si insiste con una guida che non saprebbe sparire.
    return "1";
  }
}

function chiudi(): void {
  try {
    window.localStorage.setItem(VISTA, "1");
  } catch {
    // Se la memoria non accetta, la guida sparisce per questa visita e basta.
  }
  for (const avvisa of ascoltatori) avvisa();
}

export function GuidaPartite() {
  const vista = useSyncExternalStore(sottoscrivi, istantanea, () => SUL_SERVER);
  const [passo, setPasso] = useState(0);
  if (vista === "1") return null;

  const corrente = PASSI[passo];
  const ultimo = passo === PASSI.length - 1;

  return (
    <section className="guida" aria-labelledby="guida-titolo">
      <p className="guida-conta">
        Passo {passo + 1} di {PASSI.length}
      </p>
      {/* Il testo cambia sotto le dita: va annunciato, o chi non guarda lo schermo resta
          fermo al primo passo mentre i pulsanti dicono di essere andati avanti. */}
      <div aria-live="polite">
        <h2 id="guida-titolo">{corrente.titolo}</h2>
        <p>{corrente.testo}</p>
      </div>
      <div className="guida-azioni">
        <button
          type="button"
          className="button-link"
          onClick={() => (ultimo ? chiudi() : setPasso(passo + 1))}
        >
          {ultimo ? "Ho capito" : "Avanti"}
        </button>
        {ultimo ? null : (
          <button type="button" className="guida-salta" onClick={chiudi}>
            Salta
          </button>
        )}
      </div>
    </section>
  );
}
