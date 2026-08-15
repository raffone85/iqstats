# Override pagina — Partite

## Scopo

`/partite` è la dashboard operativa dell'MVP: l'utente filtra data, campionato e stato,
legge solo risultati normalizzati e apre un dossier. Paese, disponibilità e mercato non
sono esposti come filtri finché non sono contratti API mappati.

## Gerarchia e comportamento

1. Intro con limite esplicito: l'interfaccia non ricostruisce dati o segnali.
2. Se la sessione è autorizzata, form GET server-side con data e campionato scelto per
   nome dal catalogo; l'ID tecnico non è mai richiesto all'utente.
3. Se la sessione non è autenticata, il form non viene mostrato: una call to action
   conduce al flusso email di accesso e anticipa chiaramente cosa si sblocca.
4. Accesso non incluso, rate limit, errore/assenza e lista popolata hanno causa e azione
   di recupero distinte. Nessun errore di accesso viene presentato come errore del form.
5. Ogni riga mantiene query di data/campionato/stato nel link al dossier; il ritorno
   ripristina i filtri senza `location.replace` o stato client nascosto.
6. Provenienza, acquisizione e copertura appaiono sopra la lista; una copertura parziale
   resta un avviso, non un valore sintetico.

## Layout

- Mobile: card a una colonna, nessuno scroll orizzontale; bottom navigation con unica
  destinazione mappata e spazio riservato sotto il contenuto.
- Desktop: lista compatta a sei colonne con densità dashboard; hover non sposta il layout.
- Tutti i campi e i controlli interattivi hanno altezza minima 44 px, focus visibile e
  corpo testo di almeno 16 px.

## Dati vietati

Nessun fallback demo, quota, segnale, paese o mercato non normalizzato. Dati mancanti non
diventano `0`, trattini equivalenti a valori o suggerimenti di previsione.

## Criteri di accettazione accesso

- L'utente anonimo vede subito perché la pagina non contiene gare e come accedere.
- La pagina di accesso mostra prima l'email e poi il codice OTP a 6 cifre, con recupero
  esplicito per codice scaduto o indirizzo errato; non richiede di aprire link sullo
  stesso dispositivo.
- La sessione senza entitlement riceve un percorso verso i piani, non un campo tecnico.
- Il catalogo non disponibile non degrada mai a un input numerico del provider.
- Nessuna azione invia email finché l'utente non conferma esplicitamente il form.
