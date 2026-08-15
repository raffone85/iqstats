# Override pagina — Piani e fatturazione

## Perimetro e contratto

- **URL:** `/account/billing`.
- **Utente:** autenticato; catalogo, subscription ed entitlement restano verificati lato server.
- **Dati mostrati:** campi catalogo sicuri del piano, funzionalità associate e stato del proprietario; nessun identificativo Stripe o segreto raggiunge il browser.
- **Azione:** il client invia soltanto `planCode` alla futura Edge Function `create-checkout-session`; la UI non abilita l&apos;accesso dopo il ritorno dal Checkout.
- **Stati obbligatori:** autenticazione richiesta, catalogo indisponibile, nessun piano attivo, Checkout in apertura, errore Checkout, ritorno annullato e ritorno completato in attesa del webhook.

## Gerarchia

1. Intro: chiarire che i piani regolano l&apos;accesso e che la verifica resta server-side.
2. Stato del ritorno Checkout, se presente, senza trasformarlo in entitlement.
3. Stato accesso attuale del proprietario, quando disponibile.
4. Griglia dei quattro piani: nome, prezzo dal catalogo, cadenza, funzionalità e CTA.
5. Nota finale sull&apos;autorità del webhook.

## Regole visuali

- Usare i token blu/ambra e Fira Sans/Fira Code del master; nessun badge “consigliato”, sconto o claim commerciale non presente nel catalogo.
- Griglia a una colonna su mobile, due a tablet e quattro a desktop; ogni CTA resta larga almeno 44 px e non dipende dal solo colore.
- Le CTA sono client-side solo per il click; la pagina e il catalogo restano Server Components.
- Nessuna animazione aggiuntiva. I feedback usano testo, bordo e ruolo ARIA, nel rispetto di `prefers-reduced-motion`.
