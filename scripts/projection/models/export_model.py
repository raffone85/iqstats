"""Esporta un modello in un artefatto versionato, leggibile da TypeScript.

L'artefatto e' l'unico ponte fra l'addestramento in Python e la previsione
nell'applicazione: contiene tutto cio' che serve a rifare lo stesso calcolo, e niente
altro. Nessun codice, nessun riferimento alla fonte, nessun segreto.

Vengono esportati soltanto i modelli riproducibili: il predittore lineare, la funzione di
collegamento, il taglio a zero e i parametri dell'intervallo sono numeri, non librerie.

Insieme all'artefatto si scrive una **tavola di riscontro**: un campione di righe con le
feature grezze e i valori che Python ottiene da quelle righe. E' la base del test di
parita': TypeScript deve ritrovare gli stessi numeri partendo dallo stesso artefatto.

Il checksum copre i byte del file dell'artefatto e vive in un file accanto: cosi' non
dipende da come i due linguaggi scrivono i numeri in JSON, che e' l'unico punto in cui
potrebbero divergere senza che nessuno se ne accorga.

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/export_model.py --target yellow_cards
    .venv/Scripts/python.exe scripts/projection/models/export_model.py --target fouls --modello ridge
    .venv/Scripts/python.exe scripts/projection/models/export_model.py --target fouls \
        --densita-minima 0.80 --solo-manifesto --suffisso-validazione=-manifesto
"""

import argparse
import hashlib
import json
import os
import sys

import numpy as np
import pandas as pd
from sklearn.linear_model import PoissonRegressor, Ridge
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import evaluate  # noqa: E402  (stesso pacchetto, caricato dopo il percorso)
import validate_maturity  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "output", "artefatti")
SCHEMA = "artefatto-modello/1"
VERSIONE_ARTEFATTO = "1.0.0"
RIGHE_DI_RISCONTRO = 200

COLLEGAMENTO = {"poisson_glm": "log", "ridge": "identita"}


def addestra(nome, x, y):
    """Ritorna scalatore e modello gia' addestrati, con la stessa configurazione validata."""
    scalatore = StandardScaler().fit(x)
    if nome == "poisson_glm":
        modello = PoissonRegressor(alpha=1.0, max_iter=1000)
    elif nome == "ridge":
        modello = Ridge(alpha=10.0)
    else:
        return None, None
    modello.fit(scalatore.transform(x), y)
    return scalatore, modello


def previsione(nome, scalatore, modello, x):
    grezza = modello.predict(scalatore.transform(x))
    if nome == "poisson_glm":
        return grezza
    return np.clip(grezza, 0.0, None)


def predittore_lineare(scalatore, modello, x):
    """Il predittore lineare prima del collegamento e prima del taglio a zero."""
    return scalatore.transform(x) @ modello.coef_ + modello.intercept_


def metriche_di_validazione(target, nome, suffisso=""):
    percorso = os.path.join(os.path.dirname(__file__), "output",
                            target + suffisso + "-validazione.json")
    if not os.path.isfile(percorso):
        return None
    with open(percorso, "r", encoding="utf-8") as handle:
        rapporto = json.load(handle)
    voce = rapporto["complessivo"].get(nome)
    if voce is None:
        return None
    migliore = rapporto.get("migliore_baseline")
    return {
        "metodo": "finestra avanzante su " + str(len(rapporto["origini"])) + " origini",
        "mae": voce["mae"],
        "rmse": voce["rmse"],
        "bias": voce["bias"],
        "mae_mediano": voce["mae_mediano"],
        "copertura_intervallo": voce.get("copertura_intervallo"),
        "migliore_baseline": migliore,
        "mae_migliore_baseline": rapporto["complessivo"][migliore]["mae"] if migliore else None,
        "vantaggio_su_migliore_baseline": voce.get("vantaggio_su_migliore_baseline"),
        "origini_vinte_su_migliore_baseline": voce.get("origini_vinte_su_migliore_baseline"),
    }


