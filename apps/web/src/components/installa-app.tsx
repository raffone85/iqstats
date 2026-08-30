"use client";

import { useSyncExternalStore } from "react";

/**
 * L'invito a installare IQstatS sulla schermata home.
 *
 * **Perche' e' qui e non altrove.** Il manifesto e le icone rendono l'app installabile, ma
 * il comando per installarla e' sepolto in un menu del browser: su Chrome sta dietro
 * l'icona nella barra degli indirizzi, su iPhone dentro «Condividi». Questa scheda porta il
 * comando in pagina, una volta.
 *
 * **Compare solo quando c'e' qualcosa da offrire.** Chrome annuncia l'installabilita' con
 * `beforeinstallprompt`: finche' quell'evento non arriva la scheda resta invisibile, invece
 * di promettere un pulsante che non funziona. Safari non manda quell'evento e non ha una
 * API d'installazione: li' la scheda mostra i due passaggi manuali, e lo dice.
 *
 * **Non ricompare.** Chi la chiude non la rivede: la scelta sta nella memoria del browser,
 * con lo stesso idioma dei campionati preferiti, quindi vale su questo dispositivo.
 *
 * **Lo stato vive fuori da React, e si legge come tale.** L'evento arriva prima
 * dell'idratazione e lo trattiene lo script in `layout.tsx`; la memoria del browser e' un
 * altro stato esterno. `useSyncExternalStore` e' il modo previsto per entrambi: il server
 * rende sempre niente, il client decide quando conosce l'uno e l'altra, e non c'e' nessun
 * `setState` dentro un effetto.
 */
const CHIUSA = "iqstats.installa.chiusa";

/** L'evento non e' negli standard TypeScript del DOM: solo Chromium lo manda. */
type EventoInstalla = Event & { prompt: () => Promise<void> };

/** Quello che lo script in `layout.tsx` ha messo da parte, se c'e'. */
function stanzaEvento(): EventoInstalla | null {
  return (window as { __iqstatsInstalla?: EventoInstalla | null }).__iqstatsInstalla ?? null;
}

/** Le tre situazioni possibili, come stringa: l'istantanea deve essere stabile fra i giri. */
type Situazione = "chrome" | "manuale" | "niente";

/** Il server non ha ne' evento ne' memoria: rende niente, e il client corregge. */
const SUL_SERVER: Situazione = "niente";

const ascoltatori = new Set<() => void>();

function sottoscrivi(avvisa: () => void): () => void {
  ascoltatori.add(avvisa);
  window.addEventListener("iqstats:installabile", avvisa);
  // A installazione avvenuta la scheda sparisce senza aspettare un ricaricamento.
  window.addEventListener("appinstalled", avvisa);
  return () => {
    ascoltatori.delete(avvisa);
    window.removeEventListener("iqstats:installabile", avvisa);
    window.removeEventListener("appinstalled", avvisa);
  };
}

function giaChiusa(): boolean {
  try {
    return window.localStorage.getItem(CHIUSA) === "1";
  } catch {
    // Memoria disabilitata o piena: si mostra la scheda, che e' il male minore fra il
    // ripetersi e lo sparire.
    return false;
  }
}

/** Vero quando la pagina gira gia' come app installata: non si invita chi ha gia' accettato. */
function giaInstallata(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in window.navigator && Boolean((window.navigator as { standalone?: boolean }).standalone));
}

function istantanea(): Situazione {
  if (giaChiusa() || giaInstallata()) return "niente";
  if (stanzaEvento()) return "chrome";
  // Euristica dichiarata: iOS non manda `beforeinstallprompt`, e va riconosciuto dal nome.
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) ? "manuale" : "niente";
}

function chiudi(): void {
  try {
    window.localStorage.setItem(CHIUSA, "1");
  } catch {
    // Se la memoria non accetta, la scheda sparisce per questa visita e basta.
  }
  for (const avvisa of ascoltatori) avvisa();
}

export function InstallaApp() {
  const situazione = useSyncExternalStore(sottoscrivi, istantanea, () => SUL_SERVER);
  if (situazione === "niente") return null;

  return (
    <aside className="installa-app" aria-labelledby="installa-titolo">
      <h2 id="installa-titolo">Tieni IQstatS sulla schermata home</h2>
      <p>
        Si apre a schermo pieno, senza la barra del browser, e parte dalle partite del
        giorno. Resta una pagina web: senza rete non mostra nulla, perché i numeri si leggono
        al momento e una copia salvata avrebbe una freschezza falsa.
      </p>
      {situazione === "manuale" ? (
        <p className="installa-passi">
          Su iPhone il comando sta nel browser: tocca <b>Condividi</b>, poi{" "}
          <b>Aggiungi alla schermata Home</b>.
        </p>
      ) : null}
      <div className="installa-azioni">
        {situazione === "chrome" ? (
          <button
            type="button"
            className="button-link"
            onClick={() => {
              void stanzaEvento()?.prompt();
              // Il browser da qui in poi conduce lui: la scheda ha finito il suo lavoro,
              // sia che l'utente accetti sia che rifiuti.
              chiudi();
            }}
          >
            Aggiungi alla schermata home
          </button>
        ) : null}
        <button type="button" className="installa-rinuncia" onClick={chiudi}>
          Non ora
        </button>
      </div>
    </aside>
  );
}
