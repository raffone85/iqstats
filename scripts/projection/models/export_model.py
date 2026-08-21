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
import math
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

# Le fasce di lettura dell'affidabilita': sono rappresentazione, non dato. Il dato e' la
# quota misurata; la fascia serve solo a chi legge.
FASCE_DI_LETTURA = ((0, 50, "BASSA"), (50, 70, "MODERATA"), (70, 85, "ALTA"),
                    (85, 101, "MOLTO ALTA"))

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


def esporta(target, nome_modello, densita_minima, solo_manifesto=False, suffisso_validazione="",
            stato="experimental"):
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
        # Lo stato lo dichiara l'artefatto e il registro lo legge (registry.py:152). Il
        # passaggio a `production` e' una decisione umana: arriva da fuori, non si
        # calcola qui, e non ha un valore predefinito diverso da `experimental`.
        "stato": stato,
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
        "affidabilita": affidabilita_dichiarata(target, nome_modello, suffisso_validazione,
                                                colonne),
        "totale": totale_dichiarato(target, nome_modello, utilizzabili, y, atteso),
        "linee": {
            "quante": 5,
            "regola": (
                "il centro e' l'atteso arrotondato meno mezzo, poi due soglie sotto e due "
                "sopra a passo di una unita'"
            ),
            "passi": [-2.0, -1.0, 0.0, 1.0, 2.0],
            "probabilita_da": (
                "la funzione di ripartizione della distribuzione calibrata, mai la "
                "distanza dal valore atteso"
            ),
            "senza_il_livello_nominale": (
                "il livello nominale corregge l'intervallo, non la funzione di "
                "ripartizione: sulle probabilita' non si applica"
            ),
        },
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


def soglia_assoluta(metriche):
    """La soglia dell'affidabilita': l'errore della previsione banale, arrotondato.

    Vive qui, in un posto solo, perche' la usano sia l'artefatto sia lo strato
    condizionale: due copie della stessa regola divergerebbero senza dare errore.
    """
    if metriche is None or metriche.get("mae_migliore_baseline") is None:
        return None
    soglia = float(math.floor(float(metriche["mae_migliore_baseline"]) + 0.5))
    return soglia if soglia > 0 else None


def fascia_di_lettura(punteggio):
    for minimo, massimo, nome in FASCE_DI_LETTURA:
        if minimo <= punteggio < massimo:
            return nome
    return FASCE_DI_LETTURA[-1][2]


def punto_della_curva(curva, soglia):
    """Il punto gia' misurato a quella soglia, o nulla. Non si interpola: un punto che
    nessuno ha misurato sarebbe un numero inventato."""
    for voce in curva or ():
        if abs(float(voce["soglia"]) - soglia) < 1e-9:
            return voce
    return None


def punteggio_da(voce):
    """Dalla quota misurata al punteggio 0-100, con l'incertezza che la quota gia' porta.

    L'incertezza non e' un ornamento: con settantacinque righe di prova in fascia EARLY
    l'intervallo e' largo venti punti, e chi legge deve poterlo vedere.
    """
    punteggio = int(math.floor(100.0 * float(voce["quota"]) + 0.5))
    return {
        "punteggio": punteggio,
        "punteggio_basso": int(math.floor(100.0 * float(voce["quota_bassa"]) + 0.5)),
        "punteggio_alto": int(math.floor(100.0 * float(voce["quota_alta"]) + 0.5)),
        "fascia_di_lettura": fascia_di_lettura(punteggio),
        "quota": voce["quota"],
        "righe_entro_soglia": voce["righe_entro_soglia"],
        "righe_di_prova": voce["righe"],
    }


