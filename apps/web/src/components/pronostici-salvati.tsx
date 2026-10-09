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
 * **L'immagine si disegna qui, nel browser, dai numeri che la pagina ha gia' mostrato.** Una
 * rotta del server che la genera avrebbe dovuto o rifare tutto il conto della gara, o
 * fidarsi di numeri passati nell'indirizzo: e allora chiunque avrebbe potuto farsi
 * stampare una scheda con il nostro nome e le percentuali che voleva.
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

const LARGA = 1080;
const BORDO = 72;
// Gli stessi verdi di `globals.css` (`--brand-deep`, `--brand`, `--brand-soft`): un canvas
// non legge le variabili CSS.
const FONDO = "#05301F";
const RIQUADRO = "#0B4F35";
const TENUE = "#A9C3B5";
const CHIARO = "#FFFFFF";

/** Il testo spezzato sulle parole perche' stia in `larga` pixel, col carattere gia' scelto. */
function aCapo(ctx: CanvasRenderingContext2D, testo: string, larga: number): string[] {
  const righe: string[] = [];
  let corrente = "";
  for (const parola of testo.split(/\s+/)) {
    const prova = corrente === "" ? parola : corrente + " " + parola;
    if (corrente !== "" && ctx.measureText(prova).width > larga) {
      righe.push(corrente);
      corrente = parola;
    } else {
      corrente = prova;
    }
  }
  if (corrente !== "") righe.push(corrente);
  return righe;
}

function disegna(scheda: SchedaSalvata): HTMLCanvasElement {
  const famiglia = getComputedStyle(document.body).fontFamily;
  // Si disegna su una tela alta e si ritaglia a quanto e' servito: l'altezza dipende da
  // quante righe vanno a capo, e si sa solo dopo averle misurate.
  const tela = document.createElement("canvas");
  tela.width = LARGA;
  tela.height = 4200;
  const ctx = tela.getContext("2d");
  if (ctx === null) throw new Error("canvas non disponibile");
  ctx.fillStyle = FONDO;
  ctx.fillRect(0, 0, tela.width, tela.height);
  ctx.textBaseline = "top";

  let y = BORDO;
  const testo = (
    cosa: string, corpo: number, peso: number, colore: string, larga = LARGA - BORDO * 2,
    x = BORDO,
  ) => {
    ctx.font = [peso, corpo + "px", famiglia].join(" ");
    ctx.fillStyle = colore;
    ctx.textAlign = "left";
    for (const riga of aCapo(ctx, cosa, larga)) {
      ctx.fillText(riga, x, y);
      y += Math.round(corpo * 1.25);
    }
  };
  const numero = (percento: number, corpo: number, yNumero: number, x = LARGA - BORDO) => {
    ctx.font = ["800", corpo + "px", famiglia].join(" ");
    ctx.fillStyle = CHIARO;
    ctx.textAlign = "right";
    ctx.fillText(Math.round(percento) + "%", x, yNumero);
  };

  testo("IQstatS", 44, 800, CHIARO);
  y += 36;
  if (scheda.lega !== null) testo(scheda.lega.toUpperCase(), 28, 700, TENUE);
  y += 8;
  testo(scheda.casa + " – " + scheda.trasferta, 68, 800, CHIARO);
  y += 8;
  testo(quando(scheda.inizio), 32, 500, TENUE);
  y += 48;

  if (scheda.pronostico !== null) {
    const p = scheda.pronostico;
    const alto = y;
    const dentro = LARGA - BORDO * 2 - 320;
    // Il riquadro si colora quando si sa quanto e' alto: il testo passa due volte, la
    // prima per misurare e la seconda sopra il fondo.
    const corpo = () => {
      y = alto + 40;
      testo("IL PRONOSTICO", 26, 700, TENUE, dentro, BORDO + 40);
      y += 10;
      testo(p.titolo, 50, 800, CHIARO, dentro, BORDO + 40);
      if (p.chi !== null) testo(p.chi, 30, 500, TENUE, dentro, BORDO + 40);
      y += 40;
    };
    corpo();
    ctx.fillStyle = RIQUADRO;
    ctx.fillRect(BORDO, alto, LARGA - BORDO * 2, y - alto);
    corpo();
    numero(p.percento, 96, alto + 76, LARGA - BORDO - 40);
    y += 48;
  }

  if (scheda.eventi.length > 0) {
    testo(scheda.elenco.toUpperCase(), 26, 700, TENUE);
    y += 16;
    for (const evento of scheda.eventi) {
      const alto = y;
      testo(evento.titolo, 38, 700, CHIARO, LARGA - BORDO * 2 - 190);
      if (evento.chi !== null) testo(evento.chi, 28, 500, TENUE, LARGA - BORDO * 2 - 190);
      numero(evento.percento, 46, alto);
      y += 18;
      ctx.fillStyle = RIQUADRO;
      ctx.fillRect(BORDO, y, LARGA - BORDO * 2, 2);
      y += 20;
    }
    y += 20;
  }

  testo(
    "Lettura del " + quando(scheda.salvata)
      + ". Le probabilità cambiano fino al calcio d’inizio.",
    26, 500, TENUE,
  );
  y += 6;
  testo(
    "Probabilità del modello, non un consiglio di gioco. " + window.location.host,
    26, 500, TENUE,
  );
  y += BORDO;

  const ritaglio = document.createElement("canvas");
  ritaglio.width = LARGA;
  ritaglio.height = Math.min(y, tela.height);
  ritaglio.getContext("2d")?.drawImage(tela, 0, 0);
  return ritaglio;
}

/**
 * Consegna l'immagine: sul telefono il foglio di condivisione del sistema - da li' si
 * salva in galleria o si gira a qualcuno - e altrove un file scaricato.
 */
async function consegna(scheda: SchedaSalvata): Promise<void> {
  const tela = disegna(scheda);
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

export function SalvaPronostici({ scheda, compatto = false }: {
  readonly scheda: SchedaDaSalvare;
  /** In un elenco di gare: senza la riga che spiega il pulsante, ripetuta a ogni scheda. */
  readonly compatto?: boolean;
}) {
  const [esito, setEsito] = useState<Esito>("fermo");
  return (
    <div className={compatto ? "salva-pronostici is-compatto" : "salva-pronostici"}>
      <button
        type="button"
        className="button-link salva-bottone"
        onClick={async () => {
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
            await consegna(completa);
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
            : "Un’immagine per il telefono, con il pronostico e gli eventi più probabili di questa gara."
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
            <div className="salvati-azioni">
              <button
                type="button"
                className="button-link salva-bottone"
                onClick={() => { void consegna(s).catch(() => undefined); }}
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
