"""Registro dei modelli: che cosa esiste, che cosa e' stato misurato, che cosa puo' uscire.

Il registro non decide da solo. Calcola lo stato a partire da prove gia' scritte altrove —
la validazione a finestra avanzante, i controlli di contaminazione del dataset, l'esito del
test di parita' — e dichiara, condizione per condizione, che cosa manca a un modello per
essere promosso.

Gli stati:

    experimental  esiste e si puo' studiare, non si mostra
    validated     ha superato tutte le condizioni misurabili
    production    scelto da una persona fra i validati: questo registro non lo assegna
    disabled      escluso deliberatamente

La promozione a `production` resta una decisione umana. Il registro la prepara e non la
prende: e' l'unico modo perche' resti una scelta e non un effetto collaterale.

Nessuna richiesta di rete. Sola lettura, tranne il registro che scrive.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/registry.py
"""

import argparse
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ARTEFATTI = os.path.join(os.path.dirname(__file__), "output", "artefatti")
VALIDAZIONI = os.path.join(os.path.dirname(__file__), "output")
RAPPORTI_FEATURE = os.path.join(ROOT, "scripts", "projection", "dataset", "output", "features")
ABLAZIONI = os.path.join(os.path.dirname(__file__), "output")
OUT = os.path.join(ROOT, "data", "registro-modelli.json")

SCHEMA = "registro-modelli/1"
# Nella cartella degli artefatti vivono anche i campioni di riscontro e l'esito della
# parita': si riconosce un artefatto dal suo schema, non dal suo nome.
SCHEMA_ARTEFATTO = "artefatto-modello/1"


def carica(percorso):
    with open(percorso, "r", encoding="utf-8") as handle:
        return json.load(handle)


def esiti_di_parita():
    percorso = os.path.join(ARTEFATTI, "parita-esito.json")
    if not os.path.isfile(percorso):
        return {}
    rapporto = carica(percorso)
    return {voce["model_id"]: voce for voce in rapporto.get("esiti", [])}


def maggioranza_di_origini(testo):
    """Legge «5/5» e dice se le origini vinte sono la maggioranza."""
    if not testo or "/" not in testo:
        return False, None, None
    vinte, confronti = testo.split("/", 1)
    try:
        vinte, confronti = int(vinte), int(confronti)
    except ValueError:
        return False, None, None
    if confronti == 0:
        return False, vinte, confronti
    return vinte > confronti / 2, vinte, confronti


def condizioni(artefatto, parita):
    """Le condizioni del cancello di promozione, ognuna con il numero che la sostiene."""
    metriche = artefatto.get("validation_metrics") or {}
    vantaggio = metriche.get("vantaggio_su_migliore_baseline")
    maggioranza, vinte, confronti = maggioranza_di_origini(
        metriche.get("origini_vinte_su_migliore_baseline"))

    percorso_feature = os.path.join(RAPPORTI_FEATURE, artefatto["target"] + "-rapporto.json")
    contaminazione = None
    if os.path.isfile(percorso_feature):
        contaminazione = carica(percorso_feature)["controlli_contaminazione"]["passati"]

    return {
        "batte_la_migliore_baseline": {
            "soddisfatta": bool(vantaggio is not None and vantaggio > 0),
            "vantaggio": vantaggio,
            "migliore_baseline": metriche.get("migliore_baseline"),
        },
        "vantaggio_stabile_sulle_origini": {
            "soddisfatta": maggioranza,
            "origini_vinte": vinte,
            "origini_confrontate": confronti,
        },
        "controlli_di_contaminazione_passati": {
            "soddisfatta": contaminazione is True,
            "esito": contaminazione,
        },
        "parita_con_typescript": {
            "soddisfatta": bool(parita and parita.get("superato")),
            "righe_confrontate": parita.get("righe") if parita else None,
            "scarto_massimo_predittore_relativo": (
                parita.get("scarto_massimo_predittore_relativo") if parita else None),
            "scarto_massimo_valore_atteso": (
                parita.get("scarto_massimo_valore_atteso") if parita else None),
        },
        "intervallo_calibrato": {
            "soddisfatta": artefatto["calibration"]["copertura_sul_periodo_di_addestramento"]
            is not None,
            "copertura_sul_periodo_di_addestramento":
                artefatto["calibration"]["copertura_sul_periodo_di_addestramento"],
            "copertura_fuori_campione": metriche.get("copertura_intervallo"),
            "livello_dichiarato": artefatto["calibration"]["livello_dichiarato"],
        },
    }


