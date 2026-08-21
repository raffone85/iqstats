"""Aggregati di rosa «al momento di», dalle statistiche per giocatore.

Per ogni squadra-gara si guarda **solo alle gare precedenti** della squadra dentro la
stessa stagione e si descrive con chi la squadra sta giocando: chi ha i minuti, quanto
il volume dipende da pochi, quanto ruota, quanti minuti vanno a chi fino a ieri non
giocava.

La formazione prevista storica non esiste, e l'undici sceso in campo nella gara da
prevedere e' un dato della gara stessa: nessuno dei due entra qui. Il presente si
descrive con il passato, e basta.

Le medie per novanta minuti si calcolano solo su chi ha superato una soglia minima di
minuti: un giocatore con dieci minuti e un tiro non vale trentasei tiri a partita.

Nessuna richiesta di rete. Sola lettura.

Uso:
    .venv/Scripts/python.exe scripts/projection/dataset/build_players.py
"""

import argparse
import csv
import json
import os
import sys
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
GIOCATORI_DIR = os.path.join(ROOT, "scripts", "projection", "harvest", "data", "player-stats")
OSSERVAZIONI = os.path.join(os.path.dirname(__file__), "output", "osservazioni.csv")
OUT_DIR = os.path.join(os.path.dirname(__file__), "output")

MIN_MINUTI = 90        # soglia sotto la quale un per novanta minuti non e' un tasso
TITOLARI = 11          # quanti giocatori compongono l'aggregato di volume
CONCENTRAZIONE = 3     # su quanti si misura la dipendenza da pochi

# Metriche del giocatore che hanno un corrispettivo fra i bersagli di squadra.
# I corner non esistono a livello di giocatore: per quel target restano le sole
# feature di composizione della rosa, ed e' dichiarato.
METRICHE = (
    ("total_shots", "total_shots"),
    ("shots_on_target", "shots_on_target"),
    ("fouls", "fouls"),
    ("yellow_card", "yellow_cards"),
    ("red_card", "red_cards"),
    ("saves", "goalkeeper_saves"),
)


def carica_calendario():
    """event_id -> (quando, stagione) e (event_id, team_id) -> lato, dalle osservazioni."""
    quando = {}
    stagione = {}
    lato = {}
    with open(OSSERVAZIONI, "r", encoding="utf-8", newline="") as handle:
        for riga in csv.DictReader(handle):
            event_id = riga["event_id"]
            istante = riga.get("calcio_dinizio") or riga.get("data") or ""
            if istante:
                quando[event_id] = istante
            stagione[event_id] = riga.get("season_id") or ""
            squadra = riga.get("team_id") or ""
            if squadra:
                lato[(event_id, squadra)] = riga["lato"]
    return quando, stagione, lato


def leggi_gare():
    """Una voce per squadra-gara: minuti e metriche di ogni giocatore sceso in campo."""
    per_squadra_gara = defaultdict(lambda: defaultdict(dict))
    if not os.path.isdir(GIOCATORI_DIR):
        return per_squadra_gara
    for cartella in sorted(os.listdir(GIOCATORI_DIR), key=lambda nome: (len(nome), nome)):
        dentro = os.path.join(GIOCATORI_DIR, cartella)
        if not os.path.isdir(dentro):
            continue
        for nome in sorted(os.listdir(dentro), key=lambda nome: (len(nome), nome)):
            if not nome.endswith(".json"):
                continue
            try:
                with open(os.path.join(dentro, nome), "r", encoding="utf-8") as handle:
                    payload = json.load(handle)
            except (ValueError, OSError):
                continue
            event_id = str(payload.get("event_id") or nome[:-5])
            for riga in payload.get("player_stats") or []:
                squadra = riga.get("team_id")
                giocatore = riga.get("player_id")
                if squadra is None or giocatore is None:
                    continue
                minuti = riga.get("minutes_played")
                if minuti is None:
                    continue
                valori = {"minuti": float(minuti)}
                for fonte, _ in METRICHE:
                    grezzo = riga.get(fonte)
                    valori[fonte] = float(grezzo) if grezzo is not None else 0.0
                per_squadra_gara[(event_id, str(squadra))][giocatore] = valori
    return per_squadra_gara


def per_novanta(accumulato, fonte):
    """Tasso per novanta minuti di un giocatore, solo sopra la soglia di minuti."""
    minuti = accumulato["minuti"]
    if minuti < MIN_MINUTI:
        return None
    return accumulato[fonte] / minuti * 90.0


