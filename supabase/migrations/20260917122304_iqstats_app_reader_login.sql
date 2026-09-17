-- Il ruolo di lettura del livello dati diventa un ruolo di login, con i suoi limiti addosso.
--
-- Perche'. Il 17 settembre 2026, in produzione, le connessioni del livello dati arrivavano a
-- Postgres come `postgres` con application_name «Supavisor»: il pooler in session mode non
-- inoltra i parametri di avvio che `lettura.ts` e `runtime.ts` impostano (role,
-- statement_timeout, default_transaction_read_only). Risultato misurato in
-- pg_stat_statements: letture del dossier registrate come `postgres`, massimi da 114 a 120 s
-- (il tetto del server) invece dei 10 s dichiarati nel codice, e il pooler da 15 posti saturo.
--
-- Le impostazioni di ruolo le applica Postgres all'avvio della sessione, qualunque cosa
-- faccia il pooler. Permessi e policy RLS del ruolo esistono gia' nelle migration precedenti
-- (verificati il 17 settembre: 11 tabelle con select, RLS e policy; 3 viste con select).
--
-- La password NON sta qui: si imposta a mano dal pannello, e la connessione di produzione
-- (`IQSTATS_PROJECTION_DATABASE_URL` su Vercel) passa all'utente `iqstats_app_reader.<ref>`.

alter role iqstats_app_reader with login;
alter role iqstats_app_reader set statement_timeout = '10s';
alter role iqstats_app_reader set default_transaction_read_only = on;
alter role iqstats_app_reader set idle_in_transaction_session_timeout = '15s';
