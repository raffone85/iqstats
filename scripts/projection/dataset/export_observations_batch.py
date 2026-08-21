"""Il lotto delle osservazioni squadra-gara, pronto per il database dell'applicazione.

Qui non si normalizza niente di nuovo. Le osservazioni sono gia' state normalizzate una
volta, con la politica di provenienza dichiarata, e sono le stesse righe su cui i modelli
sono stati addestrati e validati: riscriverne la normalizzazione in un altro linguaggio
significherebbe avere due verita' che prima o poi divergono in silenzio. Questo script
legge quelle righe e le impacchetta.

Il lotto porta gli identificativi della fonte, non quelli interni del database: la
risoluzione la fa `private.apply_projection_observations`, che rifiuta — senza inventare
niente — una riga che nomina una gara o una squadra sconosciute.

Nessuna richiesta di rete. Sola lettura, salvo i file del lotto.

Uso:
    .venv/Scripts/python.exe scripts/projection/dataset/export_observations_batch.py
    .venv/Scripts/python.exe scripts/projection/dataset/export_observations_batch.py --limite 50
"""

import argparse
import csv
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT_DIR = os.path.join(os.path.dirname(__file__), "output")
OSSERVAZIONI = os.path.join(OUT_DIR, "osservazioni.csv")
TIRI = os.path.join(OUT_DIR, "tiri.csv")
REGISTRO = os.path.join(ROOT, "data", "registro-metriche.json")
GIOCATORI_DIR = os.path.join(ROOT, "scripts", "projection", "harvest", "data", "player-stats")
RAW_DIR = os.path.join(ROOT, "scripts", "calibration", "data", "raw")
LOTTI_DIR = os.path.join(OUT_DIR, "lotti-osservazioni")

# Le colonne metriche della tavola, nello stesso ordine della migrazione.
METRICHE = [
    "ball_possession", "passes", "accurate_passes", "pass_accuracy_pct", "long_balls_total",
    "final_third_entries", "final_third_phase_total", "touches_in_penalty_area",
    "crosses_total",
    "duels", "ground_duels_total", "aerial_duels_total", "tackles", "interceptions",
    "recoveries", "clearances", "dribbles_total", "dispossessed",
    "shots_inside_box", "shots_outside_box", "blocked_shots", "hit_woodwork",
    "errors_lead_to_a_shot", "expected_goals", "big_chances",
    "free_kicks", "throw_ins", "goal_kicks", "fouled_in_final_third",
    "total_shots", "shots_on_target", "corner_kicks", "fouls", "yellow_cards", "offsides",
    "goalkeeper_saves", "second_yellow_red", "red_cards_direct", "bench_cards",
]

TIRI_COLONNE = [
    ("shot_map_total", "tiro_totali"),
    ("shot_map_share_in_box", "tiro_quota_in_area"),
    ("shot_map_avg_distance", "tiro_distanza_media"),
    ("shot_map_xg_per_shot", "tiro_xg_per_tiro"),
    ("shot_map_share_quality", "tiro_quota_qualita"),
    ("shot_map_share_blocked", "tiro_quota_bloccati"),
    ("shot_map_share_set_piece", "tiro_quota_da_fermo"),
]

# Le metriche del giocatore che alimentano gli aggregati di rosa.
METRICHE_GIOCATORE = [
    ("total_shots", "total_shots"),
    ("shots_on_target", "shots_on_target"),
    ("fouls", "fouls"),
    ("yellow_card", "yellow_card"),
    ("red_card", "red_card"),
    ("saves", "saves"),
]

GARE_PER_LOTTO = 400


def numero(testo):
    if testo is None or testo == "":
        return None
    try:
        valore = float(testo)
    except ValueError:
        return None
    if valore != valore:
        return None
    return int(valore) if valore.is_integer() else valore


def intero(testo):
    valore = numero(testo)
    return None if valore is None else int(valore)


def istante(riga):
    """Il calcio d'inizio in forma ISO con la Z, la stessa che ordina le righe."""
    grezzo = riga.get("calcio_dinizio") or riga.get("data") or ""
    if not grezzo:
        return None
    testo = grezzo.replace("Z", "+00:00")
    try:
        quando = datetime.fromisoformat(testo)
    except ValueError:
        return None
    if quando.tzinfo is None:
        quando = quando.replace(tzinfo=timezone.utc)
    return quando.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def carica_tiri():
    profili = {}
    if not os.path.isfile(TIRI):
        return profili
    with open(TIRI, "r", encoding="utf-8", newline="") as handle:
        for riga in csv.DictReader(handle):
            profili[(riga["event_id"], riga["lato"])] = riga
    return profili


