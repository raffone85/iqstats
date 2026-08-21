"""Ricognizione misurata dell'archivio storico locale.

Legge i payload gia' scaricati in scripts/calibration/data/raw/ e lo snapshot di
contesto in scripts/calibration/context/data/, e produce un inventario dei campi
realmente restituiti dalla fonte: presenza, tipo, copertura per lega, assenze,
intervallo temporale.

Nessuna richiesta di rete. Nessun segreto letto o scritto. Sola lettura.

Uso:
    .venv/Scripts/python.exe scripts/projection/discovery/scan_archive.py
    .venv/Scripts/python.exe scripts/projection/discovery/scan_archive.py --limit 200
"""

import argparse
import csv
import json
import math
import os
import sys
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
RAW_DIR = os.path.join(ROOT, "scripts", "calibration", "data", "raw")
CSV_PATH = os.path.join(ROOT, "scripts", "calibration", "data", "dataset.csv")
CONTEXT_DIR = os.path.join(ROOT, "scripts", "calibration", "context", "data")
OUT_DIR = os.path.join(os.path.dirname(__file__), "output")


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


class Campo:
    """Accumulatore per un singolo campo osservato."""

    def __init__(self):
        self.osservazioni = 0
        self.nulli = 0
        self.tipi = defaultdict(int)
        self.zeri = 0
        self.minimo = None
        self.massimo = None
        self.somma = 0.0
        self.somma_quadrati = 0.0
        self.numerici = 0
        self.leghe = set()
        self.esempi = []

    def aggiungi(self, valore, league_id):
        self.osservazioni += 1
        self.leghe.add(league_id)
        self.tipi[tipo_di(valore)] += 1
        if valore is None:
            self.nulli += 1
            return
        if isinstance(valore, bool):
            return
        if isinstance(valore, (int, float)) and math.isfinite(valore):
            self.numerici += 1
            if valore == 0:
                self.zeri += 1
            if self.minimo is None or valore < self.minimo:
                self.minimo = valore
            if self.massimo is None or valore > self.massimo:
                self.massimo = valore
            self.somma += valore
            self.somma_quadrati += valore * valore
        elif len(self.esempi) < 3 and valore not in self.esempi:
            self.esempi.append(valore)

    def riassunto(self, totale_atteso):
        presenti = self.osservazioni - self.nulli
        voce = {
            "osservazioni": self.osservazioni,
            "presenti": presenti,
            "nulli": self.nulli,
            "tasso_presenza": round(presenti / totale_atteso, 6) if totale_atteso else None,
            "tasso_assenza": round(1 - presenti / totale_atteso, 6) if totale_atteso else None,
            "tipi": dict(sorted(self.tipi.items(), key=lambda kv: -kv[1])),
            "leghe_coperte": len(self.leghe),
        }
        if self.numerici:
            media = self.somma / self.numerici
            varianza = max(self.somma_quadrati / self.numerici - media * media, 0.0)
            voce["numerico"] = {
                "n": self.numerici,
                "min": self.minimo,
                "max": self.massimo,
                "media": round(media, 6),
                "sd": round(math.sqrt(varianza), 6),
                "dispersione": round(varianza / media, 6) if media > 0 else None,
                "quota_zeri": round(self.zeri / self.numerici, 6),
            }
        if self.esempi:
            voce["esempi"] = self.esempi
        return voce


def carica_anagrafica_gare():
    """match_id -> (league_id, date) dal CSV gia' prodotto dalla calibrazione."""
    anagrafica = {}
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as handle:
        for riga in csv.DictReader(handle):
            match_id = riga.get("match_id")
            if match_id:
                anagrafica[match_id] = (riga.get("league_id"), riga.get("date"))
    return anagrafica


def carica_contesto():
    """Copertura dello snapshot di contesto: eventi, allenatori, rose, trasferimenti."""
    snapshot = None
    if os.path.isdir(CONTEXT_DIR):
        cartelle = sorted(
            nome for nome in os.listdir(CONTEXT_DIR)
            if os.path.isdir(os.path.join(CONTEXT_DIR, nome))
        )
        snapshot = cartelle[-1] if cartelle else None
    if not snapshot:
        return {"disponibile": False}

    base = os.path.join(CONTEXT_DIR, snapshot)
    riepilogo = {"disponibile": True, "snapshot": snapshot, "entita": {}}
    for entita in ("events", "managers", "players", "rosters", "team-context", "transfers"):
        percorso = os.path.join(base, entita)
        if not os.path.isdir(percorso):
            continue
        conteggio = sum(len(files) for _, _, files in os.walk(percorso))
        riepilogo["entita"][entita] = {"file": conteggio}

    campi_evento = defaultdict(int)
    eventi_totali = 0
    con_allenatore = 0
    eventi_dir = os.path.join(base, "events")
    if os.path.isdir(eventi_dir):
        for lega in sorted(os.listdir(eventi_dir)):
            percorso = os.path.join(eventi_dir, lega, "calibration.json")
            if not os.path.isfile(percorso):
                continue
            with open(percorso, "r", encoding="utf-8") as handle:
                blocco = json.load(handle)
            for evento in blocco.get("events", []):
                eventi_totali += 1
                for chiave, valore in evento.items():
                    if valore is not None and valore != []:
                        campi_evento[chiave] += 1
                if evento.get("homeCoachId") and evento.get("awayCoachId"):
                    con_allenatore += 1
    riepilogo["eventi_calibrazione"] = {
        "totale": eventi_totali,
        "con_entrambi_gli_allenatori": con_allenatore,
        "campi": dict(sorted(campi_evento.items(), key=lambda kv: -kv[1])),
    }
    return riepilogo


