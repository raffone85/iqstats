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

/**
 * La media di una colonna sulle gare elencate, con il campione che ha davvero.
 *
 * Serve al riscontro: chi legge «5,72 gialli a partita» piu' sopra deve poter contare le
 * righe e ritrovarcelo. Le gare senza il dato non entrano nel conto e non diventano zeri,
 * quindi il campione della media puo' essere piu' corto dell'elenco, e allora si dichiara.
 */
function mediaColonna(gare: readonly GaraDiretta[], quale: "falli" | "gialli" | "rossi") {
  const buoni = gare.map((g) => g[quale]).filter((v): v is number => v !== null);
  return {
    media: buoni.length === 0 ? null : buoni.reduce((a, b) => a + b, 0) / buoni.length,
    campione: buoni.length,
  };
}

/**
 * Le due medie per lato in coda alla colonna, sulle stesse gare della media del totale.
 *
 * **Non e' la meta' del totale.** Un arbitro puo' fischiare tredici falli a partita e darne
 * otto contro chi gioca in casa: il totale lo nasconde, questi due numeri no. Si contano
 * solo le gare che portano **entrambi** i lati, per la stessa ragione per cui il totale di
 * gara si prende solo con le due righe: meta' dato darebbe una media dimezzata senza dirlo.
 */
function MediaPerLato({
  gare,
  quale,
}: Readonly<{ gare: readonly GaraDiretta[]; quale: "falli" | "gialli" }>) {
  const chiaveCasa = quale === "falli" ? "falliCasa" : "gialliCasa";
  const chiaveFuori = quale === "falli" ? "falliTrasferta" : "gialliTrasferta";
  const complete = gare.filter(
    (g) => g[chiaveCasa] !== null && g[chiaveFuori] !== null,
  );
  if (complete.length === 0) return null;
  const media = (chiave: "falliCasa" | "gialliCasa" | "falliTrasferta" | "gialliTrasferta") =>
    (complete.reduce((t, g) => t + (g[chiave] ?? 0), 0) / complete.length)
      .toFixed(1).replace(".", ",");
  return (
    <span className="ref-campione">
      casa {media(chiaveCasa)} · fuori {media(chiaveFuori)}
    </span>
  );
}

/** Un'assenza sta in fondo comunque si ordini: non e' uno zero, e non ne prende il posto. */
function confronta(a: number | null, b: number | null, crescente: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return crescente ? a - b : b - a;
}

/**
 * Come si e' diviso quel totale fra le due squadre.
 *
 * **Il totale da solo non dice chi lo ha subito.** Diciassette falli possono essere nove e
 * otto o quattordici e tre, e sono due partite diverse: la seconda dice qualcosa su come
 * l'arbitro ha diretto, la prima no. L'ordine e' lo stesso della colonna «Partita», casa
 * prima, cosi' i due numeri si leggono insieme senza doverli riferire a mente.
 *
 * Sta dentro la cella e non in colonne sue: la tabella ne ha gia' sei, e a schermo stretto
 * diventa una scheda per gara. Quattro colonne in piu' avrebbero rotto entrambe le forme.
 *
 * Senza uno dei due lati non si scrive niente: meta' ripartizione non e' una ripartizione,
 * e un lato mancante non diventa uno zero.
 */
export function PerLato({
  casa,
  fuori,
}: Readonly<{ casa: number | null; fuori: number | null }>) {
  if (casa === null || fuori === null) return null;
  return <span className="ref-campione">casa {casa} · fuori {fuori}</span>;
}

type Props = {
  readonly gare: readonly GaraDiretta[];
  /**
   * La competizione e la stagione a cui l'elenco e' ristretto, oppure `null` per l'elenco
   * intero: nel dossier interessa questo torneo, nella scheda dell'arbitro tutto.
   */
  readonly dentro: {
    readonly competizione: string;
    readonly stagione: string;
  } | null;
};

export function ArbitroGare({ gare, dentro }: Props) {
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
        {dentro === null
          ? "Tutte le gare che ha diretto"
          : `Le gare in ${dentro.competizione}, stagione ${dentro.stagione}`}
        <span className="ref-campione">
          {dentro === null
            ? "ogni competizione, dalla piu' recente"
            : "la stessa competizione di questa gara"}{" "}
          · {ordinate.length} {ordinate.length === 1 ? "gara" : "gare"}
        </span>
      </h3>

      <div className="ref-table-wrap">
        <table className="ref-table ref-table-gare">
          <caption className="sr-only-heading">
            {dentro === null
              ? "Tutte le gare dirette, con falli e cartellini divisi fra le due squadre"
              : `Le gare dirette in ${dentro.competizione} nella stagione ${dentro.stagione},`
                + " con falli e cartellini divisi fra le due squadre"}
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
                  <PerLato casa={g.falliCasa} fuori={g.falliTrasferta} />
                </td>
                <td data-label="Gialli" className="ref-num">
                  {g.gialli === null ? "—" : g.gialli}
                  <PerLato casa={g.gialliCasa} fuori={g.gialliTrasferta} />
                </td>
                <td data-label="Rossi" className="ref-num">
                  {g.rossi === null ? "—" : g.rossi}
                </td>
                <td data-label="Risultato" className="ref-num">
                  {g.golCasa === null || g.golTrasferta === null
                    ? <span className="ref-campione">non consolidato</span>
                    : `${g.golCasa}-${g.golTrasferta}`}
                </td>
                <td data-label="Partita" className="ref-comp">
                  {g.casa} - {g.trasferta}
                  {dentro === null ? (
                    <span className="ref-campione">{g.competizione} {g.stagione}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
          {/* La media di tutte le gare elencate, non della sola pagina che si sta guardando:
              altrimenti cambierebbe girando pagina, e non sarebbe una media di niente. */}
          <tfoot>
            <tr>
              <th scope="row" className="ref-piede">
                Media su {ordinate.length} {ordinate.length === 1 ? "gara" : "gare"}
                {dentro === null ? ", tutte le competizioni" : `, ${dentro.competizione}`}
              </th>
              {(["falli", "gialli", "rossi"] as const).map((quale) => {
                const m = mediaColonna(ordinate, quale);
                return (
                  <td key={quale} data-label={`Media ${quale}`} className="ref-num">
                    {m.media === null ? "—" : m.media.toFixed(2).replace(".", ",")}
                    {m.campione > 0 && m.campione < ordinate.length ? (
                      <span className="ref-campione">su {m.campione}</span>
                    ) : null}
                    {quale === "rossi" ? null : (
                      <MediaPerLato gare={ordinate} quale={quale} />
                    )}
                  </td>
                );
              })}
              <td aria-hidden="true" />
              <td aria-hidden="true" />
            </tr>
          </tfoot>
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