def descrivi(accumulo, ultima):
    """Le feature di una squadra-gara, calcolate sulle sole gare precedenti."""
    voce = {}
    ordinati = sorted(accumulo.items(), key=lambda coppia: -coppia[1]["minuti"])
    titolari = [giocatore for giocatore, _ in ordinati[:TITOLARI]]

    voce["giocatori_rosa_usata"] = float(len(ordinati))
    voce["giocatori_minuti_titolari"] = (
        sum(accumulo[g]["minuti"] for g in titolari) / len(titolari) if titolari else None)

    for fonte, etichetta in METRICHE:
        tassi = [per_novanta(accumulo[g], fonte) for g in titolari]
        tassi = [valore for valore in tassi if valore is not None]
        voce["giocatori_" + etichetta + "_titolari_per90"] = sum(tassi) if tassi else None

        totale = sum(accumulo[g][fonte] for g, _ in ordinati)
        primi = sorted((accumulo[g][fonte] for g, _ in ordinati), reverse=True)[:CONCENTRAZIONE]
        voce["giocatori_" + etichetta + "_quota_primi"] = (
            sum(primi) / totale if totale > 0 else None)

    # Quanto la squadra dell'ultima gara coincide con chi ha i minuti nella stagione,
    # e quanti minuti sono andati a chi fino a ieri non ne aveva.
    if ultima:
        minuti_ultima = sum(ultima.values())
        insieme = set(titolari)
        voce["giocatori_stabilita"] = (
            sum(minuti for g, minuti in ultima.items() if g in insieme) / minuti_ultima
            if minuti_ultima > 0 else None)
        voce["giocatori_minuti_nuovi"] = (
            sum(minuti for g, minuti in ultima.items()
                if accumulo.get(g, {}).get("minuti", 0.0) < MIN_MINUTI) / minuti_ultima
            if minuti_ultima > 0 else None)
    else:
        voce["giocatori_stabilita"] = None
        voce["giocatori_minuti_nuovi"] = None
    return voce


def costruisci():
    quando, stagione, lato = carica_calendario()
    gare = leggi_gare()

    # Le gare di ciascuna squadra, in ordine di tempo e dentro la stagione.
    per_squadra = defaultdict(list)
    senza_data = 0
    for (event_id, squadra), giocatori in gare.items():
        istante = quando.get(event_id)
        if not istante:
            senza_data += 1
            continue
        per_squadra[squadra].append((istante, event_id, stagione.get(event_id, ""), giocatori))

    intestazione = None
    righe = []
    for squadra, elenco in per_squadra.items():
        elenco.sort()
        accumulo = defaultdict(lambda: defaultdict(float))
        ultima = None
        stagione_corrente = None
        precedenti = 0
        for istante, event_id, stagione_gara, giocatori in elenco:
            if stagione_gara != stagione_corrente:
                accumulo = defaultdict(lambda: defaultdict(float))
                ultima = None
                stagione_corrente = stagione_gara
                precedenti = 0

            voce = descrivi(accumulo, ultima)
            voce["giocatori_gare_precedenti"] = float(precedenti)
            righe.append((event_id, squadra, lato.get((event_id, squadra)), voce))
            precedenti += 1

            for giocatore, valori in giocatori.items():
                accumulo[giocatore]["minuti"] += valori["minuti"]
                for fonte, _ in METRICHE:
                    accumulo[giocatore][fonte] += valori[fonte]
            ultima = {giocatore: valori["minuti"] for giocatore, valori in giocatori.items()
                      if valori["minuti"] > 0}

    if righe:
        intestazione = ["event_id", "team_id", "lato"] + sorted(righe[0][3])

    os.makedirs(OUT_DIR, exist_ok=True)
    uscita = os.path.join(OUT_DIR, "giocatori.csv")
    with open(uscita, "w", encoding="utf-8", newline="") as handle:
        scrittore = csv.writer(handle)
        scrittore.writerow(intestazione)
        for event_id, squadra, il_lato, voce in righe:
            scrittore.writerow([event_id, squadra, il_lato or ""]
                               + ["" if voce[nome] is None else voce[nome]
                                  for nome in intestazione[3:]])

    rapporto = {
        "generato_da": "scripts/projection/dataset/build_players.py",
        "righe_squadra_gara": len(righe),
        "squadre": len(per_squadra),
        "gare_senza_data": senza_data,
        "soglia_minuti": MIN_MINUTI,
        "titolari": TITOLARI,
        "metriche": [etichetta for _, etichetta in METRICHE],
        "nota": (
            "aggregati calcolati sulle sole gare precedenti della squadra dentro la "
            "stessa stagione; nessuna formazione, prevista o effettiva, entra nel calcolo"
        ),
    }
    with open(os.path.join(OUT_DIR, "giocatori-rapporto.json"), "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=2)
    return rapporto, uscita


def main():
    argparse.ArgumentParser(description="Aggregati di rosa al momento di").parse_args()
    rapporto, uscita = costruisci()
    print("righe squadra-gara: " + str(rapporto["righe_squadra_gara"]))
    print("squadre: " + str(rapporto["squadre"]))
    print("gare senza data: " + str(rapporto["gare_senza_data"]))
    print("scritto: " + uscita)
    return 0


if __name__ == "__main__":
    sys.exit(main())
