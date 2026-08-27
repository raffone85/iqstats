# IQstatS — istruzioni per Claude Code

@AGENTS.md
@CONTEXT_HANDOFF_POLICY.md

## Gerarchia delle fonti

1. Codice e configurazione nel repository — stato reale dell'implementazione.
2. Documentazione del repository (`docs/`, `tasks/`, `design-system/`) — specifiche e
   decisioni documentate.
3. Second Brain (`C:\Users\utente\IQStats-SecondBrain`) — contesto, architettura,
   decisioni, problemi aperti, roadmap, storia e collegamenti tra conoscenze.

In caso di conflitto vince il repository per lo stato del codice: dichiarare la
discrepanza, non inventare, e proporre l'aggiornamento della nota del vault.

## Second Brain

Vault già inizializzato, puntato da `.claude-obsidian.json` in questa root. Non
copiarlo nel repository e non leggerlo tutto: entrare da `wiki/index.md` e aprire
solo le note pertinenti.

Consultarlo prima di lavori sostanziali su: architettura, database e Supabase,
pipeline dati, motore statistico/predittivo, API e integrazioni, frontend/UI,
roadmap, decisioni architetturali, problemi aperti, TODO, funzionalità già
esistenti, vincoli progettuali, lavoro precedente e motivazioni di decisioni prese.
Consultarlo anche a inizio sessione quando manca contesto sul lavoro già fatto.

Punti d'ingresso: `wiki/index.md`, `wiki/hot.md`, `wiki/problemi-aperti.md`,
`wiki/roadmap.md`, `wiki/backlog-e-todo.md`, `wiki/decisions/`, `wiki/modules/`,
`wiki/flows/`.

## Scrittura nel Second Brain

Usare solo le skill claude-obsidian (`/wiki-ingest`, `/save`), mai `Write`/`Edit`
diretti sul vault: ogni operazione deve produrre una transazione
`claude-obsidian.transaction.v1` ispezionabile e recuperabile. Nessun commit
automatico del vault.

Registrare: nuova decisione architetturale, modifica significativa
dell'architettura, milestone completata, nuovo problema aperto, risoluzione di un
problema, modifica della pipeline, modifica dello schema database, modifica
significativa del motore predittivo, nuova integrazione, cambiamento di roadmap.

Non registrare: dettagli temporanei, output banali, log, codice completo,
informazioni duplicate, segreti, credenziali, token, valori di `.env.local`.

Prima di scrivere: verificare le note esistenti e aggiornare quella pertinente
invece di crearne una nuova, mantenere i wikilink, indicare il percorso repository
come fonte, distinguere fatti verificati, decisioni, ipotesi e informazioni non
verificate.

## Skill permanenti del progetto

Ponytail, Caveman e Wiki/Obsidian fanno parte del workflow, non sono opzionali.

**Ponytail — contesto e token.** Letture mirate; non aprire file o directory che non
servono; non ripetere informazioni già in contesto; niente output lunghi che non
aggiungono valore; per il contesto già consolidato interrogare il Second Brain
invece di ricostruirlo dal repository. Mai sacrificare accuratezza o verifiche
necessarie per risparmiare token.

**Caveman — codice.** Semplice, diretto, minimo livello di astrazione necessario:
niente over-engineering, niente boilerplate inutile, niente complessità senza
motivo; leggibile e manutenibile. Caveman NON elimina type safety, validazioni,
gestione degli errori, sicurezza, test, contratti API, separazione architetturale
già stabilita. Non semplificare violando decisioni già documentate nel repository o
nel Second Brain (`wiki/decisions/`).

**Wiki/Obsidian.** Usare solo la famiglia claude-obsidian (`/wiki`, `/wiki-query`,
`/wiki-ingest`, `/save`, `/wiki-lint`): il vault è in formato claude-obsidian, i
comandi omonimi del plugin `llm-wiki` scriverebbero in una struttura diversa.

**Gerarchia operativa.** 1) repository = stato reale del codice; 2) Second Brain =
memoria persistente e contesto architetturale; 3) Ponytail = meno contesto, letture
e output inutili; 4) Caveman = implementazioni semplici e dirette. In caso di
conflitto: correttezza e sicurezza > vincoli architetturali del progetto >
semplicità del codice > ottimizzazione dei token. Nessuna modifica applicata solo
perché una skill la suggerisce.

## Segreti

Mai leggere, copiare o esporre `.env`, `.env.local`, API key, token, password,
credenziali, cookie o materiale sensibile. Mai inserirli nel Second Brain.
