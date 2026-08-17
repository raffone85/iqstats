"""Inventario dei campi delle entita' non coperte dall'archivio statistiche.

Legge i campioni reali gia' salvati in scripts/app-discovery/output/ e lo snapshot
di contesto in scripts/calibration/context/data/, e per ogni entita' elenca i campi
realmente restituiti con il loro tipo. Serve a scrivere il dizionario delle metriche
senza chiamare la fonte.

Nessuna richiesta di rete. Sola lettura.

Uso:
    .venv/Scripts/python.exe scripts/projection/discovery/scan_entities.py
"""

import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
CAMPIONI_DIR = os.path.join(ROOT, "scripts", "app-discovery", "output")
CONTEXT_DIR = os.path.join(ROOT, "scripts", "calibration", "context", "data")
OUT = os.path.join(os.path.dirname(__file__), "output", "inventario-entita.json")

# Chiavi che non devono mai finire in un artefatto: nomi di intestazioni o
# configurazioni. I campioni sono gia' sanificati, questo e' un secondo filtro.
CHIAVI_VIETATE = ("token", "authorization", "apikey", "api_key", "secret", "password")


def tipo_di(valore):
    if valore is None:
        return "null"
    if isinstance(valore, bool):
        return "bool"
    if isinstance(valore, int):
        return "int"
    if isinstance(valore, float):
        return "float"
    if isinstance(valore, str):
        return "str"
    if isinstance(valore, list):
        return "list"
    if isinstance(valore, dict):
        return "dict"
    return type(valore).__name__


def descrivi(valore, prefisso="", profondita=0, raccolta=None):
    """Percorre un payload e registra percorso -> tipo, senza mai copiare i valori."""
    if raccolta is None:
        raccolta = {}
    if profondita > 4:
        return raccolta
    if isinstance(valore, dict):
        for chiave, dentro in valore.items():
            if any(vietata in chiave.lower() for vietata in CHIAVI_VIETATE):
                continue
            percorso = prefisso + "." + chiave if prefisso else chiave
            raccolta[percorso] = tipo_di(dentro)
            descrivi(dentro, percorso, profondita + 1, raccolta)
    elif isinstance(valore, list) and valore:
        primo = valore[0]
        percorso = prefisso + "[]"
        raccolta[percorso] = tipo_di(primo)
        descrivi(primo, percorso, profondita + 1, raccolta)
    return raccolta


def leggi(percorso):
    with open(percorso, "r", encoding="utf-8") as handle:
        return json.load(handle)


def scansiona_campioni():
    entita = {}
    if not os.path.isdir(CAMPIONI_DIR):
        return entita
    for cartella in sorted(os.listdir(CAMPIONI_DIR)):
        base = os.path.join(CAMPIONI_DIR, cartella)
        if not os.path.isdir(base):
            continue
        for nome in sorted(os.listdir(base)):
            if not nome.endswith(".json") or nome in ("manifest.json", "REPORT.json"):
                continue
            try:
                payload = leggi(os.path.join(base, nome))
            except (ValueError, OSError):
                continue
            chiave = cartella + "/" + nome[:-5]
            campi = descrivi(payload)
            entita[chiave] = {
                "campi_totali": len(campi),
                "campi": dict(sorted(campi.items())),
            }
    return entita


def scansiona_contesto():
    entita = {}
    if not os.path.isdir(CONTEXT_DIR):
        return entita
    cartelle = sorted(
        nome for nome in os.listdir(CONTEXT_DIR)
        if os.path.isdir(os.path.join(CONTEXT_DIR, nome))
    )
    if not cartelle:
        return entita
    base = os.path.join(CONTEXT_DIR, cartelle[-1])
    for gruppo in ("events", "managers", "players", "rosters", "team-context", "transfers"):
        percorso = os.path.join(base, gruppo)
        if not os.path.isdir(percorso):
            continue
        campione = None
        for radice, _, files in os.walk(percorso):
            for nome in sorted(files):
                if nome.endswith(".json"):
                    campione = os.path.join(radice, nome)
                    break
            if campione:
                break
        if not campione:
            continue
        try:
            payload = leggi(campione)
        except (ValueError, OSError):
            continue
        campi = descrivi(payload)
        entita["contesto/" + gruppo] = {
            "snapshot": cartelle[-1],
            "campi_totali": len(campi),
            "campi": dict(sorted(campi.items())),
        }
    return entita


def main():
    risultato = {
        "generato_da": "scripts/projection/discovery/scan_entities.py",
        "sorgente": "campioni reali gia' salvati, nessuna richiesta di rete",
        "campioni_api": scansiona_campioni(),
        "snapshot_contesto": scansiona_contesto(),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(risultato, handle, ensure_ascii=False, indent=2)

    print("campioni api: " + str(len(risultato["campioni_api"])))
    for chiave in sorted(risultato["campioni_api"]):
        print("  " + chiave.ljust(48) + str(risultato["campioni_api"][chiave]["campi_totali"]) + " campi")
    print("entita di contesto: " + str(len(risultato["snapshot_contesto"])))
    for chiave in sorted(risultato["snapshot_contesto"]):
        print("  " + chiave.ljust(48) + str(risultato["snapshot_contesto"][chiave]["campi_totali"]) + " campi")
    print("scritto: " + OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
