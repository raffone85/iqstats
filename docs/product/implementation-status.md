# Stato implementazione

Ultimo aggiornamento: 2 agosto 2026.

## Disponibile

- Shell Next.js originale con navigazione primaria mobile/desktop, skip link, focus e
  reduced motion, senza copiare interfaccia o contenuti del prodotto di riferimento.
- Slice stateless `/partite → /match/[matchId]`: filtri data/campionato/stato,
  lista/dossier da API IQstatS, ritorno che conserva i filtri e stati espliciti. Non
  esiste un fallback dimostrativo nella UI.
- Endpoint server-side `GET /api/health` che conferma lo stato applicativo e la sola
  presenza del token BSD, senza restituirlo.
- Package `packages/shared` con contratti IQstatS e normalizzatori puri per catalogo,
  lista/dettaglio gare, quote, statistiche osservate, classifica, forma compatta e H2H.
- Gateway esclusivamente server-side e sette Route Handler sotto `/api/iqstats/v1`
  per competizioni, gare, quote, statistiche, classifica e H2H.
- Fixture sanificate e report APP-0D per due gare campione, ottenuti con discovery
  mirata e senza harvesting massivo.
- Fondazione Supabase IQstatS su progetto Free: profili, quattro piani, sette feature,
  billing, subscription, entitlement, idempotenza e rate limiting con RLS/grants.
- Supabase SSR con client separati, callback PKCE, refresh cookie, sign-out e
  autorizzazione dentro tutte le route IQstatS.
- Checkout, Customer Portal e webhook Stripe firmato/idempotente implementati lato
  server; quattro prodotti/prezzi sono riconciliati in test mode e mappati in Supabase.

## Verificato

- APP-0 approvato e matrice dati MVP allineata all'evidenza della discovery.
- `packages/shared`: type-check strict e sette test di normalizzazione passati il
  1 agosto 2026.
- 448 quote normalizzate su undici mercati; una pagina incompleta produce copertura
  parziale, non un dataset apparentemente completo.
- Campi mancanti e zeri reali restano distinti; l'ID gara IQstatS non viene sostituito
  dall'`event_id` incoerente osservato in una lista del provider.
- Build e lint dell'app erano passati il 21 luglio 2026; non sono stati rilanciati per
  APP-1 perché nessun file dell'app è stato modificato.
- APP-2: type-check mirato, lint, build Next pulita, 8/8 test gateway, smoke errori e
  scansione dei chunk client passati il 1 agosto 2026.
- Il match reale `7198` attraversa fonte → normalizzatore → Route Handler con HTTP 200,
  ID e provenienza IQstatS preservati.
- UX-0/UX-1/UX-2: master e override sono verificati con `ui-ux-pro-max`; browser a
  375, 768, 1024 e 1440 px senza overflow, con skip link, focus, reduced motion e tema
  chiaro controllati. Il percorso anonimo mostra accesso richiesto prima del provider.
- Il 2 agosto: 8 test gateway, 3 auth e 2 billing passano; lint, typecheck e build
  Next 16.2.12 sono puliti. Lo smoke anonimo restituisce 401 `no-store` prima del
  provider e il webhook senza firma restituisce 400.
- BILL-1: lo script catalogo è idempotente e conferma i quattro piani pronti e mappati
  in test mode. La suite webhook firmata verifica replay, upgrade/downgrade, pagamento
  fallito, cancellazione, ordine eventi, rifiuto live e tentativo cross-user.
- BILL-2: Stripe CLI associato tramite Chrome, signing secret sincronizzato localmente
  e fixture Stripe test consegnata al Route Handler con HTTP 200 osservato sui due lati.
  La suite firmata completa è passata anche dopo la rotazione del secret.
- APP-4/APP-5: il percorso autenticato `/partite → /match/7198` rende lista e dossier
  da envelope normalizzati `no-store`, preserva i filtri e non persiste dati provider.
  Utente, evento billing e stato commerciale temporanei sono stati rimossi.
- Test database transazionali verificano matrice 5/7 feature, replay idempotente,
  ordine eventi, revoca e 60 richieste/minuto sulla lista; ogni transazione è stata
  annullata e tutte le tabelle operative sono tornate a zero.
- Security Advisor Supabase senza rilievi; `npm audit --omit=dev` senza vulnerabilità
  dopo gli override PostCSS 8.5.25 e Sharp 0.35.3.

## Limiti attuali

- Il package condiviso resta collegato al layer server; la UI legge soltanto envelope
  delle API IQstatS e non importa normalizzatori o provider.
- Quote, segnali e statistiche non sono mostrati finché il relativo endpoint non è
  richiesto e coperto; non ci sono valori dimostrativi nella slice.
- Apertura e chiusura quote non sono esposte dalla fonte e non vengono ricostruite.
- La forma disponibile è soltanto la sequenza compatta W/D/L; forma con date,
  avversari e split casa/trasferta non è disponibile.
- AUTH-1 ed ENT-1 sono tecnicamente conclusi: l'E2E autenticato ha verificato cookie
  SSR, negazione anonima, accesso Insight/Pro e logout, con pulizia remota a zero dati
  sintetici.
- L'account test non contiene endpoint webhook persistenti perché non è disponibile un
  URL pubblico IQstatS autorizzato. Lo sviluppo locale usa correttamente il forwarding
  temporaneo del CLI; la chiave live resta rifiutata fail-closed.
- Gli avvisi performance Supabase residui sono solo `unused_index` attesi su tabelle
  vuote; vanno rivalutati con traffico reale, non rimossi preventivamente.

## Prossimo incremento

Il blocco commerciale BILL-1/BILL-2 e la slice APP-4/APP-5 sono chiusi. Non esiste un
incremento successivo autorizzato:

1. mantenere il gateway calcistico stateless `no-store`/TTL 0: APP-3, discovery,
   harvesting e calibrazione non sono autorizzati;
2. creare l'endpoint webhook persistente soltanto insieme a un futuro deploy HTTPS
   esplicitamente autorizzato;
3. aprire APP-6 soltanto con un nuovo contratto dati e un'autorizzazione esplicita.
