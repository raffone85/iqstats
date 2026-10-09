"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";

import {
  CHIAVE_SALVATI, conScheda, schedeSalvate,
  type RigaSalvata, type SchedaDaSalvare, type SchedaSalvata,
} from "@/lib/pronostici-salvati";

/**
 * Salvare i pronostici di una gara: un'immagine sul telefono, e la stessa scheda in
 * «Salvati».
 *
 * **L'immagine e' la foto del riquadro, fatta qui nel browser.** Una rotta del server che
 * la genera avrebbe dovuto o rifare tutto il conto della gara, o fidarsi di numeri passati
 * nell'indirizzo: e allora chiunque avrebbe potuto farsi stampare una scheda con il nostro
 * nome e le percentuali che voleva.
 *
 * **La memoria del browser si legge come in `campionati-preferiti.tsx`:** stato esterno,
 * `useSyncExternalStore`, il server rende l'elenco vuoto.
 */
const VUOTO = "[]";

const ascoltatori = new Set<() => void>();

function sottoscrivi(avvisa: () => void): () => void {
  ascoltatori.add(avvisa);
  window.addEventListener("storage", avvisa);
  return () => {
    ascoltatori.delete(avvisa);
    window.removeEventListener("storage", avvisa);
  };
}

function istantanea(): string {
  try {
    return window.localStorage.getItem(CHIAVE_SALVATI) ?? VUOTO;
  } catch {
    return VUOTO;
  }
}

/** `false` quando il browser non accetta: chi salva deve saperlo, non scoprirlo dopo. */
function scrivi(schede: readonly SchedaSalvata[]): boolean {
  let riuscito = true;
  try {
    window.localStorage.setItem(CHIAVE_SALVATI, JSON.stringify(schede));
  } catch {
    riuscito = false;
  }
  for (const avvisa of ascoltatori) avvisa();
  return riuscito;
}

const ORARIO = new Intl.DateTimeFormat("it-IT", {
  weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Rome",
});

function quando(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? iso : ORARIO.format(data);
}

// --- L'immagine ---------------------------------------------------------------------

/** Quello che in pagina serve a chi tocca e in una foto no: il pulsante, le note di metodo. */
const FUORI = "fuoriImmagine";

/**
 * La foto di un riquadro **cosi' com'e' in pagina**, piu' una riga in fondo.
 *
 * Dal 9 ottobre 2026 l'immagine non e' piu' una scheda ridisegnata: chi salva vuole
 * ritrovare quello che stava guardando, con gli stemmi, la griglia e i colori della
 * pagina, e una seconda grafica accanto alla prima erano due cose da tenere uguali.
 *
 * **La riga in fondo e' l'unica aggiunta**, e c'e' perche' la pagina non la porta: l'ora
 * della lettura. Le probabilita' cambiano fino al calcio d'inizio, e una foto girata il
 * giorno dopo passerebbe per la lettura di oggi.
 */