def strato_condizionale(target, nome_modello, colonne):
    """Lo strato condizionale, se e' stato misurato, promosso e se il modello lo puo' usare.

    Tre cancelli, tutti necessari. Il rapporto deve esistere ed essere di questo modello;
    lo strato deve aver battuto la costante fuori campione; e ogni condizione deve essere
    fra le colonne che il modello riceve, altrimenti il lato che prevede non l'avrebbe.
    """
    percorso = os.path.join(os.path.dirname(__file__), "output",
                            target + "-affidabilita-condizionale.json")
    if not os.path.isfile(percorso):
        return None
    with open(percorso, "r", encoding="utf-8") as handle:
        rapporto = json.load(handle)
    if rapporto.get("modello") != nome_modello:
        return None
    if not rapporto.get("esito", {}).get("condizionale", {}).get("promosso"):
        return None
    produzione = rapporto.get("modello_di_produzione")
    if not produzione:
        return None
    mancanti = [nome for nome in produzione["condizioni"]
                if nome != "valore_atteso" and nome not in colonne]
    if mancanti:
        return None
    return {
        "condizioni": produzione["condizioni"],
        "standardizzazione": produzione["standardizzazione"],
        "coefficienti": produzione["coefficienti"],
        "intercetta": produzione["intercetta"],
        "collegamento": "logistico",
        "righe_di_addestramento": produzione["righe_di_addestramento"],
        "scarto_medio_di_calibrazione": produzione["scarto_medio_di_calibrazione"],
        "origini_vinte_su_brier": rapporto["esito"]["condizionale"]["origini_vinte_su_brier"],
        "regola": produzione["regola"],
        "significato": (
            "sostituisce la costante della fascia con una probabilita' stimata per questa "
            "gara; l'incertezza dichiarata e' lo scarto medio di calibrazione misurato, "
            "non un intervallo binomiale"
        ),
    }


def totale_dichiarato(target, nome_modello, utilizzabili, y, atteso):
    """L'incertezza del totale di gara, con la prova su cui poggia.

    **Il valore atteso del totale non sta qui**, ed e' voluto: e' la somma dei due attesi,
    e non c'e' niente da conservare per calcolarla. Qui sta soltanto cio' che descrive la
    sua incertezza — dispersione e livello nominale — perche' quello, la somma, non lo sa.

    Il metodo e' la calibrazione diretta sui residui della somma, deciso il 20 agosto 2026
    dopo averlo confrontato fuori campione con la composizione delle due marginali: la
    dipendenza fra i due lati esiste, e' stabile, e non migliora mai l'incertezza. Il
    registro della decisione e' in data/registro-totale.json.

    Dispersione e livello si stimano qui su **tutte** le righe, come per le marginali; le
    misure fuori campione si leggono dal rapporto e servono a dichiarare quanto vale, non
    a costruirlo.
    """
    if "event_id" not in utilizzabili.columns or "lato" not in utilizzabili.columns:
        return None
    quadro = pd.DataFrame({
        "event_id": utilizzabili["event_id"].to_numpy(),
        "lato": utilizzabili["lato"].astype(str).to_numpy(),
        "atteso": np.asarray(atteso, dtype=float),
        "vero": np.asarray(y, dtype=float),
    })
    casa = quadro[quadro["lato"] == "home"].set_index("event_id")
    via = quadro[quadro["lato"] == "away"].set_index("event_id")
    comuni = casa.index.intersection(via.index)
    if len(comuni) < 200:
        return None
    atteso_totale = (casa.loc[comuni, "atteso"] + via.loc[comuni, "atteso"]).to_numpy()
    vero_totale = (casa.loc[comuni, "vero"] + via.loc[comuni, "vero"]).to_numpy()

    disp = evaluate.dispersione_residua(vero_totale, atteso_totale)
    livello, copertura = evaluate.calibra_livello(vero_totale, atteso_totale, disp)
    distribuzione = "poisson" if disp <= evaluate.SOGLIA_POISSON else "binomiale_negativa"

    def leggi(nome_file):
        percorso = os.path.join(os.path.dirname(__file__), "output", target + nome_file)
        if not os.path.isfile(percorso):
            return None
        with open(percorso, "r", encoding="utf-8") as handle:
            return json.load(handle)

    misura = leggi("-totale.json")
    if misura is not None and misura.get("modello") != nome_modello:
        misura = None
    linee = leggi("-linee.json")
    if linee is not None and linee.get("modello") != nome_modello:
        linee = None

    prova = None
    if misura is not None and misura.get("confronto_per_origine"):
        origini = misura["confronto_per_origine"]
        prova = {
            "origini": len(origini),
            "gare_di_prova": int(sum(v["gare_di_prova"] for v in origini)),
            "copertura_media_fuori_campione": round(
                float(np.mean([v["diretta"]["copertura_intervallo"] for v in origini])), 4),
            "scarto_di_calibrazione_delle_linee": round(
                float(np.mean([v["diretta"]["linee"]["scarto_medio_di_calibrazione"]
                               for v in origini])), 4),
            "mae_del_totale": misura.get("mae_medio_del_totale_fuori_campione"),
            "correlazione_di_rango_fra_i_lati": round(
                float(np.mean([v["dipendenza_fra_i_lati"]["rango"] for v in origini])), 4),
            "confronto_con_la_composizione": misura.get("esito", {}).get(
                "scostamento_medio_di_copertura"),
        }

    return {
        "metodo": "calibrazione_diretta",
        "valore_atteso": (
            "somma dei due attesi: E[casa+trasferta] = E[casa] + E[trasferta], esatta "
            "anche con i due processi dipendenti. Nessun terzo valore atteso"
        ),
        "dispersione": float(disp),
        "distribuzione": distribuzione,
        "soglia_poisson": evaluate.SOGLIA_POISSON,
        "livello_nominale": float(livello),
        "livello_dichiarato": evaluate.LIVELLO_INTERVALLO,
        "copertura_sul_periodo_di_addestramento": copertura,
        "gare_di_addestramento": int(len(comuni)),
        "prova_fuori_campione": prova,
        "calibrazione_delle_linee_sui_due_lati": (
            None if linee is None else linee.get("esito", {}).get(
                "scarto_medio_di_calibrazione")),
        "avvertenza": (
            "la copertura misurata fuori campione e' piu' bassa di quella dichiarata su "
            "sei bersagli su sette: l'intervallo promette l'ottanta per cento e ne copre "
            "fra il settantotto e il settantanove virgola nove. Va detto, non nascosto"
        ),
        "affidabilita": affidabilita_del_totale(target, nome_modello),
    }