def scansiona(limite=None):
    anagrafica = carica_anagrafica_gare()

    squadra = defaultdict(Campo)
    tempo = defaultdict(Campo)
    tiro = defaultdict(Campo)
    posizioni = defaultdict(Campo)
    blocchi_alto_livello = defaultdict(int)
    per_lega = defaultdict(lambda: {"gare": 0, "campi": defaultdict(int)})
    assenze = defaultdict(lambda: {"riga_presente": 0, "entrambi_zero": 0, "asimmetriche": 0})

    gare_pannello = 0
    gare = 0
    date_viste = []
    tiri_per_gara = []
    momentum_per_gara = []
    xgmin_per_gara = []
    gare_senza_stats = []

    percorsi = []
    for lega in sorted(os.listdir(RAW_DIR)):
        cartella = os.path.join(RAW_DIR, lega)
        if not os.path.isdir(cartella):
            continue
        for nome in sorted(os.listdir(cartella)):
            if nome.endswith(".json"):
                percorsi.append((lega, nome, os.path.join(cartella, nome)))
    if limite:
        percorsi = percorsi[:limite]

    for lega, nome, percorso in percorsi:
        with open(percorso, "r", encoding="utf-8") as handle:
            payload = json.load(handle)

        match_id = nome[:-5]
        _, data = anagrafica.get(match_id, (None, None))
        if data:
            date_viste.append(data)

        gare += 1
        per_lega[lega]["gare"] += 1
        for chiave, valore in payload.items():
            if valore is not None:
                blocchi_alto_livello[chiave] += 1

        stats = payload.get("stats") or {}
        if not stats.get("home") and not stats.get("away"):
            gare_senza_stats.append(match_id)

        casa = stats.get("home") or {}
        ospite = stats.get("away") or {}
        for blocco in (casa, ospite):
            for chiave, valore in blocco.items():
                squadra[chiave].aggiungi(valore, lega)
                if valore is not None:
                    per_lega[lega]["campi"][chiave] += 1
                if isinstance(valore, dict):
                    for sotto, dentro in valore.items():
                        squadra[chiave + "." + sotto].aggiungi(dentro, lega)

        # Una riga statistica compare o per entrambe le squadre o per nessuna:
        # qui si misura se l'assenza coincide sempre con lo zero di entrambe.
        if "total_shots" in casa and "total_shots" in ospite:
            gare_pannello += 1
            for chiave in set(casa) | set(ospite):
                voce = assenze[chiave]
                voce["riga_presente"] += 1
                if (chiave in casa) != (chiave in ospite):
                    voce["asimmetriche"] += 1
                valore_casa = casa.get(chiave)
                valore_ospite = ospite.get(chiave)
                if (
                    isinstance(valore_casa, (int, float))
                    and isinstance(valore_ospite, (int, float))
                    and not isinstance(valore_casa, bool)
                    and valore_casa == 0
                    and valore_ospite == 0
                ):
                    voce["entrambi_zero"] += 1

        for meta in ("first_half", "second_half"):
            blocco_meta = stats.get(meta) or {}
            for lato in ("home", "away"):
                blocco = blocco_meta.get(lato) or {}
                for chiave, valore in blocco.items():
                    tempo[chiave].aggiungi(valore, lega)

        shotmap = payload.get("shotmap") or []
        tiri_per_gara.append(len(shotmap))
        for colpo in shotmap:
            if isinstance(colpo, dict):
                for chiave, valore in colpo.items():
                    tiro[chiave].aggiungi(valore, lega)

        momentum = payload.get("momentum") or []
        momentum_per_gara.append(len(momentum))

        xgmin = payload.get("xg_per_minute") or []
        xgmin_per_gara.append(len(xgmin) if isinstance(xgmin, list) else 0)

        medie = payload.get("average_positions") or {}
        if isinstance(medie, dict):
            for lato in ("home", "away"):
                voci = medie.get(lato) or []
                if isinstance(voci, list):
                    for voce in voci:
                        if isinstance(voce, dict):
                            for chiave, valore in voce.items():
                                posizioni[chiave].aggiungi(valore, lega)

    osservazioni_squadra = gare * 2
    risultato = {
        "generato_da": "scripts/projection/discovery/scan_archive.py",
        "sorgente": "archivio locale gia' scaricato, nessuna richiesta di rete",
        "gare_scansionate": gare,
        "leghe": len(per_lega),
        "intervallo_date": {
            "da": min(date_viste) if date_viste else None,
            "a": max(date_viste) if date_viste else None,
            "gare_con_data": len(date_viste),
        },
        "blocchi_di_primo_livello": dict(sorted(blocchi_alto_livello.items(), key=lambda kv: -kv[1])),
        "gare_senza_statistiche": len(gare_senza_stats),
        "gare_con_pannello_completo": gare_pannello,
        "analisi_assenze": {
            chiave: {
                "riga_presente": voce["riga_presente"],
                "riga_assente": gare_pannello - voce["riga_presente"],
                "quota_assente": round(1 - voce["riga_presente"] / gare_pannello, 6) if gare_pannello else None,
                "gare_con_entrambe_a_zero": voce["entrambi_zero"],
                "presenze_asimmetriche": voce["asimmetriche"],
                "assenza_significa_zero": bool(
                    voce["entrambi_zero"] == 0
                    and voce["asimmetriche"] == 0
                    and gare_pannello - voce["riga_presente"] > 0
                ),
            }
            for chiave, voce in sorted(assenze.items())
        },
        "statistiche_squadra": {
            chiave: campo.riassunto(osservazioni_squadra)
            for chiave, campo in sorted(squadra.items())
        },
        "statistiche_per_tempo": {
            chiave: campo.riassunto(osservazioni_squadra)
            for chiave, campo in sorted(tempo.items())
        },
        "campi_del_tiro": {
            chiave: campo.riassunto(sum(tiri_per_gara))
            for chiave, campo in sorted(tiro.items())
        },
        "campi_posizioni_medie": {
            chiave: campo.riassunto(max(sum(1 for _ in posizioni.values()), 1))
            for chiave, campo in sorted(posizioni.items())
        },
        "volumi": {
            "tiri_totali": sum(tiri_per_gara),
            "tiri_per_gara_media": round(sum(tiri_per_gara) / gare, 3) if gare else None,
            "gare_con_shotmap": sum(1 for n in tiri_per_gara if n > 0),
            "gare_con_momentum": sum(1 for n in momentum_per_gara if n > 0),
            "momentum_punti_media": round(sum(momentum_per_gara) / gare, 3) if gare else None,
            "gare_con_xg_per_minuto": sum(1 for n in xgmin_per_gara if n > 0),
        },
        "copertura_per_lega": {
            lega: {
                "gare": voce["gare"],
                "campi_sempre_presenti": sum(
                    1 for chiave, n in voce["campi"].items() if n == voce["gare"] * 2
                ),
                "campi_mai_presenti": 0,
            }
            for lega, voce in sorted(per_lega.items(), key=lambda kv: int(kv[0]))
        },
        "contesto": carica_contesto(),
    }
    return risultato


