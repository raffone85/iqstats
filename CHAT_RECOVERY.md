# LineaX - recupero completo del contesto conversazionale

## Provenienza e affidabilita

Questo recupero deriva dalla sessione Codex originale identificata come `019f7f6d-df94-7d33-9a15-1dfda7eb6486`, iniziata il 20 luglio 2026. Il log locale originale contiene 291 messaggi (`96` utente, `174` assistente e `21` istruzioni di ambiente) e quattro eventi di compattazione. La compattazione non ha cancellato il transcript: il suo contenuto e stato riletto e ricostruito qui in forma operativa.

Il log grezzo non viene copiato nel progetto perche contiene anche istruzioni di sistema, output tecnici e potrebbe includere dati privati. Questo file conserva invece le decisioni, le richieste, gli esiti e gli impegni necessari a proseguire il lavoro. Per requisiti tecnici approfonditi consultare i documenti collegati alla fine.

## 1. Mandato originario dell'utente

LineaX deve essere un prodotto enterprise, scalabile e mantenibile di analisi statistica calcistica pre-match e supporto decisionale basato su dati reali e modelli proprietari.

L'utente ha richiesto che l'agente agisca contemporaneamente da CTO, architetto software/database/API, senior full-stack, product manager, UX/UI designer, AI engineer, QA, security e performance engineer.

Regole originarie da mantenere:

- mai inventare dati;
- modifiche minime, non distruttive e compatibili con l'architettura;
- nessun codice duplicato, ogni componente con responsabilita singola;
- mobile-first, query progettate per milioni di record, cache e rendering efficienti;
- testing di bug, edge case, regressioni, performance e sicurezza;
- prima di una nuova implementazione: comprendere, chiarire se necessario, valutare architettura/database/API/UX/UI, scrivere piano e ottenere approvazione;
- file completi, niente placeholder, TODO o pseudocodice.

L'utente aveva chiesto come fondazione permanente: `CLAUDE.md`, `PROJECT_RULES.md`, `ARCHITECTURE.md`, `DATABASE.md`, `UI_SYSTEM.md`, `SKILLS.md`, `WORKFLOW.md` e `ROADMAP.md`. Sono presenti alla radice.

## 2. Decisioni di prodotto confermate

### Posizionamento

- LineaX e **Data Intelligence Sportiva**, non una piattaforma di scommesse.
- Mostra dati, probabilita, analisi e motivazioni; la scelta resta sempre dell'utente.
- Il nome precedente del provider non deve comparire nella UI: la dicitura lato utente e soltanto **Data Opta**.
- L'utente ha inizialmente valutato un link affiliato Fastbet ma ha poi confermato l'esclusione completa. Non aggiungere affiliazioni, CTA bookmaker o incentivi di registrazione.

### Dati e AI

- Provider: documentazione football Data Opta; utilizzare tutti gli endpoint football v2 gratuiti pertinenti, evitando v1 duplicata, endpoint `internal` e altri sport.
- Il token provider e server-only. Il browser non deve riceverlo.
- Groq e previsto per un chatbot che risponde a domande specifiche sulla partita usando esclusivamente le informazioni disponibili in LineaX.
- L'utente ha chiesto infortuni, indisponibili, probabili formazioni e formazioni ufficiali. La fonte verificata e `events/{id}/lineups/`: non usare `incidents` per le indisponibilita pre-match.
- Quote, value, combinazioni e stake sono stati richiesti dall'utente come soli indicatori informativi. L'implementazione deve rimanere non prescrittiva, con rischio, incertezza, metodo, timestamp e limiti espliciti; non usare linguaggio come "gioca", "sicuro", "garantito" o "stake consigliato".

### Piattaforma, lingua e monetizzazione

- Lancio PWA web; app store/native in futuro.
- Italiano lingua nativa; inglese e spagnolo futuri.
- Piani decisi: prova EUR 1 per 8 giorni senza rinnovo automatico, Insight EUR 6,90/mese, Pro EUR 12,90/mese, Annuale EUR 109,90/anno.
- Dopo la prova i contenuti premium si bloccano, mentre profilo e dati personali restano disponibili.
- Stripe e il canale di pagamento PWA; Supabase e il sistema previsto per Auth, database, RLS, catalogo/caching e entitlement.

## 3. Perimetro funzionale esplicito richiesto

L'elenco completo fornito dall'utente e stato recuperato e consolidato in `PRODUCT_SCOPE.md`. E vincolante per la roadmap.

Le aree richieste sono:

1. **Home dashboard:** partite del giorno, analisi contestuale, segnali statistici, xG, tiri, tiri in porta, corner, falli, cartellini, fuorigioco, classifica, meteo, arbitro, disponibilita, value/quote quando verificabili, scoreline modellata, approfondimento editoriale e navigazione verso la partita.
2. **Match Center:** confronto completo casa/trasferta, xG/xGA, goal, clean sheet, BTTS, linee goal, HT/FT, forma, H2H, tiri, possesso, corner, falli, cartellini, fuorigioco, parate, formazioni, indisponibili, meteo e arbitro.
3. **Expected Stats Model premium:** expected goals, corners, cards, shots, shots on target, saves, offsides e fouls per casa, trasferta e totale, piu intervalli/confidenza/versione del modello.
4. **Analisi AI:** probabilita W/D/L, goal, BTTS, over 2.5, clean sheet, upset, high-risk score e spiegazione ancorata ai dati.
5. **Database squadre:** rosa, indisponibili, formazione, home/away, H2H, trend, arbitro e fixture.
6. **Database giocatori:** gol, assist, xG/xA, tiri, cartellini, falli subiti, trend e probabilita giocatore spiegate.
7. **Smart Filter:** competizione, quota se disponibile, expected metrics, valore metodologico, contenuto premium e altri filtri efficienti.
8. **Alert pre-match:** formazioni, cambio arbitro, infortunio last minute, movimento quota, aggiornamenti modello e dati della gara, sempre con consenso utente.
9. **Chatbot AI:** analisi tecnica della singola gara, modello, rischio/incertezza, motivazioni, fonti e dati mancanti.
10. **Premium:** profondita analitica, filtri, confronti, trend, storico quote e briefing, non "pronostici VIP".
11. **Admin:** utenti, abbonamenti, scadenze, email, Telegram opzionale, notifiche, CRM, ricavi, analytics, salute sync/cache e audit.

## 4. Direzione grafica approvata

Il primo prototipo Figma e stato esplicitamente rifiutato dall'utente: troppo freddo, robotico e "AI dashboard". Non tornare a quel linguaggio e non usare Figma per imporre una nuova direzione.

La baseline approvata e la schermata mobile di riferimento condivisa dall'utente:

- home scura, cinematografica ed editoriale;
- fotografia reale dello stadio nel hero quando disponibile;
- match protagonista con club, competizione, data, ora e venue;
- arbitro designato e, quando gia calcolate e spiegabili, medie falli/cartellini;
- meteo e stato disponibilita/formazioni;
- storia tecnica con i due allenatori e loro immagini;
- marcatori probabili/trend disciplina come moduli futuri basati su dati;
- programma partite e analisi del giorno;
- navy quasi nero, rosso/vermilion, blu, oro/avorio controllato, tipografia editoriale.

Regola fondamentale: immagini di stadio, loghi, giocatori e manager devono arrivare dagli endpoint ufficiali provider; una visuale generica e ammessa soltanto come fallback esplicitamente editoriale, mai attribuita alla partita/entita reale.

## 5. Cronologia delle decisioni e del lavoro

### Architettura e primo percorso Flutter

- L'utente ha approvato la prima architettura e il pacchetto documentale.
- Flutter e stato installato sul PC dell'utente e `flutter doctor` ha confermato il runtime; mancavano soltanto SDK Android/Visual Studio per destinazioni non web.
- Il prototipo Flutter ha poi sofferto di porte confuse (`8080`, `8090`), pagine bianche e schermate di configurazione invece del prodotto. L'utente ha richiesto espressamente il passaggio a JS/Node.
- Decisione registrata in `ADR-001-web-stack.md`: Flutter rimane preservato in `apps/lineax`, ma non e il client attivo.

### Supabase e Stripe

- L'utente ha confermato che il progetto Supabase corretto e **StatsIQ** (non IQStats) e ha configurato segreti server-side senza incollarli nella chat.
- Sono state predisposte tabelle/contratti per profili, abbonamenti, cache e catalogo endpoint; controllare sempre lo stato reale nel dashboard Supabase prima di dichiarare una migrazione completata.
- Esistono funzioni Edge legacy per proxy dati e avvio checkout; la destinazione architetturale e Next/Node.
- L'utente ha creato prodotti/prezzi Stripe, ha chiesto controllo di inversioni di prezzo e immagini dei quattro piani. Non si puo verificare il contenuto corrente della dashboard Stripe dal filesystem: la nuova integrazione Node deve essere implementata e testata con Price ID corretti e webhook firmato.
- Sono state richieste quattro grafiche Stripe ispirate alla logica visuale di Powerstats, con dimensione inferiore a 1,9 MB. Non assumere che asset esterni o dashboard Stripe siano ancora disponibili: verificarli prima di riusarli.

### Migrazione Next.js/Node

