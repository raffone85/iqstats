-- Il nome di un giocatore, che finora non stava da nessuna parte.
--
-- **Il difetto.** `football.player_match_observations` ha 479.339 righe e 22.003
-- giocatori distinti, e di ognuno conserva soltanto `player_source_id`. Le pagine che
-- mostrano un giocatore devono quindi portarsi il nome da fuori, una chiamata alla fonte
-- per squadra, e tutto cio' che non passa da una rosa - una classifica di stagione, una
-- scheda giocatore, un marcatore - resta senza nome e quindi non si puo' costruire.
--
-- **Da dove arrivano i nomi, e a costo zero.** Dalle 593 rose gia' archiviate in
-- `scripts/projection/harvest/data/squads/`, raccolte a luglio per il ruolo in campo:
-- 18.776 nomi distinti, nessuna chiamata nuova alla fonte. Misurato il 20 settembre 2026:
-- coprono 16.399 dei 22.003 osservati (74,5%), che pesano l'85,4% delle righe e il
-- **96,1% delle righe delle ultime centoventi giornate**, cioe' quasi tutto quello che
-- l'applicazione mostra.
--
-- **Chi resta fuori resta senza nome, non con un segnaposto.** La rosa e' quella di oggi:
-- chi ha cambiato squadra o ha smesso non compare. Per quei 5.604 identificativi la
-- tavola non ha una riga, e chi legge dichiara l'assenza invece di scrivere «giocatore
-- 12345» come se fosse un nome.
--
-- La tavola e' anagrafica pura: una riga per giocatore, nessun legame con la squadra,
-- che cambia nel tempo ed e' gia' su ogni riga di osservazione.

begin;

create table football.players (
  source_id bigint primary key,
  name text not null,
  -- Quando quel nome e' stato visto sulla fonte: serve a sapere quanto e' vecchio, e a
  -- decidere se vale la pena rileggerlo. Non e' l'istante della scrittura.
  synced_at timestamptz not null default now(),
  constraint players_name_non_vuota check (length(btrim(name)) > 0)
);

alter table football.players enable row level security;

revoke all on football.players from public, anon, authenticated;

grant select, insert, update, delete on football.players to service_role;

grant select on football.players to iqstats_app_reader;

create policy iqstats_app_reader_players_select
  on football.players
  for select
  to iqstats_app_reader
  using (true);

commit;