def blocchi_utili(target):
    """I blocchi di feature che l'ablazione ha trovato utili, e quelli che non pagano."""
    percorso = os.path.join(ABLAZIONI, target + "-ablazione.json")
    if not os.path.isfile(percorso):
        return None
    rapporto = carica(percorso)
    utili = []
    inutili = []
    for voce in rapporto.get("lascia_fuori_uno", []):
        costo = voce["costo"].get("ridge")
        if costo is None:
            continue
        (utili if costo > 0 else inutili).append({"blocco": voce["senza"], "costo": costo})
    return {
        "misurata": True,
        "blocchi_che_pagano": sorted(utili, key=lambda voce: -voce["costo"]),
        "blocchi_che_non_pagano": inutili,
        "blocchi_non_disponibili": sorted(rapporto.get("blocchi_non_disponibili", {}).keys()),
    }


def costruisci():
    if not os.path.isdir(ARTEFATTI):
        return None, "nessun artefatto: eseguire prima export_model.py"

    parita = esiti_di_parita()
    voci = []
    for nome in sorted(os.listdir(ARTEFATTI)):
        if not nome.endswith(".json"):
            continue
        artefatto = carica(os.path.join(ARTEFATTI, nome))
        if artefatto.get("schema_version") != SCHEMA_ARTEFATTO:
            continue
        prove = condizioni(artefatto, parita.get(artefatto["model_id"]))
        tutte = all(voce["soddisfatta"] for voce in prove.values())
        mancanti = [chiave for chiave, voce in prove.items() if not voce["soddisfatta"]]

        dichiarato = artefatto.get("stato", "experimental")
        if dichiarato == "disabled":
            stato = "disabled"
        elif dichiarato == "production":
            stato = "production"
        else:
            stato = "validated" if tutte else "experimental"

        voci.append({
            "model_id": artefatto["model_id"],
            "model_version": artefatto["model_version"],
            "target": artefatto["target"],
            "model_type": artefatto["model_type"],
            "stato": stato,
            "artefatto": nome,
            "checksum": artefatto["checksum"],
            "feature": len(artefatto["feature_schema"]["ordine"]),
            "addestramento": artefatto["training_metadata"],
            "calibrazione": {
                "dispersione": artefatto["calibration"]["dispersione"],
                "distribuzione_intervallo": artefatto["calibration"]["distribuzione_intervallo"],
                "livello_nominale": artefatto["calibration"]["livello_nominale"],
                "livello_dichiarato": artefatto["calibration"]["livello_dichiarato"],
            },
            "metriche_di_validazione": artefatto.get("validation_metrics"),
            "condizioni_di_promozione": prove,
            "idoneo_a_produzione": tutte,
            "condizioni_mancanti": mancanti,
            "blocchi_di_feature": blocchi_utili(artefatto["target"]),
        })

    registro = {
        "schema": SCHEMA,
        "generato_da": "scripts/projection/models/registry.py",
        "stati": {
            "experimental": "esiste e si puo' studiare, non si mostra",
            "validated": "ha superato tutte le condizioni misurabili",
            "production": "scelto da una persona fra i validati: il registro non lo assegna",
            "disabled": "escluso deliberatamente",
        },
        "regola_di_promozione": (
            "un modello diventa validated solo se batte la migliore baseline fuori "
            "campione, vince la maggioranza delle origini, passa i controlli di "
            "contaminazione, supera il test di parita' con TypeScript e ha un intervallo "
            "calibrato. Il passaggio a production resta una decisione umana"
        ),
        "modelli": voci,
    }
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(registro, handle, ensure_ascii=False, indent=2)
    return registro, None


def main():
    argparse.ArgumentParser(description="Registro dei modelli").parse_args()

    registro, errore = costruisci()
    if errore:
        print(errore)
        return 1

    print("modelli registrati: " + str(len(registro["modelli"])))
    for voce in registro["modelli"]:
        riga = voce["model_id"].ljust(30) + voce["stato"].ljust(14)
        metriche = voce["metriche_di_validazione"] or {}
        riga += ("mae " + str(metriche.get("mae"))).ljust(14)
        riga += ("vs base " + str(metriche.get("vantaggio_su_migliore_baseline"))).ljust(22)
        riga += "origini " + str(metriche.get("origini_vinte_su_migliore_baseline"))
        print(riga)
        if voce["condizioni_mancanti"]:
            print("    manca: " + ", ".join(voce["condizioni_mancanti"]))
    print("scritto: " + OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