- L'utente ha chiesto espressamente di abbandonare Flutter e preferisce JS/Node.
- L'app attiva e ora `apps/lineax-web`, Next.js 16.2.10 + TypeScript + React 19, sulla porta `3100`.
- Supabase gestisce auth/DB; il provider e raggiunto solo tramite route handler server-side; Stripe/Groq sono server-side futuri.
- Login, signup, conferma email/callback, profilo e logout sono stati aggiunti.
- Il gateway Node usa il catalogo centrale degli endpoint, evitando liste duplicate nel client.
- Il token provider ha funzionato dopo l'inserimento in `.env.local`; il parser e stato corretto perche gli eventi reali sono paginati con `results`, non un array diretto.
- Sono stati verificati feed reali e risposta della dashboard; non usare piu le porte Flutter.

### Provider, immagini e catalogo

- Il provider v2 e stato analizzato in profondita, inclusa la documentazione interattiva Chrome, dopo l'abilitazione dell'estensione richiesta.
- Sono stati aperti i gruppi Bookmakers, Broadcasts, Events, Players, Leagues, Managers, Odds, Predictions, Referees, Social, Teams, TV Channels, Venues e World Cup.
- Il risultato e `DATA_OPTA_ENDPOINT_CATALOG.md`: 64 endpoint REST v2 verificati, piu 5 endpoint immagine statici.
- Endpoint immagini verificati: `/img/team/{id}/`, `/img/league/{id}/`, `/img/player/{id}/`, `/img/manager/{id}/`, `/img/venue/{id}/`.
- La home valida server-side la disponibilita effettiva dell'immagine e sceglie una partita del giorno con foto venue quando possibile. Un `404` e un normale stato del provider e non autorizza un'immagine fittizia.

### Errori precedenti e lezione operativa

- In passato e stata promessa una dashboard prima di averla realmente consegnata, generando frustrazione. Non ripetere aggiornamenti generici: mostrare una pagina funzionante, con URL e verifica, solo dopo build/browser check.
- Il prodotto visibile e prioritario rispetto a infrastruttura, Stripe o integrazioni non necessarie alla schermata in corso.
- L'utente ha gia approvato architettura, stile e ordine generale; chiedere conferma solo per una scelta che cambia prodotto, costi, diritti o dati, non per ogni micro-passaggio.

## 6. Stato tecnico corroborato al recupero

- App attiva: `apps/lineax-web`.
- Porta locale: `http://localhost:3100`.
- Health endpoint: `/api/health` restituisce stato configurazione senza segreti.
- `npm run lint` e `npm run build` sono passati nell'ultima verifica.
- `npm audit --omit=dev --json` aveva riportato zero vulnerabilita di produzione dopo override mirato PostCSS.
- La home usa dati reali, asset provider, manager, arbitro/meteo/formazioni se disponibili, fallback editoriale dichiarato e lista partite del giorno.
- Il Match Center completo, i read model, la PWA installabile, Stripe Node/webhook, Groq e admin restano incompleti.
- Il repository annidato `apps/lineax-web` ha modifiche non committate; non eseguire operazioni Git distruttive.

## 7. Priorita recuperate e ancora valide

1. Rifinire e verificare visualmente la home nel browser mobile reale, non soltanto via build.
2. Costruire il Match Center con dati e stati di indisponibilita reali.
3. Rendere entitlement subscription difensivo e verificabile con RLS + filtro esplicito per utente.
4. Ridurre i `HEAD` immagini a freddo con cache/read model.
5. Implementare PWA reale: manifest, icone e service worker.
6. Implementare Stripe Node e webhook, poi piani e blocchi premium.
7. Preparare storage/sync/read models e modello expected stats valutato.
8. Integrare Groq match-scoped con fonti/citazioni e guardrail.
9. Aggiungere team/player, filtri, alert, localizzazione e admin secondo roadmap.

## 8. Documenti da leggere prima di una modifica

- `HANDOFF.md`: stato immediato, runbook, verifiche e rischi.
- `PRODUCT_SCOPE.md`: perimetro funzionale richiesto dall'utente, incluso l'inventario inizialmente perso.
- `PROJECT_RULES.md`: confini del prodotto e regole dati/linguaggio.
- `ARCHITECTURE.md`, `DATABASE.md`, `ROADMAP.md`, `UI_SYSTEM.md`, `WORKFLOW.md`.
- `DATA_OPTA_ENDPOINT_CATALOG.md`: contratti endpoint, cache e mapping modulo.
- `apps/lineax-web/AGENTS.md`: obbligatorio prima di modificare Next.

Questo file e la memoria conversazionale operativa; non sostituisce i documenti tecnici specifici sopra elencati.
