// Quanto regge una media, detto in due parole.
//
// **Perche' serve.** Le letture legate alla stagione guardano solo l'anno in corso, e a
// settembre il campione e' magro: sulle gare dei prossimi tre giorni sono in media 7,2
// gare per squadra. Lo stesso numero a novembre vale il doppio, e chi legge non ha modo
// di saperlo se accanto c'e' solo «7 gare».
//
// **Perche' queste soglie.** L'errore di una media cala come la radice del campione, e
// misurato sull'archivio lo scarto medio fra la media su n gare e la media vera della
// squadra e' 2,10 punti a 4 gare, 1,38 a 10, 1,08 a 15 e 0,83 a 20 per la linea
// difensiva - 446 squadre con almeno trenta gare. Da 4 a 15 l'errore si dimezza; per
// dimezzarlo ancora servirebbero 60 gare. La 15a e' dove la curva si appiattisce, ed e'
// per questo che oltre non si aggiungono gradini.
//
// **Che cosa conta come gara.** Il campione effettivo di quella sezione, non la giornata
// di campionato: la giornata la sovrastima di circa il 40% - alla 26a le gare in archivio
// sono 15,8 - non esiste in coppa, e non vuol dire niente quando si guarda oltre la
// stagione in corso.

/** Le soglie, in gare. Sotto la prima la sezione non si mostra affatto. */
export const SOGLIA_MINIMA = 4;

/**
 * L'etichetta per un campione, o `null` sotto la soglia minima: li' non c'e' una media
 * da qualificare, c'e' una sezione che non deve comparire.
 */
export function affidabilita(gare: number): string | null {
  if (gare < SOGLIA_MINIMA) return null;
  if (gare < 10) return "affidabilità bassa";
  if (gare < 15) return "affidabilità medio-alta";
  return "statistica solida";
}
