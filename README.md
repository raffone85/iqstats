# IQstatS

IQstatS è un'applicazione personale di analisi calcistica ispirata alla struttura osservata su BioFootballBet, ma con interfaccia, brand e implementazione originali.

## Stato del repository

La mappatura funzionale di dashboard e dettaglio partita e completata. E disponibile un primo prototipo Next.js con dashboard originale, navigazione al dettaglio di una partita e endpoint diagnostico server-side. I dati visualizzati sono volutamente dimostrativi: l'integrazione BSD verra aggiunta solo tramite adapter server-side tipizzato.

## Struttura

- `apps/web/` - client web e dashboard.
- `apps/api/` - gateway server-side verso provider dati e API dell'app.
- `packages/shared/` - tipi, contratti e calcoli condivisi.
- `docs/` - prodotto, architettura, ricerca e sicurezza.
- `tasks/` - piano e backlog verificabile.
- `tests/` - test per unita, integrazione ed end-to-end.
- `infra/` - configurazione di deploy e servizi.

## Documenti di partenza

- [Mappa del prodotto](docs/product/reference-map.md)
- [Specifica MVP](docs/product/mvp-spec.md)
- [Architettura proposta](docs/architecture/target-architecture.md)
- [Stato dell'implementazione](docs/product/implementation-status.md)
- [Piano](tasks/plan.md)
- [Backlog](tasks/todo.md)
- [Ricerca sulla dispersione](docs/research/calibrazione-dispersione.md)

## Sicurezza

Le credenziali restano esclusivamente nei file `.env.local`, ignorati da Git. Il browser non riceve mai il token del provider dati.