def affidabilita_del_totale(target, nome_modello):
    """L'affidabilita' del totale: la definizione del §8quater su un'altra grandezza.

    E' la probabilita', misurata fuori campione, che lo scarto fra totale previsto e
    totale osservato resti entro una soglia assoluta. **La soglia viene dalla migliore
    baseline del totale** — la somma delle due baseline di lato — non dall'errore del
    modello e non dalla soglia marginale del bersaglio.

    La griglia della curva e' piu' larga di quella delle marginali, perche' il totale ha
    una scala piu' grande e il punto letto dev'essere misurato, mai interpolato.

    Non c'e' nessuno strato condizionale: sul totale non e' stato misurato, e un blocco
    che non esiste non si finge. La fascia con cui leggere il punteggio e' la piu' povera
    dei due lati — la storia piu' corta governa l'incertezza — e la applica il lato che
    prevede, come gia' fa per le marginali.

    **La media e il minimo dei due punteggi di lato restano fuori**: sono nel rapporto
    come termine di paragone del divieto, e sbagliano rispettivamente in entrambe le
    direzioni e sempre. Un artefatto non porta un numero che nessuno deve usare.
    """
    percorso = os.path.join(os.path.dirname(__file__), "output",
                            target + "-totale-affidabilita.json")
    if not os.path.isfile(percorso):
        return None
    with open(percorso, "r", encoding="utf-8") as handle:
        rapporto = json.load(handle)
    if rapporto.get("modello") != nome_modello or rapporto.get("punto") is None:
        return None

    per_fascia = {}
    curve_per_fascia = {}
    for nome, voce in (rapporto.get("per_fascia") or {}).items():
        if voce.get("punto") is None:
            continue
        per_fascia[nome] = punteggio_da(voce["punto"])
        curve_per_fascia[nome] = voce.get("curva_di_accuratezza")

    nome_baseline = rapporto.get("soglia_dalla_baseline")
    mae_baseline = (rapporto.get("mae_baseline_del_totale") or {}).get(nome_baseline)
    return {
        "definizione": (
            "probabilita' misurata fuori campione che lo scarto fra totale previsto e "
            "totale osservato resti entro la soglia assoluta del totale"
        ),
        "soglia_assoluta": float(rapporto["soglia_assoluta"]),
        "come_e_stata_scelta": (
            "errore assoluto medio della migliore baseline del totale (" + str(nome_baseline)
            + ("" if mae_baseline is None else ", " + str(round(float(mae_baseline), 4)))
            + ") arrotondato all'unita' del bersaglio"
        ),
        "fasce_di_lettura": [{"da": a, "fino_a": b, "nome": n} for a, b, n in FASCE_DI_LETTURA],
        "misurata_sulla_miscela_congelata": True,
        "complessivo": punteggio_da(rapporto["punto"]),
        "per_fascia": per_fascia,
        "curva_completa": {
            "soglie": [voce["soglia"] for voce in rapporto.get("curva_di_accuratezza", ())],
            "complessivo": rapporto.get("curva_di_accuratezza"),
            "per_fascia": curve_per_fascia,
            "perche": (
                "si conserva intera perche' una soglia diversa si legga senza riaddestrare, "
                "e perche' la diagnostica veda la distribuzione dell'errore e non un punto"
            ),
        },
        "avvertenza": (
            "sul totale il modello batte la migliore baseline di poco, dallo zero virgola "
            "sette al cinque virgola due per cento: e' un margine piu' sottile di quello "
            "delle marginali. E non e' l'affidabilita' di nessuno dei due lati: la media "
            "dei due punteggi sbaglia in entrambe le direzioni e il minimo sbaglia sempre"
        ),
    }


