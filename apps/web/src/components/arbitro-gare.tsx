"use client";

import { useMemo, useState } from "react";

import type { GaraDiretta } from "@/server/iqstats/referees";

/**
 * Le gare dirette nella **stessa lega e stagione** della scheda che si sta leggendo,
 * ordinabili e a pagine.
 *
 * **Perche' ordinabile e non solo in ordine di data.** La domanda vera non e' «quando ha
 * arbitrato» ma «quanto ha fischiato quando ha arbitrato qui»: ordinare per falli o per
 * gialli mostra in un tocco se una media alta viene da una tendenza o da due gare storte.
 *
 * **Perche' a pagine e non tutte.** Il massimo osservato e' 31 gare per arbitro in una sola
 * stagione di una sola competizione, e il novantacinquesimo percentile e' 22: dieci per
 * pagina tengono la lista leggibile sul telefono senza nascondere niente.
 *
 * **Nessuna richiesta nuova al livello dati.** Le gare arrivano gia' dalla pagina, che le ha
 * lette una volta sola: qui si ordinano e si impaginano in memoria, senza un giro in piu'.
 */

const PER_PAGINA = 10;

const GIORNO: Intl.DateTimeFormatOptions = {
  day: "numeric", month: "short", timeZone: "Europe/Rome",
};

type Colonna = "quando" | "falli" | "gialli" | "rossi";

const INTESTAZIONI: readonly { readonly chiave: Colonna; readonly nome: string }[] = [
  { chiave: "quando", nome: "Data" },
  { chiave: "falli", nome: "Falli" },
  { chiave: "gialli", nome: "Gialli" },
  { chiave: "rossi", nome: "Rossi" },
];

function giorno(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "data non nota"
    : data.toLocaleDateString("it-IT", GIORNO);
}

/** Un'assenza sta in fondo comunque si ordini: non e' uno zero, e non ne prende il posto. */
function confronta(a: number | null, b: number | null, crescente: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return crescente ? a - b : b - a;
}

type Props = {
  readonly gare: readonly GaraDiretta[];
  readonly competizione: string;
  readonly stagione: string;
};

export function ArbitroGare({ gare, competizione, stagione }: Props) {
  const [colonna, setColonna] = useState<Colonna>("quando");
  const [crescente, setCrescente] = useState(false);
  const [pagina, setPagina] = useState(0);

  const ordinate = useMemo(() => {
    const copia = [...gare];
    copia.sort((a, b) => colonna === "quando"
      ? (crescente ? a.quando.localeCompare(b.quando) : b.quando.localeCompare(a.quando))
      : confronta(a[colonna], b[colonna], crescente));
    return copia;
  }, [gare, colonna, crescente]);

  const pagine = Math.max(1, Math.ceil(ordinate.length / PER_PAGINA));
  const corrente = Math.min(pagina, pagine - 1);
  const daVedere = ordinate.slice(corrente * PER_PAGINA, corrente * PER_PAGINA + PER_PAGINA);
  const primo = corrente * PER_PAGINA + 1;
  const ultimo = corrente * PER_PAGINA + daVedere.length;

  function ordinaPer(chiave: Colonna) {
    // Ricliccare la stessa colonna gira il verso; cambiarla riparte dal piu' alto, che e'
    // quello che si cerca quando si ordina per falli o cartellini.
    if (chiave === colonna) setCrescente((era) => !era);
    else { setColonna(chiave); setCrescente(false); }
    setPagina(0);
  }

  return (
    <>
      <h3 className="ref-sub">
        Le gare in {competizione}, stagione {stagione}
        <span className="ref-campione">
          la stessa competizione della scheda · {ordinate.length}{" "}
          {ordinate.length === 1 ? "gara" : "gare"}
        </span>
      </h3>

      <div className="ref-table-wrap">
        <table className="ref-table ref-table-gare">
          <caption className="sr-only-heading">
            Le gare dirette in {competizione} nella stagione {stagione}, con falli e cartellini
          </caption>
          <thead>
            <tr>
              {INTESTAZIONI.map((i) => (
                <th key={i.chiave} scope="col"
                  aria-sort={colonna === i.chiave
                    ? (crescente ? "ascending" : "descending") : "none"}>
                  <button type="button" className="ref-ordina" onClick={() => ordinaPer(i.chiave)}>
                    {i.nome}
                    <span aria-hidden="true" className="ref-freccia">
                      {colonna === i.chiave ? (crescente ? "↑" : "↓") : "↕"}
                    </span>
                    <span className="sr-only-heading">
                      {colonna === i.chiave
                        ? `ordinata ${crescente ? "dal più basso" : "dal più alto"}, tocca per girare`
                        : "tocca per ordinare"}
                    </span>
                  </button>
                </th>
              ))}
              {/* Risultato e partita non si ordinano: ordinare per punteggio non risponde a
                  nessuna domanda su come ha diretto. */}
              <th scope="col">Risultato</th>
              <th scope="col">Partita</th>
            </tr>
          </thead>
          <tbody>
            {daVedere.map((g) => (
              <tr key={`${g.quando}-${g.casa}`}>
                <th scope="row" className="ref-data">{giorno(g.quando)}</th>
                <td data-label="Falli" className="ref-num">
                  {g.falli === null ? "—" : g.falli}
                </td>
                <td data-label="Gialli" className="ref-num">
                  {g.gialli === null ? "—" : g.gialli}
                </td>
                <td data-label="Rossi" className="ref-num">
                  {g.rossi === null ? "—" : g.rossi}
                </td>
                <td data-label="Risultato" className="ref-num">
                  {g.golCasa === null || g.golTrasferta === null
                    ? <span className="ref-campione">non consolidato</span>
                    : `${g.golCasa}-${g.golTrasferta}`}
                </td>
                <td data-label="Partita" className="ref-comp">{g.casa} - {g.trasferta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagine === 1 ? null : (
        <nav className="ref-pagine" aria-label="Pagine delle gare">
          <button type="button" className="ref-pagina-btn"
            onClick={() => setPagina(corrente - 1)} disabled={corrente === 0}>
            <span aria-hidden="true">←</span>
            <span className="sr-only-heading">Pagina precedente</span>
          </button>
          <span className="ref-pagine-stato" aria-live="polite">
            {primo}-{ultimo} di {ordinate.length}
          </span>
          <button type="button" className="ref-pagina-btn"
            onClick={() => setPagina(corrente + 1)} disabled={corrente >= pagine - 1}>
            <span aria-hidden="true">→</span>
            <span className="sr-only-heading">Pagina successiva</span>
          </button>
        </nav>
      )}
    </>
  );
}
