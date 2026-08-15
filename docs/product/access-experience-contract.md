# Contratto esperienza di accesso IQstatS

## Problema osservato

La dashboard `/partite` dipende da catalogo e gare protetti da Supabase Auth ed
entitlement. Lo stato anonimo non deve essere trasformato in un campo `leagueId`: un ID
del provider non è conoscenza richiesta all'utente e non risolve l'assenza di sessione.

## Stati e azioni

| Stato server | Contenuto visibile | Azione primaria |
| --- | --- | --- |
| `unauthenticated` | spiegazione breve e funzioni disponibili dopo l'accesso | `/accedi?next=/partite` |
| `not_entitled` | identità verificata ma piano non abilitato | `/account/billing` |
| catalogo disponibile | data, nome campionato e stato | ricerca GET `/partite` |
| errore temporaneo | causa generica senza dettagli della fonte | ricarica `/partite` |

## Accesso passwordless

`/accedi` usa due passaggi progressivi: raccoglie l'email e chiama l'API interna
`POST /api/auth/email-code` soltanto dopo un invio esplicito; quindi raccoglie il codice
temporaneo a 6 cifre e lo invia a `POST /api/auth/email-code/verify`. Soltanto i Route
Handler invocano Supabase `signInWithOtp` e `verifyOtp`. URL e chiavi Supabase non sono
richiesti dal componente, mentre la sessione viene persistita in cookie SSR dal server.
Il template email usa `{{ .Token }}`: l'utente può leggere il codice su un altro
dispositivo e non dipende da redirect `localhost`. L'interfaccia non concede entitlement
e non comunica direttamente con il provider calcistico.

## Verifica richiesta

- input email e codice etichettati, autocomplete e messaggio `aria-live`;
- pulsanti disabilitati durante invio/verifica e stati di esito leggibili;
- codice numerico di 6 cifre, temporaneo, mai inserito in URL o log;
- `next` limitato a un percorso locale assoluto, mai URL esterno;
- anonimo senza filtro tecnico; autenticato con catalogo a nomi;
- typecheck, lint, build e controllo browser responsive prima della consegna.