def indice_grezzi():
    """event_id -> percorso del payload grezzo, per leggerne l'istante di osservazione."""
    percorsi = {}
    if not os.path.isdir(RAW_DIR):
        return percorsi
    for lega in os.listdir(RAW_DIR):
        cartella = os.path.join(RAW_DIR, lega)
        if not os.path.isdir(cartella):
            continue
        for nome in os.listdir(cartella):
            if nome.endswith(".json"):
                percorsi[nome[:-5]] = os.path.join(cartella, nome)
    return percorsi


def indice_giocatori():
    percorsi = {}
    if not os.path.isdir(GIOCATORI_DIR):
        return percorsi
    for cartella in os.listdir(GIOCATORI_DIR):
        dentro = os.path.join(GIOCATORI_DIR, cartella)
        if not os.path.isdir(dentro):
            continue
        for nome in os.listdir(dentro):
            if nome.endswith(".json"):
                percorsi[nome[:-5]] = os.path.join(dentro, nome)
    return percorsi


def osservato_il(percorso):
    """Quando la fonte e' stata letta: la data del file grezzo, non una data inventata."""
    if percorso is None or not os.path.isfile(percorso):
        return None
    quando = datetime.fromtimestamp(os.path.getmtime(percorso), tz=timezone.utc)
    return quando.isoformat().replace("+00:00", "Z")


def riga_squadra(riga, tiri, osservato):
    quando = istante(riga)
    if quando is None:
        return None
    provenienze = {}
    valori = {}
    for metrica in METRICHE:
        valori[metrica] = numero(riga.get(metrica))
        classe = riga.get(metrica + "__p")
        if classe:
            provenienze[metrica] = classe

    profilo = tiri.get((riga["event_id"], riga["lato"]))
    for colonna, sorgente in TIRI_COLONNE:
        valori[colonna] = None if profilo is None else numero(profilo.get(sorgente))

    voce = {
        "match_source_id": intero(riga["event_id"]),
        "team_source_id": intero(riga.get("team_id")),
        "opponent_source_id": intero(riga.get("opponent_id")),
        "season_source_id": intero(riga.get("season_id")),
        "referee_source_id": intero(riga.get("referee_id")),
        "side": riga["lato"],
        "kickoff_at": quando,
        "coach_source_id": intero(riga.get("coach_id")),
        "opponent_coach_source_id": intero(riga.get("opponent_coach_id")),
        "round_number": intero(riga.get("round_number")),
        "is_derby": None if riga.get("derby") in (None, "") else riga.get("derby") == "1",
        "goals_for": intero(riga.get("gol_fatti")),
        "goals_against": intero(riga.get("gol_subiti")),
        "panel_status": "observed" if riga.get("pannello") == "1" else "absent",
        "discipline_status": (
            "observed" if riga.get("yellow_cards") not in (None, "") else "absent"),
        "players_status": "absent",
        "value_provenance": provenienze,
        "source_observed_at": osservato,
    }
    voce.update(valori)
    return voce


