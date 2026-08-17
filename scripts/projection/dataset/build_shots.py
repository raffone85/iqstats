"""Profilo spaziale di ogni squadra-gara, dalla mappa dei tiri gia' su disco.

Qui non si calcolano medie: si misura che cosa e' successo in quella gara, una riga per
squadra. Le medie «al momento di» e i valori concessi dall'avversario si calcolano dopo,
con la stessa macchina che governa tutte le altre metriche, cosi' le regole di stagione
e di provenienza restano una sola.

Il sistema di coordinate e' stato verificato sull'archivio, non assunto: la prima
coordinata e' la distanza dalla linea di porta in centesimi della lunghezza del campo.
Sotto la soglia dell'area l'xG medio e' 0,148 e sopra 0,040, che e' esattamente la
differenza che ci si aspetta fra dentro e fuori area.

Nessuna richiesta di rete. Sola lettura.

Uso:
    .venv/Scripts/python.exe scripts/projection/dataset/build_shots.py
"""

import argparse
import csv
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
RAW_DIR = os.path.join(ROOT, "scripts", "calibration", "data", "raw")
OUT_DIR = os.path.join(os.path.dirname(__file__), "output")

# Il limite dell'area in centesimi della lunghezza del campo: 16,5 metri su 105.
LIMITE_AREA = 16.0
LUNGHEZZA_M = 105.0
LARGHEZZA_M = 68.0
# Un tiro «di qualita'» e' un tiro il cui xG supera questa soglia. E' una convenzione
# dichiarata, non una stima: serve a contare, non a valutare.
SOGLIA_QUALITA = 0.10
DA_FERMO = ("corner", "set-piece", "free-kick", "throw-in-set-piece", "penalty")

COLONNE = [
    "tiro_totali", "tiro_quota_in_area", "tiro_distanza_media", "tiro_xg_per_tiro",
    "tiro_quota_qualita", "tiro_quota_bloccati", "tiro_quota_da_fermo",
]


def distanza(posizione):
    x = posizione.get("x")
    y = posizione.get("y")
    if x is None or y is None:
        return None
    lungo = x / 100.0 * LUNGHEZZA_M
    largo = (y - 50.0) / 100.0 * LARGHEZZA_M
    return (lungo * lungo + largo * largo) ** 0.5


def descrivi(tiri):
    """Il profilo di un lato in una gara. Senza tiri non si descrive nulla."""
    if not tiri:
        return None
    totali = len(tiri)
    in_area = 0
    bloccati = 0
    da_fermo = 0
    di_qualita = 0
    distanze = []
    valori_xg = []

    for tiro in tiri:
        posizione = tiro.get("pos") or {}
        x = posizione.get("x")
        if x is not None and x <= LIMITE_AREA:
            in_area += 1
        misura = distanza(posizione)
        if misura is not None:
            distanze.append(misura)
        if tiro.get("type") == "block":
            bloccati += 1
        if tiro.get("sit") in DA_FERMO:
            da_fermo += 1
        xg = tiro.get("xg")
        if xg is not None:
            valori_xg.append(float(xg))
            if float(xg) >= SOGLIA_QUALITA:
                di_qualita += 1

    return {
        "tiro_totali": totali,
        "tiro_quota_in_area": in_area / totali,
        "tiro_distanza_media": sum(distanze) / len(distanze) if distanze else None,
        "tiro_xg_per_tiro": sum(valori_xg) / len(valori_xg) if valori_xg else None,
        "tiro_quota_qualita": di_qualita / len(valori_xg) if valori_xg else None,
        "tiro_quota_bloccati": bloccati / totali,
        "tiro_quota_da_fermo": da_fermo / totali,
    }


def costruisci(limite=None):
    righe = []
    gare = 0
    senza_mappa = 0
    tiri_letti = 0

    percorsi = []
    for lega in sorted(os.listdir(RAW_DIR), key=int):
        cartella = os.path.join(RAW_DIR, lega)
        if not os.path.isdir(cartella):
            continue
        for nome in sorted(os.listdir(cartella)):
            if nome.endswith(".json"):
                percorsi.append((nome[:-5], os.path.join(cartella, nome)))
    if limite:
        percorsi = percorsi[:limite]

    for event_id, percorso in percorsi:
        try:
            with open(percorso, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (ValueError, OSError):
            continue
        gare += 1
        mappa = payload.get("shotmap")
        if not mappa:
            senza_mappa += 1
            continue
        tiri_letti += len(mappa)
        per_lato = {"home": [], "away": []}
        for tiro in mappa:
            per_lato["home" if tiro.get("home") else "away"].append(tiro)
        for lato, tiri in per_lato.items():
            voce = descrivi(tiri)
            if voce is None:
                continue
            righe.append([event_id, lato] + [voce[nome] for nome in COLONNE])

    os.makedirs(OUT_DIR, exist_ok=True)
    uscita = os.path.join(OUT_DIR, "tiri.csv")
    with open(uscita, "w", encoding="utf-8", newline="") as handle:
        scrittore = csv.writer(handle)
        scrittore.writerow(["event_id", "lato"] + COLONNE)
        for riga in righe:
            scrittore.writerow(["" if valore is None else valore for valore in riga])

    rapporto = {
        "generato_da": "scripts/projection/dataset/build_shots.py",
        "gare_lette": gare,
        "gare_senza_mappa": senza_mappa,
        "righe_squadra_gara": len(righe),
        "tiri_letti": tiri_letti,
        "limite_area": LIMITE_AREA,
        "soglia_qualita": SOGLIA_QUALITA,
        "nota": (
            "una riga per lato con la sola misura di quella gara; le medie al momento di "
            "e i valori concessi si calcolano nel dataset delle feature"
        ),
    }
    with open(os.path.join(OUT_DIR, "tiri-rapporto.json"), "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=2)
    return rapporto, uscita


def main():
    parser = argparse.ArgumentParser(description="Profilo spaziale per squadra-gara")
    parser.add_argument("--limit", type=int, default=None)
    argomenti = parser.parse_args()

    rapporto, uscita = costruisci(argomenti.limit)
    print("gare lette: " + str(rapporto["gare_lette"]))
    print("gare senza mappa: " + str(rapporto["gare_senza_mappa"]))
    print("righe squadra-gara: " + str(rapporto["righe_squadra_gara"]))
    print("tiri letti: " + str(rapporto["tiri_letti"]))
    print("scritto: " + uscita)
    return 0


if __name__ == "__main__":
    sys.exit(main())
