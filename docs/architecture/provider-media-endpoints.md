# Provider media endpoints — discovery sanificata

Data: 10 agosto 2026. Micro-discovery autorizzata dall'utente (cap: massimo 3 GET, ≤2
req/s, solo verifica campi media, nessuna scrittura al provider, nessun accesso al DB
remoto, raw solo in memoria, risultato solo sanificato). Letture esterne effettivamente
usate: **1** (pagina di documentazione immagini del provider). Nessun payload grezzo,
token o URL completo è salvato qui.

## Cosa espone il provider (calcio)

| Risorsa | Disponibile | Pattern endpoint (relativo alla base provider) | Formato |
| --- | --- | --- | --- |
| Logo/crest squadra | sì | `{PROVIDER_BASE}/img/team/{id}/` (anche `/api/img/team/{id}/`) | PNG o WebP |
| Badge competizione | sì | `{PROVIDER_BASE}/img/league/{id}/` | PNG o WebP |
| Foto giocatore | sì | `{PROVIDER_BASE}/img/player/{id}/` (per gli altri sport: `/img/<sport>/<type>/<id>/`) | PNG o WebP |

Note dalla doc: le immagini sono un proxy lato provider ("hotlink freely — non serve
scaricare, salvare o ridimensionare"). Nessuna dimensione fissa documentata.

## Autenticazione

Ogni richiesta al provider richiede header `Authorization: Token <API_KEY>`. La chiave
è `BSD_API_TOKEN` in `apps/web/.env.local` (**solo lato server**, mai esposta al client).

## Integrazione IQstatS (contratto)

- I binari immagine **non** vengono esposti col link diretto del provider né col token.
  Passano dal **media-proxy interno** già esistente per gli stemmi squadra
  (`media/team/{id}`, vedi `docs/architecture/media-contract.md`, APP-5M): validazione
  tipo/ID/MIME, redirect, limite binario, `404` che nasconde solo l'elemento decorativo.
- Estensione prevista: aggiungere `media/league/{id}` (badge competizione) con lo stesso
  contratto. Le foto giocatore restano fuori dallo scope MVP finché non serve una sezione
  che le richiede.
- Fallback quando un'immagine non è disponibile: sistema **monogramma** (iniziali), mai
  placeholder inventati o URL diretti della fonte.

## Fuori scope di questa discovery

Non sono stati verificati contenuti dati (rosa, statistiche, quote): la discovery era
limitata ai campi media. La mappatura endpoint dati resta in
`docs/architecture/provider-v2-endpoint-mapping-audit.md`.
