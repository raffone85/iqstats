"""Test del doppio conteggio: che cosa contiene davvero il conteggio aggregato dei cartellini.

La domanda prescritta in docs/architecture/dizionario-metriche.md e' una sola: il
conteggio aggregato dei gialli del pannello comprende gia' la seconda ammonizione? Se la
comprende, sommarla di nuovo la conterebbe due volte.

L'archivio pero' mostra che gli assi da isolare sono tre, non uno:

    seconda ammonizione   episodio con card_type yellowRed
    cartellino non attribuito   episodio senza identificativo del giocatore, minuto -5
    cartellino alla panchina    episodio con is_manager vero

Il metodo isola un asse per volta. Per l'asse X si guardano i soli lati squadra-gara in
cui X e' presente e gli altri due assi sono assenti, e si confronta il valore del pannello
con il conteggio degli episodi attribuiti, prima senza X e poi con X. Il gruppo di
controllo sono i lati in cui nessuno dei tre assi compare: serve a stabilire che episodi e
pannello concordino, prima di leggere qualunque disaccordo come una regola di conteggio.

Lo stesso test si applica al conteggio aggregato dei rossi, dove la seconda ammonizione e'
l'asse decisivo per la ricostruzione.

Nessuna richiesta di rete. Sola lettura.

Uso:
    .venv/Scripts/python.exe scripts/projection/dataset/verify_cards.py
    .venv/Scripts/python.exe scripts/projection/dataset/verify_cards.py --limit 500
"""

import argparse
import json
import os
import sys
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
RAW_DIR = os.path.join(ROOT, "scripts", "calibration", "data", "raw")
EPISODI_DIR = os.path.join(ROOT, "scripts", "projection", "harvest", "data", "incidents")
OUT_DIR = os.path.join(os.path.dirname(__file__), "output")

ASSI = ["seconda", "non_attribuiti", "panchina"]


def componenti_vuote():
    return {
        "giallo": 0,          # giallo attribuito, giocatore in campo
        "rosso_diretto": 0,   # rosso attribuito, giocatore in campo
        "seconda": 0,         # espulsione per seconda ammonizione
        "non_attribuiti": 0,  # cartellino senza identificativo del giocatore
        "panchina": 0,        # cartellino a panchina o staff
    }


def conta_episodi(percorso):
    """Scompone i cartellini di una gara nelle componenti che il test deve isolare."""
    with open(percorso, "r", encoding="utf-8") as handle:
        payload = json.load(handle)

    conteggi = {"home": componenti_vuote(), "away": componenti_vuote()}
    tipi = Counter()
    senza_lato = 0

    for episodio in payload.get("incidents") or []:
        if episodio.get("type") != "card":
            continue
        natura = episodio.get("card_type")
        tipi[str(natura)] += 1
        if episodio.get("is_home") is None:
            senza_lato += 1
            continue
        lato = "home" if episodio.get("is_home") else "away"
        voce = conteggi[lato]

        if episodio.get("is_manager"):
            voce["panchina"] += 1
        elif episodio.get("player_id") is None:
            voce["non_attribuiti"] += 1
        elif natura == "yellow":
            voce["giallo"] += 1
        elif natura == "yellowRed":
            voce["seconda"] += 1
        elif natura == "red":
            voce["rosso_diretto"] += 1

    return conteggi, tipi, senza_lato


class Prova:
    """Accumula il confronto fra pannello ed episodi per un singolo conteggio aggregato."""

    def __init__(self):
        self.controllo = {"lati": 0, "accordo": 0, "scarto": 0}
        self.assi = {
            asse: {
                "lati": 0,
                "accordo_escluso": 0, "accordo_incluso": 0,
                "scarto_escluso": 0, "scarto_incluso": 0,
                "esempi": [],
            }
            for asse in ASSI
        }

    def aggiungi(self, pannello, base, componenti, event_id, lato):
        presenti = [asse for asse in ASSI if componenti[asse] > 0]
        if not presenti:
            self.controllo["lati"] += 1
            self.controllo["scarto"] += base - pannello
            if base == pannello:
                self.controllo["accordo"] += 1
            return
        if len(presenti) > 1:
            return  # asse non isolato: non dice nulla di nessuno dei due
        asse = presenti[0]
        voce = self.assi[asse]
        voce["lati"] += 1
        incluso = base + componenti[asse]
        voce["scarto_escluso"] += base - pannello
        voce["scarto_incluso"] += incluso - pannello
        if base == pannello:
            voce["accordo_escluso"] += 1
        if incluso == pannello:
            voce["accordo_incluso"] += 1
        if base != pannello and incluso != pannello and len(voce["esempi"]) < 5:
            voce["esempi"].append({
                "event_id": event_id, "lato": lato,
                "pannello": pannello, "episodi": dict(componenti),
            })

    def rapporto(self):
        def quota(numeratore, denominatore):
            return round(numeratore / denominatore, 6) if denominatore else None

        uscita = {
            "controllo": {
                "lati": self.controllo["lati"],
                "accordo": quota(self.controllo["accordo"], self.controllo["lati"]),
                "scarto_totale": self.controllo["scarto"],
            },
            "assi": {},
        }
        for asse in ASSI:
            voce = self.assi[asse]
            uscita["assi"][asse] = {
                "lati": voce["lati"],
                "accordo_escluso": quota(voce["accordo_escluso"], voce["lati"]),
                "accordo_incluso": quota(voce["accordo_incluso"], voce["lati"]),
                "scarto_totale_escluso": voce["scarto_escluso"],
                "scarto_totale_incluso": voce["scarto_incluso"],
                "verdetto": verdetto_asse(voce),
                "esempi_di_disaccordo": voce["esempi"],
            }
        return uscita


