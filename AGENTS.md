# IQstatS — istruzioni operative del progetto

## Identità e perimetro

IQstatS è un unico prodotto di intelligence calcistica: la mappatura funzionale di
BioFootballBet è una fonte di ispirazione, l'app Next.js è l'implementazione originale
e la calibrazione della dispersione è un suo workstream analitico. Non copiare codice,
asset, testi, formule proprietarie o brand del prodotto di riferimento.

LineaX resta un progetto distinto. Non leggere, scrivere o riutilizzare artefatti di
LineaX salvo autorizzazione esplicita dell'utente; le credenziali locali condivise sono
l'unica eccezione già autorizzata.

## Ordine di lettura obbligatorio

1. `CONTEXT_HANDOFF_POLICY.md` e l'eventuale handoff temporaneo più recente indicato
   dall'utente.
2. `docs/workflow.md`
3. `tasks/plan.md` e `tasks/todo.md`
4. `docs/product/information-architecture.md`
5. Il documento del workstream attivo:
   - calibrazione: `docs/research/calibrazione-dispersione.md` e
     `scripts/calibration/discovery/NOTES.md`;
   - app/API: `docs/architecture/target-architecture.md` e
     `docs/product/mvp-spec.md`.

## Regole di esecuzione

- Pianificare prima di implementare: ogni task deve avere contratto dati, criteri di
  accettazione, verifica e checkpoint umano dove indicato.
- Il provider si usa solo lato server. Token, header e valori di `.env.local` non
  compaiono in codice client, log, documenti, patch o output.
- Non inventare dati e non convertire campi mancanti in `0`. Ogni valore mostrato deve
  indicare fonte, freschezza, campione e limiti quando pertinenti.
- Le API esterne vengono prima esplorate e normalizzate in contratti IQstatS; la UI non
  dipende da payload del provider né da etichette proprietarie esterne.
- La calibrazione vive esclusivamente in `scripts/calibration/` e non modifica l'app di
  produzione. Non iniziare il Compito A senza conferma umana alle note del Compito 0.

## Regole UI e gerarchia

- Prima di modificare una pagina, leggere il master in
  `design-system/iqstats-professional/MASTER.md`, il relativo override di pagina se
  presente e `docs/product/information-architecture.md`.
- Usare la skill `ui-ux-pro-max` per ogni nuovo flusso o pagina visibile. Se lo script
  di ricerca non è eseguibile, applicare il fallback documentato nel workflow e non
  spacciare le raccomandazioni generiche per un design approvato.
- Progettare mobile-first, con controlli di almeno 44 px, tastiera e focus visibili,
  contrasto WCAG, nessun overflow orizzontale e stati loading/empty/error espliciti.
- Una sezione della gara appare solo quando il suo contratto dati è disponibile; in caso
  contrario dichiarare copertura assente, non simulare contenuto.

## Verifica e consegna

- Dopo cambiamenti TypeScript/Next.js: leggere `apps/web/AGENTS.md`, eseguire lint e
  build proporzionati al cambiamento.
- Dopo più modifiche TSX: applicare `vercel:react-best-practices`.
- Prima di una consegna UI: verificare a 375, 768, 1024 e 1440 px, navigazione da
  tastiera, contrasto e `prefers-reduced-motion`.
- Aggiornare `tasks/todo.md` e il checkpoint nel workflow soltanto dopo aver eseguito
  le verifiche richieste.