def affidabilita_dichiarata(target, nome_modello, suffisso_validazione, colonne=()):
    """L'affidabilita' del bersaglio: soglia assoluta, punteggio e curva conservata.

    La soglia e' **l'errore della previsione banale**, cioe' l'errore assoluto medio della
    migliore baseline arrotondato all'unita' del bersaglio. Sotto quella distanza il
    modello vale piu' del non sapere nulla, ed e' la stessa regola per tutti e sette: non
    una scelta a mano bersaglio per bersaglio.

    Il punteggio e' la quota misurata fuori campione, non una sintesi di altre grandezze.
    La curva intera resta nell'artefatto: cambiare soglia domani non costa un
    riaddestramento, e la diagnostica ha i dati che le servono.
    """
    metriche = metriche_di_validazione(target, nome_modello, suffisso_validazione)
    soglia = soglia_assoluta(metriche)
    if soglia is None:
        return None
    mae_baseline = float(metriche["mae_migliore_baseline"])

    percorso = os.path.join(os.path.dirname(__file__), "output", target + "-maturita.json")
    if not os.path.isfile(percorso):
        return None
    with open(percorso, "r", encoding="utf-8") as handle:
        rapporto = json.load(handle)
    if rapporto.get("modello") != nome_modello:
        return None

    curva_complessiva = rapporto["complessivo"]["A_modello_completo"]["curva_di_accuratezza"]
    voce = punto_della_curva(curva_complessiva, soglia)
    if voce is None:
        return None

    per_fascia = {}
    curve_per_fascia = {}
    for nome, voce_fascia in rapporto.get("parametri_per_fascia", {}).items():
        curva = voce_fascia.get("curva_di_accuratezza_con_peso_congelato")
        punto = punto_della_curva(curva, soglia)
        if punto is None:
            continue
        per_fascia[nome] = punteggio_da(punto)
        curve_per_fascia[nome] = curva

    return {
        "definizione": (
            "probabilita' misurata fuori campione che lo scarto fra previsto e osservato "
            "resti entro la soglia assoluta di questo bersaglio"
        ),
        "soglia_assoluta": soglia,
        "come_e_stata_scelta": (
            "errore assoluto medio della migliore baseline (" + str(metriche["migliore_baseline"])
            + ", " + str(round(mae_baseline, 4)) + ") arrotondato all'unita' del bersaglio"
        ),
        "fasce_di_lettura": [{"da": a, "fino_a": b, "nome": n} for a, b, n in FASCE_DI_LETTURA],
        "misurata_sulla_miscela_congelata": True,
        "condizionale": strato_condizionale(target, nome_modello, set(colonne)),
        "complessivo": punteggio_da(voce),
        "per_fascia": per_fascia,
        "curva_completa": {
            "soglie": rapporto.get("soglie_di_errore"),
            "complessivo": curva_complessiva,
            "per_fascia": curve_per_fascia,
            "perche": (
                "si conserva intera perche' una soglia diversa si legga senza riaddestrare, "
                "e perche' la diagnostica veda la distribuzione dell'errore e non un punto"
            ),
        },
        "avvertenza": (
            "affidabilita' del modello e probabilita' dell'evento sono due numeri diversi: "
            "non si sommano, non si confrontano e non si sostituiscono a vicenda"
        ),
    }


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
            "il punteggio sta nel blocco affidabilita' dell'artefatto, misurato per fascia "
            "sulla miscela congelata. Non poggia sulla stabilita' temporale, che in fascia "
            "EARLY non e' misurabile: li' l'oscillazione dell'errore fra origini e' minore "
            "di quella che il caso produce da solo. L'evidenza per fascia resta qui sotto"
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
    parser.add_argument("--stato", default="experimental",
                        choices=("experimental", "validated", "production", "disabled"),
                        help="stato dichiarato nell'artefatto: production e' una scelta umana")
    argomenti = parser.parse_args()

    esito, errore = esporta(argomenti.target, argomenti.modello, argomenti.densita_minima,
                            argomenti.solo_manifesto, argomenti.suffisso_validazione,
                            argomenti.stato)
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
