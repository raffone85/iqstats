"""Tavole di riferimento per il banco di prova locale del livello dati.

I lotti di osservazioni nominano gare, squadre, stagioni e arbitri con gli
identificativi della fonte, e `private.apply_projection_observations` li risolve
con una giuntura: senza `football.matches` e `football.teams` popolate ogni riga
finisce fra le rifiutate. Questo script costruisce quelle tavole **dall'archivio
gia' raccolto**, senza toccare la fonte.

Che cosa e' reale e che cosa no, dichiarato una volta sola:

- **reali**: identificativi di gara, squadra, stagione, arbitro e competizione,
  calcio d'inizio, stato, turno, punteggi finali e all'intervallo, nomi
  delle squadre;
- **segnaposto**: i nomi di competizione, stagione e arbitro, che l'archivio non
  porta. Le tavole li vogliono non nulli e il motore non li legge mai: entrano
  nelle viste di lettura dell'app, non in un calcolo. Sono marcati come tali.

Le date di inizio e fine stagione non sono inventate: sono il primo e l'ultimo
calcio d'inizio osservato per quella stagione.

Uso: python export_reference_local.py <cartella-di-destinazione>
"""

from __future__ import annotations

import csv
import json
import os
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parents[3]
LOTTI = RADICE / "scripts" / "projection" / "dataset" / "output" / "lotti-osservazioni"
ARCHIVIO = RADICE / "scripts" / "projection" / "harvest" / "data" / "match-detail"

# Il vocabolario della fonte contro quello dello schema.
STATI = {
    "finished": "finished",
    "notstarted": "scheduled",
    "inprogress": "live",
    "cancelled": "canceled",
    "postponed": "postponed",
    "unresolved": "unknown",
}


def indice_archivio() -> dict[int, Path]:
    trovati: dict[int, Path] = {}
    for cartella in sorted(os.listdir(ARCHIVIO)):
        percorso = ARCHIVIO / cartella
        if not percorso.is_dir():
            continue
        for nome in os.listdir(percorso):
            if nome.endswith(".json"):
                trovati[int(nome[:-5])] = percorso / nome
    return trovati


def righe_dei_lotti() -> list[dict]:
    righe: list[dict] = []
    for lotto in sorted(LOTTI.glob("lotto-*.json")):
        righe.extend(json.loads(lotto.read_text(encoding="utf-8"))["teamMatches"])
    return righe