def esporta(target, nome_modello, densita_minima, solo_manifesto=False, suffisso_validazione=""):
    tavola = evaluate.carica(target)
    colonne, _ = evaluate.colonne_feature(tavola, densita_minima)
    if solo_manifesto:
        scelte = evaluate.colonne_dal_manifesto(target, set(colonne))
        if scelte is None:
            return None, "nessuna voce di manifesto per il target " + target
        colonne = scelte

    bersaglio = pd.to_numeric(tavola["valore_noto"], errors="coerce")
    matrice = tavola[colonne].apply(pd.to_numeric, errors="coerce")
    matrice = matrice.replace([np.inf, -np.inf], np.nan)
    completa = matrice.notna().all(axis=1) & bersaglio.notna()

    utilizzabili = tavola[completa].reset_index(drop=True)
    x = matrice[completa].to_numpy(dtype=float)
    y = bersaglio[completa].to_numpy(dtype=float)

    scalatore, modello = addestra(nome_modello, x, y)
    if modello is None:
        return None, "modello non esportabile: " + nome_modello

    atteso = previsione(nome_modello, scalatore, modello, x)
    disp = evaluate.dispersione_residua(y, atteso)
    livello, copertura_addestramento = evaluate.calibra_livello(y, atteso, disp)
    basso, alto = evaluate.intervallo(atteso, disp, livello)

    distribuzione = ("poisson" if disp <= evaluate.SOGLIA_POISSON else "binomiale_negativa")
    model_id = target + "__" + nome_modello

    artefatto = {
        "schema_version": SCHEMA,
        "model_id": model_id,
        "model_version": VERSIONE_ARTEFATTO,
        "target": target,
        "model_type": nome_modello,
        "stato": "experimental",
        "feature_schema": {
            "ordine": list(colonne),
            "preprocessing": {
                "tipo": "standardizzazione",
                "media": [float(valore) for valore in scalatore.mean_],
                "scala": [float(valore) for valore in scalatore.scale_],
            },
            "valori_mancanti": (
                "non ammessi: se una sola feature manca la previsione non si produce, "
                "non si sostituisce"
            ),
            "valori_non_finiti": "trattati come mancanti",
        },
        "coefficients": [float(valore) for valore in modello.coef_],
        "intercept": float(modello.intercept_),
        "collegamento": COLLEGAMENTO[nome_modello],
        "taglio": {
            "minimo": 0.0,
            "massimo": None,
            "applicato_a": ("nessuno: il collegamento logaritmico e' gia' positivo"
                            if nome_modello == "poisson_glm" else "valore atteso"),
        },
        "calibration": {
            "dispersione": float(disp),
            "soglia_poisson": evaluate.SOGLIA_POISSON,
            "distribuzione_intervallo": distribuzione,
            "livello_nominale": float(livello),
            "livello_dichiarato": evaluate.LIVELLO_INTERVALLO,
            "copertura_sul_periodo_di_addestramento": copertura_addestramento,
            "nota": (
                "la dispersione e' stimata sui residui del modello e il livello nominale "
                "e' calibrato sul solo periodo di addestramento"
            ),
        },
        "training_metadata": {
            "righe": int(len(utilizzabili)),
            "da": str(utilizzabili["quando"].min()),
            "a": str(utilizzabili["quando"].max()),
            "leghe": int(utilizzabili["league_id"].nunique()),
            "min_previous_matches": evaluate_min_previous(),
            "feature_candidate": len(colonne),
            "densita_minima_richiesta": densita_minima,
            "selezione_feature": provenienza_delle_feature(solo_manifesto),
        },
        "maturita": parametri_di_maturita(target, nome_modello, utilizzabili, y, atteso, colonne),
        "validation_metrics": metriche_di_validazione(target, nome_modello, suffisso_validazione),
        "checksum": {
            "algoritmo": "sha256",
            "ambito": "byte del file dell'artefatto",
            "file": model_id + ".json.sha256",
        },
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    percorso = os.path.join(OUT_DIR, model_id + ".json")
    with open(percorso, "w", encoding="utf-8") as handle:
        json.dump(artefatto, handle, ensure_ascii=False, indent=2)

    with open(percorso, "rb") as handle:
        impronta = hashlib.sha256(handle.read()).hexdigest()
    with open(percorso + ".sha256", "w", encoding="utf-8") as handle:
        handle.write(impronta + "\n")

    # Tavola di riscontro: le ultime righe in ordine di tempo, senza sorteggio, cosi' che
    # due esecuzioni producano lo stesso campione.
    quante = min(RIGHE_DI_RISCONTRO, len(utilizzabili))
    scelte = np.arange(len(utilizzabili) - quante, len(utilizzabili))
    eta = predittore_lineare(scalatore, modello, x[scelte])
    riscontro = {
        "schema_version": "riscontro-parita/1",
        "model_id": model_id,
        "artefatto": model_id + ".json",
        "checksum_artefatto": impronta,
        "ordine_feature": list(colonne),
        "tolleranze": {
            "predittore_lineare_relativa": 1e-9,
            "valore_atteso_assoluta": 1e-6,
            "estremi_intervallo_assoluta": 1e-6,
        },
        "righe": [
            {
                "event_id": str(utilizzabili.iloc[int(indice)]["event_id"]),
                "lato": str(utilizzabili.iloc[int(indice)]["lato"]),
                "feature": [float(valore) for valore in x[int(indice)]],
                "predittore_lineare": float(eta[posizione]),
                "valore_atteso": float(atteso[int(indice)]),
                "intervallo_basso": float(basso[int(indice)]),
                "intervallo_alto": float(alto[int(indice)]),
            }
            for posizione, indice in enumerate(scelte)
        ],
    }
    percorso_riscontro = os.path.join(OUT_DIR, model_id + "-riscontro.json")
    with open(percorso_riscontro, "w", encoding="utf-8") as handle:
        json.dump(riscontro, handle, ensure_ascii=False, indent=2)

    return {
        "artefatto": percorso,
        "riscontro": percorso_riscontro,
        "checksum": impronta,
        "righe_addestramento": int(len(utilizzabili)),
        "feature": len(colonne),
        "dispersione": round(float(disp), 4),
        "distribuzione": distribuzione,
        "livello_nominale": round(float(livello), 3),
        "righe_di_riscontro": quante,
    }, None


def evaluate_min_previous():
    """Il minimo di gare precedenti e' deciso nel costruttore del dataset, non qui."""
    return 3


def ripiego_ordinato(voce_fascia):
    """I gradini di ripiego in ordine di errore misurato, non nell'ordine del metodo.

    Il metodo mette la baseline dell'avversario prima di quella con restringimento. Sui
    dati non e' sempre vero: con poco storico il profilo dell'avversario e' il peggiore di
    tutti, e anche a storico pieno vince solo su alcuni bersagli. L'ordine si misura.
    """
    if not voce_fascia:
        return None
    candidati = (
        ("baseline_attacco_contro_concesso", "C_baseline_avversario"),
        ("baseline_restringimento", "D_baseline_restringimento"),
    )
    gradini = []
    for colonna, nome in candidati:
        misura = voce_fascia.get("metodi", {}).get(nome)
        if misura:
            gradini.append({"colonna": colonna, "mae_fuori_campione": misura["mae"],
                            "righe_di_prova": misura["n"]})
    return sorted(gradini, key=lambda gradino: gradino["mae_fuori_campione"]) or None


def parametri_di_maturita(target, nome_modello, tavola, y, atteso, colonne):
    """La fascia di storico della squadra: peso della miscela, intervallo e affidabilita'.

    I pesi vengono dalla validazione a finestra avanzante, dove ogni origine li ha stimati
    sul proprio periodo di addestramento: in quel periodo le righe di fascia EARLY sono
    centinaia, mentre nel periodo di prova sono decine. Dispersione e livello nominale,
    invece, si stimano qui dentro la fascia sul valore gia' mescolato, perche' e' quello
    che il lato che prevede produrra'.
    """
    percorso = os.path.join(os.path.dirname(__file__), "output", target + "-maturita.json")
    if not os.path.isfile(percorso):
        return None
    with open(percorso, "r", encoding="utf-8") as handle:
        rapporto = json.load(handle)
    if rapporto.get("modello") != nome_modello:
        return None
    if "baseline_restringimento" not in colonne:
        return None

    ripiego = pd.to_numeric(tavola["baseline_restringimento"], errors="coerce").to_numpy()
    gare = pd.to_numeric(tavola["gare_precedenti"], errors="coerce").to_numpy()
    misurati = rapporto.get("per_fascia_della_squadra", {})

    per_fascia = {}
    for nome, minimo, massimo in validate_maturity.FASCE:
        voce = rapporto["parametri_per_fascia"].get(nome)
        if voce is None:
            continue
        dentro = (gare >= minimo) & (gare <= massimo)
        peso = float(voce["peso_della_miscela"])
        mescolato = peso * atteso[dentro] + (1.0 - peso) * ripiego[dentro]
        disp = evaluate.dispersione_residua(y[dentro], mescolato)
        livello, copertura = evaluate.calibra_livello(y[dentro], mescolato, disp)
        per_fascia[nome] = {
            "da": minimo,
            "a": None if massimo > 1000 else massimo,
            "peso_della_miscela": peso,
            "mescolato_con": "baseline_restringimento",
            "righe_di_addestramento_nella_fascia": int(dentro.sum()),
            "dispersione": round(float(disp), 4),
            "distribuzione_intervallo": (
                "poisson" if disp <= evaluate.SOGLIA_POISSON else "binomiale_negativa"),
            "livello_nominale": round(float(livello), 3),
            "copertura_sul_periodo_di_addestramento": copertura,
            "ripiego_ordinato": ripiego_ordinato(misurati.get(nome)),
            "evidenza_fuori_campione": {
                "mae": voce.get("mae_fuori_campione"),
                "errore_standard_mae": voce.get("errore_standard_mae"),
                "bias": voce.get("bias_fuori_campione"),
                "righe_di_prova": voce.get("righe_di_prova"),
                "instabilita_fra_origini": voce.get("instabilita_fra_origini"),
                "pesi_per_origine": voce.get("pesi_per_origine"),
            },
        }

    return {
        "colonna_del_campione": "gare_precedenti",
        "significato": (
            "maturita' del campione della squadra, mai disponibilita' del motore: con tre "
            "gare precedenti il motore prevede"
        ),
        "regola": (
            "il valore atteso e' la miscela fra il modello e la baseline con "
            "restringimento, con il peso della fascia; l'intervallo usa dispersione e "
            "livello nominale della fascia"
        ),
        "affidabilita": (
            "non ancora definita: in fascia EARLY l'oscillazione dell'errore fra origini "
            "e' minore di quella che il caso produce da solo con ventisei righe per "
            "origine, quindi la stabilita' non e' misurabile li' e non puo' sostenere una "
            "affidabilita'. L'evidenza per fascia e' esposta qui sotto"
        ),
        "sotto_il_minimo": (
            "con meno di " + str(evaluate_min_previous()) + " gare precedenti il modello "
            "del bersaglio non si applica: si scende nella gerarchia di ripiego"
        ),
        "per_fascia": per_fascia,
    }


def provenienza_delle_feature(solo_manifesto):
    """Da dove viene l'elenco delle colonne: dal manifesto, oppure dalla sola densita'.

    Sta nell'artefatto perche' due modelli con lo stesso nome e feature diverse sono due
    modelli diversi, e senza questa riga il registro non sa quale dei due sta descrivendo.
    """
    if not solo_manifesto:
        return "densita minima sulle colonne del dataset"
    with open(evaluate.MANIFESTO, "r", encoding="utf-8") as handle:
        versione = json.load(handle)["versione_schema"]
    return "data/manifesto-feature.json versione " + versione


def main():
    parser = argparse.ArgumentParser(description="Esporta un modello in un artefatto")
    parser.add_argument("--target", required=True)
    parser.add_argument("--modello", default="poisson_glm", choices=sorted(evaluate.ESPORTABILI))
    parser.add_argument("--densita-minima", type=float, default=0.95)
    parser.add_argument("--solo-manifesto", action="store_true",
                        help="usa le sole feature promosse dal manifesto per questo target")
    parser.add_argument("--suffisso-validazione", default="",
                        help="suffisso del rapporto di validazione da citare nell'artefatto")
    argomenti = parser.parse_args()

    esito, errore = esporta(argomenti.target, argomenti.modello, argomenti.densita_minima,
                            argomenti.solo_manifesto, argomenti.suffisso_validazione)
    if errore:
        print(errore)
        return 1

    print("target: " + argomenti.target + " | modello: " + argomenti.modello)
    print("righe di addestramento: " + str(esito["righe_addestramento"])
          + " | feature: " + str(esito["feature"]))
    print("dispersione: " + str(esito["dispersione"])
          + " | intervallo: " + esito["distribuzione"]
          + " | livello nominale: " + str(esito["livello_nominale"]))
    print("checksum: " + esito["checksum"])
    print("scritto: " + esito["artefatto"])
    print("scritto: " + esito["riscontro"] + " (" + str(esito["righe_di_riscontro"]) + " righe)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
