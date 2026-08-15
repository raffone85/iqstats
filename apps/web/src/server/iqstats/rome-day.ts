// Server-only: il taglio del giorno del prodotto. Gli orari si mostrano in ora italiana,
// quindi anche i giorni si dividono così; la fonte invece divide in ora universale.
// Vive in un file solo perché la regola non deve poter divergere fra elenco e conteggi.
import "server-only";

/** Giorno italiano (YYYY-MM-DD) di un istante ISO, o null se l'istante non è leggibile. */
export function romeDayOf(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

/**
 * Giorno universale precedente. Il giorno italiano comincia quando in universale è ancora
 * il giorno prima, quindi una finestra di due giorni universali contiene di sicuro l'intero
 * giorno italiano richiesto.
 */
export function previousUtcDay(dateIso: string): string {
  const dayBefore = new Date(new Date(dateIso).getTime() - 86_400_000);
  return dayBefore.toLocaleDateString("en-CA", { timeZone: "UTC" });
}

/**
 * Giorno universale successivo. Serve dove il limite superiore della fonte è escluso:
 * sulle letture del modello `date_to` non comprende il giorno indicato, sulle gare sì.
 * Verificato il 15 agosto 2026: stessa competizione, stesso giorno, zero letture contro
 * nove gare, e le letture ricompaiono tutte spostando il limite al giorno dopo.
 */
export function nextUtcDay(dateIso: string): string {
  const dayAfter = new Date(new Date(dateIso).getTime() + 86_400_000);
  return dayAfter.toLocaleDateString("en-CA", { timeZone: "UTC" });
}