def main(destinazione: Path) -> int:
    destinazione.mkdir(parents=True, exist_ok=True)
    archivio = indice_archivio()
    righe = righe_dei_lotti()

    # Che cosa i lotti chiedono.
    per_gara: dict[int, list[dict]] = {}
    for riga in righe:
        per_gara.setdefault(riga["match_source_id"], []).append(riga)

    # Che cosa l'archivio sa, gara per gara.
    dettaglio: dict[int, dict] = {}
    nomi_squadra: dict[int, str] = {}
    stagione_di_lega: dict[int, int] = {}
    for gara in per_gara:
        percorso = archivio.get(gara)
        if percorso is None:
            continue
        d = json.loads(percorso.read_text(encoding="utf-8"))
        dettaglio[gara] = d
        if d.get("home_team"):
            nomi_squadra[d["home_team_id"]] = d["home_team"]
        if d.get("away_team"):
            nomi_squadra[d["away_team_id"]] = d["away_team"]
        stagione_di_lega[d["season_id"]] = d["league_id"]

    # Le gare senza dettaglio prendono la lega dalla loro stagione, se e' nota.
    senza_lega: list[int] = []
    lega_di_gara: dict[int, int] = {}
    for gara, gruppo in per_gara.items():
        d = dettaglio.get(gara)
        if d is not None:
            lega_di_gara[gara] = d["league_id"]
            continue
        stagione = gruppo[0]["season_source_id"]
        if stagione in stagione_di_lega:
            lega_di_gara[gara] = stagione_di_lega[stagione]
        else:
            senza_lega.append(gara)

    # Estremi reali di ogni stagione, dal calcio d'inizio osservato.
    estremi: dict[int, list[str]] = {}
    for gara, gruppo in per_gara.items():
        if gara in senza_lega:
            continue
        stagione = gruppo[0]["season_source_id"]
        istante = gruppo[0]["kickoff_at"][:10]
        if stagione not in estremi:
            estremi[stagione] = [istante, istante]
        else:
            estremi[stagione][0] = min(estremi[stagione][0], istante)
            estremi[stagione][1] = max(estremi[stagione][1], istante)

    leghe = sorted({lega for gara, lega in lega_di_gara.items()})
    stagioni = sorted(
        {
            (gruppo[0]["season_source_id"], lega_di_gara[gara])
            for gara, gruppo in per_gara.items()
            if gara not in senza_lega
        }
    )
    # Trentadue righe su 18.610 non nominano ne' la squadra ne' l'avversaria: la
    # giuntura della funzione le rifiuterebbe comunque, e qui non possono diventare
    # una gara, che vuole due squadre. Restano contate nel rapporto.
    squadre = sorted(
        {riga["team_source_id"] for riga in righe if riga["team_source_id"] is not None}
        | {riga["opponent_source_id"] for riga in righe if riga["opponent_source_id"] is not None}
    )
    arbitri = sorted(
        {
            riga["referee_source_id"]
            for riga in righe
            if riga.get("referee_source_id") is not None
        }
    )

    def scrivi(nome: str, intestazione: list[str], dati) -> None:
        with open(destinazione / nome, "w", encoding="utf-8", newline="") as f:
            scrittore = csv.writer(f)
            scrittore.writerow(intestazione)
            scrittore.writerows(dati)

    scrivi(
        "competizioni.csv",
        ["source_id", "name"],
        ([lega, f"Competizione {lega} (segnaposto locale)"] for lega in leghe),
    )
    scrivi(
        "stagioni.csv",
        ["competition_source_id", "source_id", "name", "season_kind", "starts_on", "ends_on"],
        (
            [
                lega,
                stagione,
                f"Stagione {stagione} (segnaposto locale)",
                "cross_year" if estremi[stagione][0][:4] != estremi[stagione][1][:4] else "calendar_year",
                estremi[stagione][0],
                estremi[stagione][1],
            ]
            for stagione, lega in stagioni
        ),
    )
    scrivi(
        "squadre.csv",
        ["source_id", "name"],
        (
            [squadra, nomi_squadra.get(squadra) or f"Squadra {squadra} (segnaposto locale)"]
            for squadra in squadre
        ),
    )
    scrivi(
        "arbitri.csv",
        ["source_id", "name"],
        ([arbitro, f"Arbitro {arbitro} (segnaposto locale)"] for arbitro in arbitri),
    )

    gare_scritte = 0
    senza_squadre: list[int] = []
    with open(destinazione / "gare.csv", "w", encoding="utf-8", newline="") as f:
        scrittore = csv.writer(f)
        scrittore.writerow(
            [
                "source_id",
                "season_source_id",
                "home_team_source_id",
                "away_team_source_id",
                "referee_source_id",
                "kickoff_at",
                "normalized_status",
                "round_name",
                "home_score",
                "away_score",
                "home_score_halftime",
                "away_score_halftime",
            ]
        )
        for gara, gruppo in sorted(per_gara.items()):
            if gara in senza_lega:
                continue
            casa = next((r for r in gruppo if r["side"] == "home"), None)
            fuori = next((r for r in gruppo if r["side"] == "away"), None)
            if casa is None or fuori is None:
                senza_lega.append(gara)
                continue
            if casa["team_source_id"] is None or fuori["team_source_id"] is None:
                senza_squadre.append(gara)
                continue
            d = dettaglio.get(gara)
            stato = STATI.get((d or {}).get("status", ""), "unknown")
            turno = ((d or {}).get("round_name") or "").strip() or None
            if turno is None and (d or {}).get("round_number") is not None:
                turno = f"Turno {d['round_number']}"
            casa_gol, fuori_gol = casa["goals_for"], casa["goals_against"]
            if casa_gol is None or fuori_gol is None:
                casa_gol = fuori_gol = None
            # L'intervallo sta solo nel dettaglio archiviato, e la tavola vuole le due
            # colonne nulle insieme o piene insieme: o la coppia c'e', o non si scrive.
            casa_ht, fuori_ht = (d or {}).get("home_score_ht"), (d or {}).get("away_score_ht")
            if casa_ht is None or fuori_ht is None:
                casa_ht = fuori_ht = None
            # Un gol non si toglie: un intervallo maggiore del finale e' un dato rotto,
            # e si dichiara assente invece di sceglierne uno. Misurato il 2 settembre
            # 2026: capita su 180 gare su 10.810, e su 179 di quelle la fonte ha gia'
            # corretto da sola. La cura vera e' rinfrescare l'archivio, non indovinare.
            elif casa_gol is None or casa_ht > casa_gol or fuori_ht > fuori_gol:
                casa_ht = fuori_ht = None
            scrittore.writerow(
                [
                    gara,
                    casa["season_source_id"],
                    casa["team_source_id"],
                    fuori["team_source_id"],
                    casa.get("referee_source_id") or "",
                    casa["kickoff_at"],
                    stato,
                    turno or "",
                    "" if casa_gol is None else casa_gol,
                    "" if fuori_gol is None else fuori_gol,
                    "" if casa_ht is None else casa_ht,
                    "" if fuori_ht is None else fuori_ht,
                ]
            )
            gare_scritte += 1

    rapporto = {
        "gare_richieste_dai_lotti": len(per_gara),
        "gare_scritte": gare_scritte,
        "gare_escluse_lega_ignota": sorted(senza_lega),
        "gare_escluse_squadra_ignota": sorted(senza_squadre),
        "gare_senza_dettaglio_archiviato": sorted(set(per_gara) - set(dettaglio)),
        "competizioni": len(leghe),
        "stagioni": len(stagioni),
        "squadre": len(squadre),
        "squadre_con_nome_reale": len(set(squadre) & set(nomi_squadra)),
        "arbitri": len(arbitri),
    }
    (destinazione / "rapporto.json").write_text(
        json.dumps(rapporto, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps({k: v if not isinstance(v, list) else len(v) for k, v in rapporto.items()}, indent=2))
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(Path(sys.argv[1])))
