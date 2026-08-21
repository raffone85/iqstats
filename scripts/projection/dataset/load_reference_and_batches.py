"""Innesto dei riferimenti e caricamento dei lotti nel livello dati del motore.

E' il «percorso proprio» deciso il 21 agosto 2026: le osservazioni del motore
alimentano anche `football.matches`, `football.teams`, `football.referees`,
`football.seasons` e `football.competitions`, sulle stesse tavole
dell'applicazione, **senza sovrascrivere nulla di quello che DATA-1 ha gia'
scritto**. Ogni innesto e' `on conflict do nothing`: dove una riga esiste, vince
la sua, con il suo nome vero.

Tre guardie, tutte gia' presenti nello schema e nessuna inventata qui:

- le competizioni nuove entrano con `is_active = false`, e
  `football.app_competition_read_model` filtra `where competition.is_active`;
- le stagioni nuove entrano con `ingest_scope = 'held'`, e
  `football.app_match_read_model` filtra `where season.ingest_scope =
  'product_current'`. Le gare storiche del motore **non compaiono
  nell'applicazione**;
- una gara che nomina una squadra o una stagione sconosciute non viene scritta,
  e `private.apply_projection_observations` rifiuta a sua volta le righe che
  nominano una gara che non c'e'. Nessuna riga viene inventata.

I nomi di competizione, stagione e arbitro sono segnaposto dichiarati, come li
produce `export_reference_local.py`: l'archivio non li porta, le tavole li
vogliono non nulli, il motore non li legge mai.

Non si collega al database: stampa SQL su standard output, perche' l'unico
cliente disponibile ovunque e' `psql` e questo progetto non ha un driver Python
installato. Il flusso e' quello di `pg_dump`, con i dati in linea dopo ogni
`copy ... from stdin`.

Uso:
    python load_reference_and_batches.py <cartella-riferimenti> [--solo-riferimenti]
        | psql "<connessione>" -v ON_ERROR_STOP=1 -f -

    python load_reference_and_batches.py <cartella-riferimenti> --sql <file>
    psql "<connessione>" -v ON_ERROR_STOP=1 -f <file>

La seconda forma esiste per chi non ha una condotta di byte affidabile: PowerShell 5.1
non lo e' su righe da qualche megabyte, e il lotto e' una riga sola.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parents[3]
LOTTI = RADICE / "scripts" / "projection" / "dataset" / "output" / "lotti-osservazioni"

# Le colonne dei CSV prodotti da export_reference_local.py, nell'ordine in cui
# li scrive: la tavola d'appoggio le rispecchia una a una.
APPOGGIO = {
    "competizioni.csv": ("s_competizioni", "source_id bigint, name text"),
    "stagioni.csv": (
        "s_stagioni",
        "competition_source_id bigint, source_id bigint, name text,"
        " season_kind text, starts_on date, ends_on date",
    ),
    "squadre.csv": ("s_squadre", "source_id bigint, name text"),
    "arbitri.csv": ("s_arbitri", "source_id bigint, name text"),
    "gare.csv": (
        "s_gare",
        "source_id bigint, season_source_id bigint, home_team_source_id bigint,"
        " away_team_source_id bigint, referee_source_id bigint,"
        " kickoff_at timestamptz, normalized_status text, round_name text,"
        " home_score smallint, away_score smallint",
    ),
}

INNESTO = """
insert into football.competitions
  (source_id, name, is_active, observed_at, content_checksum)
select source_id, name, false, now(), md5('motore:competizione:' || source_id)
from s_competizioni
on conflict (source_id) do nothing;

insert into football.seasons
  (competition_id, source_id, name, season_kind, starts_on, ends_on,
   is_current, ingest_scope, observed_at, content_checksum)
select c.id, s.source_id, s.name, s.season_kind, s.starts_on, s.ends_on,
       false, 'held', now(), md5('motore:stagione:' || s.source_id)
from s_stagioni s
join football.competitions c on c.source_id = s.competition_source_id
on conflict (competition_id, source_id) do nothing;

insert into football.teams (source_id, name, observed_at, content_checksum)
select source_id, name, now(), md5('motore:squadra:' || source_id)
from s_squadre
on conflict (source_id) do nothing;

insert into football.referees (source_id, name, observed_at, content_checksum)
select source_id, name, now(), md5('motore:arbitro:' || source_id)
from s_arbitri
on conflict (source_id) do nothing;

-- La stagione si risolve con la coppia (competizione, stagione) e non con il
-- solo identificativo di stagione: l'unicita' della tavola e' su quella coppia,
-- e due competizioni potrebbero portare la stessa stagione.
insert into football.matches
  (source_id, competition_id, season_id, home_team_id, away_team_id, referee_id,
   kickoff_at, normalized_status, round_name, home_score, away_score,
   observed_at, content_checksum)
select g.source_id, c.id, st.id, casa.id, ospite.id, arbitro.id,
       g.kickoff_at, g.normalized_status, g.round_name, g.home_score, g.away_score,
       now(), md5('motore:gara:' || g.source_id)