def verdetto_asse(voce):
    """Regola dichiarata: serve un campione utile e uno scarto netto fra le due ipotesi."""
    if voce["lati"] < 30:
        return "campione insufficiente"
    escluso = voce["accordo_escluso"] / voce["lati"]
    incluso = voce["accordo_incluso"] / voce["lati"]
    if incluso - escluso >= 0.10:
        return "compreso nel conteggio aggregato"
    if escluso - incluso >= 0.10:
        return "non compreso nel conteggio aggregato"
    return "indistinguibile"


def elenca_episodi():
    percorsi = {}
    if not os.path.isdir(EPISODI_DIR):
        return percorsi
    for lega in sorted(os.listdir(EPISODI_DIR)):
        cartella = os.path.join(EPISODI_DIR, lega)
        if not os.path.isdir(cartella):
            continue
        for nome in sorted(os.listdir(cartella)):
            if nome.endswith(".json"):
                percorsi[nome[:-5]] = os.path.join(cartella, nome)
    return percorsi


def numero(valore):
    if isinstance(valore, bool) or not isinstance(valore, (int, float)):
        return None
    return valore


def verifica(limite=None):
    episodi = elenca_episodi()

    percorsi = []
    for lega in sorted(os.listdir(RAW_DIR), key=int):
        cartella = os.path.join(RAW_DIR, lega)
        if not os.path.isdir(cartella):
            continue
        for nome in sorted(os.listdir(cartella)):
            if nome.endswith(".json") and nome[:-5] in episodi:
                percorsi.append((nome[:-5], os.path.join(cartella, nome)))
    if limite:
        percorsi = percorsi[:limite]

    tipi_totali = Counter()
    senza_lato = 0
    gare_con_pannello = 0
    gare_riga_gialli = 0
    gare_riga_rossi = 0
    prova_gialli = Prova()
    prova_rossi = Prova()

    for event_id, percorso in percorsi:
        conteggi, tipi, ignoti = conta_episodi(episodi[event_id])
        tipi_totali.update(tipi)
        senza_lato += ignoti

        with open(percorso, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        stats = payload.get("stats") or {}
        casa = stats.get("home") or {}
        ospite = stats.get("away") or {}
        if "total_shots" not in casa or "total_shots" not in ospite:
            continue
        gare_con_pannello += 1
        riga_gialli = "yellow_cards" in casa and "yellow_cards" in ospite
        riga_rossi = "red_cards" in casa and "red_cards" in ospite
        if riga_gialli:
            gare_riga_gialli += 1
        if riga_rossi:
            gare_riga_rossi += 1

        for lato, blocco in (("home", casa), ("away", ospite)):
            componenti = conteggi[lato]
            if riga_gialli:
                pannello = numero(blocco.get("yellow_cards"))
                if pannello is not None:
                    prova_gialli.aggiungi(
                        pannello, componenti["giallo"], componenti, event_id, lato)
            if riga_rossi:
                pannello = numero(blocco.get("red_cards"))
                if pannello is not None:
                    prova_rossi.aggiungi(
                        pannello, componenti["rosso_diretto"], componenti, event_id, lato)

    rapporto = {
        "generato_da": "scripts/projection/dataset/verify_cards.py",
        "gare_con_episodi": len(episodi),
        "gare_con_pannello": gare_con_pannello,
        "gare_con_riga_gialli": gare_riga_gialli,
        "gare_con_riga_rossi": gare_riga_rossi,
        "episodi_per_natura": dict(tipi_totali),
        "episodi_senza_lato": senza_lato,
        "gialli": prova_gialli.rapporto(),
        "rossi": prova_rossi.rapporto(),
        "nota_metodo": (
            "per ogni asse si contano i soli lati in cui quell'asse e' presente e gli altri "
            "due sono assenti: il confronto e' quindi isolato e non confuso"
        ),
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    uscita = os.path.join(OUT_DIR, "verifica-cartellini.json")
    with open(uscita, "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=2)
    return rapporto, uscita


def main():
    parser = argparse.ArgumentParser(description="Test del doppio conteggio dei cartellini")
    parser.add_argument("--limit", type=int, default=None)
    argomenti = parser.parse_args()

    rapporto, uscita = verifica(argomenti.limit)
    print("gare con episodi: " + str(rapporto["gare_con_episodi"]))
    print("gare con pannello: " + str(rapporto["gare_con_pannello"]))
    print("episodi per natura: " + json.dumps(rapporto["episodi_per_natura"], ensure_ascii=False))
    for conteggio in ("gialli", "rossi"):
        blocco = rapporto[conteggio]
        controllo = blocco["controllo"]
        print(conteggio + " - controllo: " + str(controllo["lati"]) + " lati, accordo "
              + str(controllo["accordo"]) + ", scarto " + str(controllo["scarto_totale"]))
        for asse in ASSI:
            voce = blocco["assi"][asse]
            print("  " + asse + ": " + str(voce["lati"]) + " lati"
                  + "  escluso " + str(voce["accordo_escluso"])
                  + "  incluso " + str(voce["accordo_incluso"])
                  + "  -> " + voce["verdetto"])
    print("scritto: " + uscita)
    return 0


if __name__ == "__main__":
    sys.exit(main())