def righe_giocatori(percorso, event_id, quando):
    """Le statistiche per giocatore di una gara, con l'ordine della risposta conservato."""
    try:
        with open(percorso, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (ValueError, OSError):
        return None
    uscita = []
    ordinale = 0
    for voce in payload.get("player_stats") or []:
        squadra = voce.get("team_id")
        giocatore = voce.get("player_id")
        minuti = voce.get("minutes_played")
        if squadra is None or giocatore is None or minuti is None:
            ordinale += 1
            continue
        riga = {
            "match_source_id": int(event_id),
            "team_source_id": int(squadra),
            "player_source_id": int(giocatore),
            "kickoff_at": quando,
            "source_ordinal": ordinale,
            "minutes_played": int(minuti),
        }
        for colonna, sorgente in METRICHE_GIOCATORE:
            grezzo = voce.get(sorgente)
            riga[colonna] = None if grezzo is None else int(grezzo)
        uscita.append(riga)
        ordinale += 1
    return uscita


def costruisci(limite):
    tiri = carica_tiri()
    grezzi = indice_grezzi()
    giocatori = indice_giocatori()

    per_gara = {}
    ordine = []
    with open(OSSERVAZIONI, "r", encoding="utf-8", newline="") as handle:
        for riga in csv.DictReader(handle):
            event_id = riga["event_id"]
            if event_id not in per_gara:
                per_gara[event_id] = []
                ordine.append(event_id)
            per_gara[event_id].append(riga)

    if limite is not None:
        ordine = ordine[:limite]

    os.makedirs(LOTTI_DIR, exist_ok=True)
    for nome in os.listdir(LOTTI_DIR):
        os.remove(os.path.join(LOTTI_DIR, nome))

    lotti = []
    squadre_totali = 0
    giocatori_totali = 0
    gare_senza_grezzo = 0
    gare_senza_giocatori = 0
    scartate = 0

    blocco_squadre = []
    blocco_giocatori = []
    gare_nel_blocco = 0

    def scrivi(indice):
        nome = "lotto-%04d.json" % indice
        percorso = os.path.join(LOTTI_DIR, nome)
        documento = {"teamMatches": blocco_squadre, "playerMatches": blocco_giocatori}
        testo = json.dumps(documento, ensure_ascii=False, separators=(",", ":"))
        with open(percorso, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(testo)
        lotti.append({
            "file": nome,
            "righe_squadra": len(blocco_squadre),
            "righe_giocatore": len(blocco_giocatori),
            "impronta": hashlib.sha256(testo.encode("utf-8")).hexdigest(),
        })

    for event_id in ordine:
        percorso_grezzo = grezzi.get(event_id)
        if percorso_grezzo is None:
            gare_senza_grezzo += 1
        osservato = osservato_il(percorso_grezzo)
        if osservato is None:
            # Senza istante di osservazione la riga non si scrive: la colonna e'
            # obbligatoria e riempirla con «adesso» sarebbe un dato inventato.
            scartate += len(per_gara[event_id])
            continue

        quando = None
        voci = []
        for riga in per_gara[event_id]:
            voce = riga_squadra(riga, tiri, osservato)
            if voce is None:
                scartate += 1
                continue
            quando = voce["kickoff_at"]
            voci.append(voce)
        if not voci:
            continue

        percorso_giocatori = giocatori.get(event_id)
        righe = None
        if percorso_giocatori is not None:
            righe = righe_giocatori(percorso_giocatori, event_id, quando)
        if righe is None:
            gare_senza_giocatori += 1
        else:
            per_squadra = set(riga["team_source_id"] for riga in righe)
            for voce in voci:
                if voce["team_source_id"] in per_squadra:
                    voce["players_status"] = "observed"
            blocco_giocatori.extend(righe)
            giocatori_totali += len(righe)

        blocco_squadre.extend(voci)
        squadre_totali += len(voci)
        gare_nel_blocco += 1

        if gare_nel_blocco >= GARE_PER_LOTTO:
            scrivi(len(lotti) + 1)
            blocco_squadre = []
            blocco_giocatori = []
            gare_nel_blocco = 0

    if blocco_squadre:
        scrivi(len(lotti) + 1)

    manifesto = {
        "generato_da": "scripts/projection/dataset/export_observations_batch.py",
        "gare": len(ordine),
        "righe_squadra": squadre_totali,
        "righe_giocatore": giocatori_totali,
        "gare_senza_payload_grezzo": gare_senza_grezzo,
        "gare_senza_statistiche_per_giocatore": gare_senza_giocatori,
        "righe_scartate": scartate,
        "gare_per_lotto": GARE_PER_LOTTO,
        "lotti": lotti,
        "nota": (
            "il lotto porta gli identificativi della fonte: la risoluzione e il rifiuto "
            "delle righe non riconosciute avvengono in "
            "private.apply_projection_observations"
        ),
    }
    with open(os.path.join(LOTTI_DIR, "manifesto.json"), "w", encoding="utf-8",
              newline="\n") as handle:
        json.dump(manifesto, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return manifesto


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limite", type=int, default=None,
                        help="quante gare impacchettare, per una prova breve")
    argomenti = parser.parse_args()
    manifesto = costruisci(argomenti.limite)
    json.dump(manifesto, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
