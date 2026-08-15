# Gestione dei segreti

## Regole

- Le credenziali BSD, Groq, Stripe e Supabase sono configurate solo in `apps/api/.env.local`.
- `.env.local` è ignorato da Git; esiste solo `.env.example` senza valori.
- Il token non viene inserito in browser, bundle client, log, documenti, test fixture o screenshot.
- Il gateway server-side aggiunge l'header di autenticazione verso il provider.
- `SUPABASE_SERVICE_ROLE_KEY`, token BSD, chiavi Groq e segreti Stripe restano strettamente server-side; non usare mai prefissi `NEXT_PUBLIC_` per questi valori.
- Errori e telemetria devono redigere header e valori di ambiente.

## Verifica locale

1. Esiste `apps/api/.env.local` con tutte le variabili richieste non vuote.
2. `git status --ignored` mostra il file come ignorato.
3. Una chiamata server-side riesce senza che il token compaia nei log.

## Rotazione

Quando un token viene rigenerato, aggiornare soltanto il file locale e riavviare il runtime server. Non è necessario modificare il repository.
