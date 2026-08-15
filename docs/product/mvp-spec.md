# Specifica MVP

## Utente e valore

Un utente autenticato consulta partite, confronta trend e apre un dettaglio
statisticamente spiegabile. Il suo piano determina le funzionalità disponibili tramite
entitlement verificati lato server. Il prodotto non emette scommesse automatiche né
usa token o segreti di provider e pagamenti nel browser.

## Flusso MVP

1. Apertura dashboard con partite del giorno.
2. Filtro per data, nazione, lega e mercato.
3. Lettura rapida di quote, movimenti e indicatori.
4. Apertura dettaglio partita.
5. Consultazione di riepilogo, quote, forma e statistiche per categoria.
6. Visualizzazione di fonti, aggiornamento e dati mancanti.

## Requisiti funzionali

- Ricerca e filtri lato dashboard.
- Snapshot normalizzati di gara, squadre, quote e statistiche.
- Pagina dettaglio con navigazione per categoria.
- Confronto casa/trasferta e ultimo campione di gare.
- Stato vuoto, caricamento, errore provider e assenza dato espliciti.
- Calcoli statistici deterministici e testabili.
- Supabase come sistema di record per Auth, profili, dati applicativi e stato degli
  entitlement.
- Stripe come sistema di pagamento per quattro piani; Checkout, rinnovi e revoche
  aggiornano gli entitlement soltanto tramite eventi server-side verificati.
- Ogni funzione premium dichiara una chiave di entitlement; nascondere un controllo
  nella UI non sostituisce l'autorizzazione lato server.

## Fuori MVP

- Ruoli amministrativi multipli e gestione commerciale avanzata.
- Notifiche automatiche e integrazione bookmaker.
- Predizioni presentate come certezze o automazioni operative.

## Criterio di accettazione del prodotto

Una partita supportata deve poter essere letta dalla dashboard fino al dettaglio senza
rivelare segreti, con timestamp della fonte, quote confrontabili e sezioni statistiche
coerenti. Un utente può accedere soltanto alle funzionalità abilitate dal proprio
entitlement Supabase, derivato da uno stato Stripe verificato e non da input client.