from s_gare g
join s_stagioni ss on ss.source_id = g.season_source_id
join football.competitions c on c.source_id = ss.competition_source_id
join football.seasons st on st.competition_id = c.id and st.source_id = g.season_source_id
join football.teams casa on casa.source_id = g.home_team_source_id
join football.teams ospite on ospite.source_id = g.away_team_source_id
left join football.referees arbitro on arbitro.source_id = g.referee_source_id
on conflict (source_id) do nothing;
"""


def blocco_copia(tavola: str, colonne: str, percorso: Path) -> None:
    """Tavola d'appoggio piu' i dati in linea, nel formato che psql legge da un file."""
    print("create temp table " + tavola + " (" + colonne + ") on commit drop;")
    print("copy " + tavola + " from stdin with (format csv, header true);")
    with open(percorso, "r", encoding="utf-8", newline="") as f:
        sys.stdout.write(f.read().replace("\r\n", "\n"))
    print("\\.")


def blocco_lotto(percorso: Path, giornale: str | None) -> None:
    """Un lotto per volta: la funzione risolve, scrive, rifiuta e riferisce."""
    payload = json.dumps(json.load(open(percorso, encoding="utf-8")), ensure_ascii=False)
    print("create temp table s_lotto (payload jsonb) on commit drop;")
    print("copy s_lotto from stdin;")
    # Formato testo di copy: il solo carattere da proteggere in una riga senza
    # ritorni a capo ne' tabulazioni, che json.dumps non produce, e' la barra.
    sys.stdout.write(payload.replace("\\", "\\\\") + "\n")
    print("\\.")
    print(
        "create temp table s_esito (lotto text, esito jsonb) on commit drop;\n"
        "insert into s_esito select '" + percorso.name + "',"
        " private.apply_projection_observations(payload) from s_lotto;\n"
        "select lotto, esito from s_esito;"
    )
    if giornale is None:
        return
    # I conteggi salgono nel giornale dentro la stessa transazione del lotto: se il
    # lotto non passa, non e' contato. Nessun numero riletto da un'uscita a video.
    print(
        "update private.football_sync_runs set\n"
        "  rows_upserted = rows_upserted + (select ((esito ->> 'teamRowsWritten')::bigint"
        " + (esito ->> 'playerRowsWritten')::bigint) from s_esito),\n"
        "  rows_rejected = rows_rejected + (select ((esito ->> 'teamRowsRejected')::bigint"
        " + (esito ->> 'playerRowsRejected')::bigint) from s_esito),\n"
        "  rows_observed = rows_observed + (select ((esito ->> 'teamRowsWritten')::bigint"
        " + (esito ->> 'teamRowsRejected')::bigint + (esito ->> 'playerRowsWritten')::bigint"
        " + (esito ->> 'playerRowsRejected')::bigint) from s_esito)\n"
        "where id = " + giornale + ";"
    )


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(
            "uso: load_reference_and_batches.py <cartella-riferimenti>"
            " [--solo-riferimenti] [--sql <file>]"
        )
    riferimenti = Path(sys.argv[1])
    opzioni = sys.argv[2:]
    solo_riferimenti = "--solo-riferimenti" in opzioni

    def valore(nome: str) -> str | None:
        if nome not in opzioni:
            return None
        indice = opzioni.index(nome) + 1
        if indice >= len(opzioni):
            raise SystemExit(nome + " vuole un valore")
        return opzioni[indice]

    # L'identificativo della riga gia' aperta in private.football_sync_runs. La riga la
    # apre chi pianifica, prima della raccolta: un fallimento prima del caricamento deve
    # lasciare traccia, e questo script a quel punto non e' ancora partito.
    giornale = valore("--giornale")
    if giornale is not None and not giornale.isdigit():
        raise SystemExit("--giornale vuole l'identificativo numerico della riga")
    if "--sql" in opzioni:
        indice = opzioni.index("--sql") + 1
        if indice >= len(opzioni):
            raise SystemExit("--sql vuole un percorso")
        # Il file lo scrive Python: una condotta di byte in mezzo romperebbe le righe
        # lunghe, e un lotto e' una riga sola da qualche megabyte.
        sys.stdout = open(opzioni[indice], "w", encoding="utf-8", newline="\n")
    else:
        # Lo standard output di Windows e' cp1252 e i ritorni a capo diventerebbero
        # `\r\n`: nel formato testo di `copy` il ritorno finirebbe dentro l'ultimo
        # campo, e i nomi con diacritici non passerebbero affatto.
        sys.stdout.reconfigure(encoding="utf-8", newline="\n")

    mancanti = [nome for nome in APPOGGIO if not (riferimenti / nome).is_file()]
    if mancanti:
        raise SystemExit("riferimenti mancanti: " + ", ".join(sorted(mancanti)))

    print("\\set ON_ERROR_STOP on")
    print("begin;")
    for nome, (tavola, colonne) in APPOGGIO.items():
        blocco_copia(tavola, colonne, riferimenti / nome)
    print(INNESTO)
    print("commit;")

    if solo_riferimenti:
        return

    lotti = sorted(LOTTI.glob("lotto-*.json"))
    if not lotti:
        raise SystemExit("nessun lotto in " + str(LOTTI))
    # Un lotto per transazione: un rifiuto in coda non annulla i lotti gia'
    # scritti, e la scrittura e' idempotente, quindi si riprende da dove si era.
    for lotto in lotti:
        print("begin;")
        blocco_lotto(lotto, giornale)
        print("commit;")

    if giornale is None:
        return
    # La chiusura della riga sta qui e non in chi pianifica: se `psql` si ferma a meta'
    # per un errore, `ON_ERROR_STOP` non arriva mai a questa istruzione e la riga resta
    # `running`, che e' la verita'. Chiuderla da fuori direbbe «completata» comunque.
    richieste = valore("--richieste")
    tetto = valore("--tetto")
    print(
        "update private.football_sync_runs set status = 'completed',"
        " completed_at = now()"
        + ("" if tetto is None else ", requests_limit = " + str(int(tetto)))
        + ("" if richieste is None else
           ", requests_started = " + str(int(richieste))
           + ", requests_completed = " + str(int(richieste)))
        + " where id = " + giornale + ";"
    )


if __name__ == "__main__":
    main()