async function fotografa(riquadro: HTMLElement, salvata: string): Promise<HTMLCanvasElement> {
  const { toCanvas } = await import("html-to-image");
  const fondo = getComputedStyle(document.body).backgroundColor;
  // Quello che resta fuori sta **in fondo** al riquadro, e la foto finisce dove comincia:
  // togliere un nodo non accorcia il riquadro, e al suo posto resterebbe un vuoto.
  const primo = riquadro.querySelector("[data-fuori-immagine]");
  const opzioni = {
    height: primo === null ? undefined : primo.getBoundingClientRect().top
      - riquadro.getBoundingClientRect().top
      + Number.parseFloat(getComputedStyle(riquadro).paddingBottom),
    // Il margine del riquadro e' spazio della pagina, non suo: nella foto lo sposterebbe
    // in basso e gli taglierebbe il bordo di sotto.
    style: { margin: "0" },
    pixelRatio: 2,
    backgroundColor: fondo,
    filter: (nodo: HTMLElement) => nodo.dataset?.[FUORI] === undefined,
  };
  // ponytail: Safari alla prima passata lascia spesso fuori stemmi e caratteri, e la
  // seconda li trova in memoria. Se non basta, la strada e' disegnare gli stemmi a mano.
  if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) await toCanvas(riquadro, opzioni);
  const foto = await toCanvas(riquadro, opzioni);

  const bordo = 32;
  const riga = 26;
  const tela = document.createElement("canvas");
  tela.width = foto.width + bordo * 2;
  const ctx = tela.getContext("2d");
  if (ctx === null) throw new Error("canvas non disponibile");
  const piede = [
    "IQstatS · lettura del " + quando(salvata) + ".",
    "Le probabilità cambiano fino al calcio d’inizio. Non è un consiglio di gioco.",
  ];
  tela.height = foto.height + bordo * 3 + riga * 1.5 * piede.length;
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, tela.width, tela.height);
  ctx.drawImage(foto, bordo, bordo);
  ctx.font = "500 " + riga + "px " + getComputedStyle(document.body).fontFamily;
  ctx.fillStyle = getComputedStyle(document.body).color;
  ctx.globalAlpha = 0.7;
  ctx.textBaseline = "top";
  // Il piede si stringe sulla larghezza della foto invece di andare a capo: sono due
  // righe note, e su una scheda stretta un terzo a capo le farebbe pesare piu' della gara.
  piede.forEach((testo, i) => {
    ctx.fillText(testo, bordo, foto.height + bordo * 2 + i * riga * 1.5, foto.width);
  });
  return tela;
}

/**
 * Consegna l'immagine: sul telefono il foglio di condivisione del sistema - da li' si
 * salva in galleria o si gira a qualcuno - e altrove un file scaricato.
 */
async function consegna(riquadro: HTMLElement, scheda: SchedaSalvata): Promise<void> {
  const tela = await fotografa(riquadro, scheda.salvata);
  const blob = await new Promise<Blob | null>((fatto) => tela.toBlob(fatto, "image/png"));
  if (blob === null) throw new Error("immagine non generata");
  const nome = ["iqstats", scheda.casa, scheda.trasferta].join("-")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").concat(".png");
  const file = new File([blob], nome, { type: "image/png" });
  // Solo dove si tocca: su un computer il foglio di condivisione e' un passaggio in piu'
  // rispetto al file nella cartella degli scaricati.
  if (
    window.matchMedia("(pointer: coarse)").matches
    && navigator.canShare?.({ files: [file] }) === true
  ) {
    try {
      await navigator.share({ files: [file], title: scheda.casa + " – " + scheda.trasferta });
      return;
    } catch (errore) {
      // Chi chiude il foglio ha deciso: non gli si scarica un file che non ha chiesto.
      if (errore instanceof DOMException && errore.name === "AbortError") return;
    }
  }
  const indirizzo = URL.createObjectURL(blob);
  const ancora = document.createElement("a");
  ancora.href = indirizzo;
  ancora.download = nome;
  ancora.click();
  URL.revokeObjectURL(indirizzo);
}

// --- Il pulsante nella gara -----------------------------------------------------------

type Esito = "fermo" | "salvata" | "senza-memoria" | "errore" | "iniziata";