def main():
    parser = argparse.ArgumentParser(description="Ricognizione dell'archivio storico locale")
    parser.add_argument("--limit", type=int, default=None, help="scansiona solo le prime N gare")
    parser.add_argument("--out", default=os.path.join(OUT_DIR, "inventario-campi.json"))
    argomenti = parser.parse_args()

    if not os.path.isdir(RAW_DIR):
        print("archivio non trovato: " + RAW_DIR)
        return 1

    risultato = scansiona(argomenti.limit)
    os.makedirs(os.path.dirname(argomenti.out), exist_ok=True)
    with open(argomenti.out, "w", encoding="utf-8") as handle:
        json.dump(risultato, handle, ensure_ascii=False, indent=2, sort_keys=False)

    print("gare scansionate: " + str(risultato["gare_scansionate"]))
    print("leghe: " + str(risultato["leghe"]))
    print("intervallo: " + str(risultato["intervallo_date"]["da"]) + " -> " + str(risultato["intervallo_date"]["a"]))
    print("campi squadra distinti: " + str(len(risultato["statistiche_squadra"])))
    print("campi per tempo distinti: " + str(len(risultato["statistiche_per_tempo"])))
    print("campi del tiro distinti: " + str(len(risultato["campi_del_tiro"])))
    print("scritto: " + argomenti.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
