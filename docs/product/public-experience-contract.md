# Contratto della superficie pubblica IQstatS

## Obiettivo

Presentare IQstatS come servizio digitale di intelligence calcistica educativo e
informativo. La superficie pubblica spiega il metodo, accompagna alla consultazione
delle partite e rende visibili i limiti del prodotto senza trasformare analisi o quote
in consigli, certezze o operazioni di scommessa.

## Perimetro

- Nuove route statiche: `/` e `/metodo`.
- Navigazione aggiornata per raggiungere home, partite, metodo e piani.
- Metadata editoriali e social preview proprietaria del sito.
- Nessuna modifica ai contratti IQstatS, alle API, ai provider, a Supabase, a Stripe o
  alla persistenza dei dati calcistici.

## Contratto dati

| Domanda utente | Fonte | Comportamento |
| --- | --- | --- |
| Che cos'è IQstatS? | Copy editoriale basata su MVP e architettura approvati | Descrive il processo, non mostra metriche o risultati. |
| Quali dati si possono leggere? | Matrice APP-0 e IA | Rimanda alle sole route e sezioni disponibili; nessun valore dimostrativo. |
| Come vengono trattati accesso e pagamenti? | Contratto auth/billing esistente | Dichiara la separazione server-side senza esporre identificativi o segreti. |
| Come vengono trattati privacy e responsabilità? | Architettura esistente e gate di lancio | Dichiara privacy by design e il requisito di una privacy notice completa prima del go-live pubblico; non simula un'informativa legale. |

## Criteri di accettazione

1. La home comunica finalità educativa e informativa, non garantisce risultati e non
   offre operazioni di gioco.
2. Ogni CTA porta a una route esistente e non aggira autenticazione o entitlement.
3. Non sono introdotti dati demo, provider payload, cookie analitici, token o chiavi.
4. Home e Metodo sono utilizzabili con tastiera, mantengono un contrasto adeguato,
   controlli di almeno 44 px e layout senza overflow a 375, 768, 1024 e 1440 px.
5. Build, lint e controlli esistenti restano verdi.

## Checkpoint umano prima del go-live pubblico

Prima di raccogliere dati personali o accettare pagamenti in produzione servono
identità e contatti del titolare, finalità e basi giuridiche, tempi di conservazione,
destinatari/trasferimenti, canale per i diritti interessati, cookie policy e condizioni
commerciali sottoposti a revisione legale. Questo checkpoint non è sostituibile da copy
di prodotto o da una schermata UI.