export function SalvaPronostici({ scheda, riquadro, compatto = false }: {
  readonly scheda: SchedaDaSalvare;
  /** Il riquadro da fotografare: il selettore dell'antenato piu' vicino al pulsante. */
  readonly riquadro: string;
  /** In un elenco di gare: senza la riga che spiega il pulsante, ripetuta a ogni scheda. */
  readonly compatto?: boolean;
}) {
  const [esito, setEsito] = useState<Esito>("fermo");
  return (
    <div
      className={compatto ? "salva-pronostici is-compatto" : "salva-pronostici"}
      data-fuori-immagine
    >
      <button
        type="button"
        className="button-link salva-bottone"
        onClick={async (evento) => {
          const dove = evento.currentTarget.closest<HTMLElement>(riquadro);
          // L'ora si guarda al tocco e non quando la pagina e' stata resa: un elenco puo'
          // restare aperto oltre il fischio, e una scheda con l'ora di dopo passerebbe
          // per un pronostico fatto a risultato noto.
          if (new Date(scheda.inizio).getTime() <= Date.now()) {
            setEsito("iniziata");
            return;
          }
          const completa: SchedaSalvata = { ...scheda, salvata: new Date().toISOString() };
          const tenuta = scrivi(conScheda(schedeSalvate(istantanea()), completa));
          try {
            if (dove === null) throw new Error("riquadro non trovato");
            await consegna(dove, completa);
            setEsito(tenuta ? "salvata" : "senza-memoria");
          } catch {
            setEsito("errore");
          }
        }}
      >
        Salva i pronostici
      </button>
      <p className="salva-esito" role="status">
        {esito === "fermo" ? (
          compatto ? null
            : "Un’immagine per il telefono di questo riquadro, così come lo vedi."
        ) : esito === "iniziata" ? (
          "La gara è già iniziata: un pronostico non si salva a partita in corso."
        ) : esito === "errore" ? (
          "L’immagine non si è generata su questo browser."
        ) : esito === "senza-memoria" ? (
          "Immagine pronta. Questo browser non ci lascia tenerne una copia nei salvati."
        ) : (
          <>
            Immagine pronta, e la scheda sta nei tuoi <Link href="/salvati">salvati</Link>.
          </>
        )}
      </p>
    </div>
  );
}

// --- La sezione «Salvati» -------------------------------------------------------------

function Riga({ riga, pronostico = false }: {
  readonly riga: RigaSalvata;
  readonly pronostico?: boolean;
}) {
  const sotto = [pronostico ? "Il pronostico" : null, riga.chi].filter((v) => v !== null);
  return (
    <li className={pronostico ? "salvati-riga is-pronostico" : "salvati-riga"}>
      <span>
        {riga.titolo}
        {sotto.length === 0 ? null : <em className="engine-obs">{sotto.join(" · ")}</em>}
      </span>
      <b>{Math.round(riga.percento)}%</b>
    </li>
  );
}

export function PronosticiSalvati() {
  const grezzo = useSyncExternalStore(sottoscrivi, istantanea, () => VUOTO);
  const schede = useMemo(() => schedeSalvate(grezzo), [grezzo]);

  if (schede.length === 0) {
    return (
      <p className="salvati-vuoto">
        Non hai ancora salvato nessun pronostico. Apri una gara da giocare e tocca «Salva i
        pronostici»: l’immagine va sul telefono e la scheda compare qui.
      </p>
    );
  }
  return (
    <>
      <ul className="salvati-elenco">
        {schede.map((s) => (
          <li className="dossier-panel salvati-scheda" key={s.gara}>
            <p className="dossier-kick">{s.lega ?? "Gara"} · {quando(s.inizio)}</p>
            <h2 className="salvati-titolo">
              <Link href={"/match/" + s.gara}>{s.casa} – {s.trasferta}</Link>
            </h2>
            <ul className="salvati-righe">
              {s.pronostico === null ? null : <Riga riga={s.pronostico} pronostico />}
              {s.eventi.map((riga) => (
                <Riga key={riga.titolo + "|" + (riga.chi ?? "")} riga={riga} />
              ))}
            </ul>
            <p className="salvati-quando">
              Lettura del {quando(s.salvata)}. Le probabilità di oggi stanno nella gara.
            </p>
            <div className="salvati-azioni" data-fuori-immagine>
              <button
                type="button"
                className="button-link salva-bottone"
                onClick={(evento) => {
                  const dove = evento.currentTarget.closest<HTMLElement>("li");
                  if (dove !== null) void consegna(dove, s).catch(() => undefined);
                }}
              >
                Scarica l’immagine
              </button>
              <button
                type="button"
                className="salvati-togli"
                aria-label={"Togli " + s.casa + " – " + s.trasferta + " dai salvati"}
                onClick={() => { scrivi(schede.filter((x) => x.gara !== s.gara)); }}
              >
                Togli
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="partite-preferiti-nota">
        I salvati restano <b>su questo dispositivo</b>: non seguono l&apos;account, e si
        perdono svuotando i dati del sito dal browser. Le immagini scaricate restano tue.
      </p>
    </>
  );
}
