"""Validazione a finestra avanzante di un target, contro le baseline obbligatorie.

Nessuno split casuale: l'ordine temporale non si rompe mai. Si addestra su tutto cio' che
precede una data e si valuta il periodo successivo, ripetendo su piu' origini per vedere
se il vantaggio e' stabile o e' un caso.

Si misurano errore assoluto medio, radice dell'errore quadratico, distorsione, errore
mediano, errore per lega, per lato e per fascia di valore, e la copertura reale
dell'intervallo dichiarato.

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/evaluate.py --target corner_kicks
"""

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import PoissonRegressor, Ridge
from sklearn.preprocessing import StandardScaler

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
FEATURE_DIR = os.path.join(ROOT, "scripts", "projection", "dataset", "output", "features")
OUT_DIR = os.path.join(os.path.dirname(__file__), "output")
MANIFESTO = os.path.join(ROOT, "data", "manifesto-feature.json")

BASELINE = [
    "baseline_lega",
    "baseline_squadra_stagione",
    "baseline_squadra_lato",
    "baseline_media_mobile",
    "baseline_attacco_contro_concesso",
    "baseline_restringimento",
]
PREFISSI_FEATURE = ("prodotto_", "concesso_", "lega_", "avv_", "baseline_",
                    "giorni_", "gare_", "forza_", "debolezza_", "scarto_",
                    "zeta_", "confronto_", "arbitro_", "allenatore_",
                    "contesto_", "classifica_", "giocatori_", "spaziale_",
                    "interazione_")
SOGLIA_POISSON = 1.05
LIVELLO_INTERVALLO = 0.80


def carica(target):
    percorso = os.path.join(FEATURE_DIR, target + ".csv")
    tavola = pd.read_csv(percorso, low_memory=False)
    tavola["quando"] = pd.to_datetime(tavola["quando"], format="mixed", utc=True)
    return tavola.sort_values(["quando", "event_id", "lato"]).reset_index(drop=True)


def colonne_feature(tavola, densita_minima):
    colonne = []
    scartate = []
    for nome in tavola.columns:
        if not nome.startswith(PREFISSI_FEATURE):
            continue
        serie = pd.to_numeric(tavola[nome], errors="coerce")
        serie = serie.replace([np.inf, -np.inf], np.nan)
        densita = float(serie.notna().mean())
        if densita >= densita_minima:
            colonne.append(nome)
        else:
            scartate.append({"colonna": nome, "densita": round(densita, 4)})
    return colonne, scartate


def dispersione(valori):
    media = float(np.mean(valori))
    if media <= 0:
        return 1.0
    varianza = float(np.var(valori, ddof=1))
    return max(varianza / media, 1.0)


def dispersione_residua(vero, previsto):
    """Dispersione stimata sui residui del modello, non sulla distribuzione grezza.

    Con la parametrizzazione usata dal progetto la varianza vale mu * D: stimare D
    dalla varianza marginale conta anche cio' che il modello spiega, e produce un
    intervallo troppo largo. Si stima quindi sul solo periodo di addestramento.
    """
    vero = np.asarray(vero, dtype=float)
    previsto = np.asarray(previsto, dtype=float)
    valido = np.isfinite(vero) & np.isfinite(previsto) & (previsto > 0)
    if valido.sum() < 30:
        return 1.0
    scarto = (vero[valido] - previsto[valido]) ** 2 / previsto[valido]
    return max(float(np.mean(scarto)), 1.0)


def intervallo(mu, disp, livello=LIVELLO_INTERVALLO):
    """Estremi dell'intervallo centrale, Poisson quando la dispersione e' vicina a uno."""
    coda = (1.0 - livello) / 2.0
    mu = np.clip(np.asarray(mu, dtype=float), 1e-6, None)
    if disp <= SOGLIA_POISSON:
        return stats.poisson.ppf(coda, mu), stats.poisson.ppf(1 - coda, mu)
    p = 1.0 / disp
    r = mu / (disp - 1.0)
    return stats.nbinom.ppf(coda, r, p), stats.nbinom.ppf(1 - coda, r, p)


def calibra_livello(vero, previsto, disp, obiettivo=LIVELLO_INTERVALLO):
    """Livello nominale che sul periodo di addestramento produce la copertura voluta.

    Su una distribuzione discreta l'intervallo e' conservativo per costruzione: chiedere
    l'80% ne copre spesso l'87%. Si cerca quindi il livello nominale la cui copertura
    misurata sul solo addestramento e' piu' vicina all'obiettivo, e si usa quello.
    """
    vero = np.asarray(vero, dtype=float)
    previsto = np.asarray(previsto, dtype=float)
    valido = np.isfinite(vero) & np.isfinite(previsto) & (previsto > 0)
    if valido.sum() < 200:
        return obiettivo, None
    vero, previsto = vero[valido], previsto[valido]

    migliore, scarto_migliore, copertura_migliore = obiettivo, None, None
    for livello in np.arange(0.50, 0.96, 0.01):
        basso, alto = intervallo(previsto, disp, float(livello))
        copertura = float(np.mean((vero >= basso) & (vero <= alto)))
        scarto = abs(copertura - obiettivo)
        if scarto_migliore is None or scarto < scarto_migliore:
            migliore, scarto_migliore, copertura_migliore = float(livello), scarto, copertura
    return migliore, round(copertura_migliore, 4)


def misure(vero, previsto):
    vero = np.asarray(vero, dtype=float)
    previsto = np.asarray(previsto, dtype=float)
    valido = np.isfinite(vero) & np.isfinite(previsto)
    if valido.sum() == 0:
        return None
    errore = previsto[valido] - vero[valido]
    return {
        "n": int(valido.sum()),
        "mae": round(float(np.mean(np.abs(errore))), 4),
        "rmse": round(float(np.sqrt(np.mean(errore ** 2))), 4),
        "bias": round(float(np.mean(errore)), 4),
        "mae_mediano": round(float(np.median(np.abs(errore))), 4),
    }


def per_segmento(tavola, vero, previsto, colonna, massimo=None):
    esiti = {}
    valori = tavola[colonna]
    categorie = valori.value_counts().index
    if massimo:
        categorie = categorie[:massimo]
    for categoria in categorie:
        maschera = (valori == categoria).to_numpy()
        voce = misure(vero[maschera], previsto[maschera])
        if voce and voce["n"] >= 100:
            esiti[str(categoria)] = voce
    return esiti


def per_fascia(vero, previsto):
    vero = np.asarray(vero, dtype=float)
    tagli = np.quantile(vero, [1 / 3, 2 / 3])
    fasce = {
        "bassa": vero <= tagli[0],
        "media": (vero > tagli[0]) & (vero <= tagli[1]),
        "alta": vero > tagli[1],
    }
    return {nome: misure(vero[m], np.asarray(previsto)[m]) for nome, m in fasce.items()}


def addestra(nome, x_train, y_train):
    """Addestra e ritorna la sola funzione che prevede, o None se il modello non esiste.

    Serve a chi deve prevedere piu' volte con lo stesso modello — l'importanza per
    permutazione, per esempio — senza riaddestrare a ogni previsione.
    """
    if nome == "poisson_glm":
        scalatore = StandardScaler().fit(x_train)
        modello = PoissonRegressor(alpha=1.0, max_iter=1000)
        modello.fit(scalatore.transform(x_train), y_train)
        return lambda dati: modello.predict(scalatore.transform(dati))
    if nome == "ridge":
        scalatore = StandardScaler().fit(x_train)
        modello = Ridge(alpha=10.0)
        modello.fit(scalatore.transform(x_train), y_train)
        return lambda dati: np.clip(modello.predict(scalatore.transform(dati)), 0.0, None)
    if nome == "gradient_boosting_poisson":
        modello = HistGradientBoostingRegressor(
            loss="poisson", max_iter=300, learning_rate=0.05,
            max_leaf_nodes=15, l2_regularization=1.0, random_state=0)
        modello.fit(x_train, y_train)
        return lambda dati: np.clip(modello.predict(dati), 0.0, None)
    return None


def addestra_e_prevedi(nome, x_train, y_train, x_test):
    """Ritorna (previsioni sul periodo di prova, previsioni sul periodo di addestramento).

    Le seconde servono soltanto a stimare la dispersione dei residui: non entrano in
    nessuna misura di errore fuori campione.
    """
    prevedi = addestra(nome, x_train, y_train)
    if prevedi is None:
        return None, None
    return prevedi(x_test), prevedi(x_train)


MODELLI = ("poisson_glm", "ridge", "gradient_boosting_poisson")
# Solo i primi due sono esportabili in un artefatto riproducibile in TypeScript.
ESPORTABILI = {"poisson_glm", "ridge"}


def colonne_dal_manifesto(target, disponibili):
    """Le sole feature che il manifesto ha promosso per questo target."""
    if not os.path.isfile(MANIFESTO):
        return None
    with open(MANIFESTO, "r", encoding="utf-8") as handle:
        manifesto = json.load(handle)
    voce = manifesto.get("target", {}).get(target)
    if not voce:
        return None
    scelte = [nome for nome in voce["feature"] if nome in disponibili]
    return scelte or None


def valuta(target, origini, quota_iniziale, densita_minima, solo_manifesto=False):
    tavola = carica(target)
    colonne, scartate = colonne_feature(tavola, densita_minima)
    if solo_manifesto:
        scelte = colonne_dal_manifesto(target, set(colonne))
        if scelte is None:
            raise SystemExit("nessuna voce di manifesto per il target " + target)
        colonne = scelte

    bersaglio = pd.to_numeric(tavola["valore_noto"], errors="coerce")
    matrice = tavola[colonne].apply(pd.to_numeric, errors="coerce")
    matrice = matrice.replace([np.inf, -np.inf], np.nan)

    completa = matrice.notna().all(axis=1) & bersaglio.notna()
    utilizzabili = tavola[completa].reset_index(drop=True)
    x = matrice[completa].to_numpy(dtype=float)
    y = bersaglio[completa].to_numpy(dtype=float)

    quando = utilizzabili["quando"]
    confini = [
        quando.quantile(quota_iniziale + (1.0 - quota_iniziale) * k / origini)
        for k in range(origini + 1)
    ]

    def vuota():
        return {"vero": [], "previsto": [], "indici": [], "basso": [], "alto": [],
                "dispersioni": [], "livelli": []}

    raccolta = {nome: vuota() for nome in list(MODELLI) + BASELINE}
    per_origine = []

    for k in range(origini):
        inizio, fine = confini[k], confini[k + 1]
        treno = (quando < inizio).to_numpy()
        prova = ((quando >= inizio) & (quando < fine)).to_numpy()
        if treno.sum() < 500 or prova.sum() < 100:
            continue

        voce_origine = {
            "origine": str(inizio)[:10],
            "treno": int(treno.sum()),
            "prova": int(prova.sum()),
            "modelli": {},
        }

        def registra(nome, previsto, previsto_treno):
            disp_treno = dispersione_residua(y[treno], previsto_treno)
            livello, _ = calibra_livello(y[treno], previsto_treno, disp_treno)
            basso, alto = intervallo(previsto, disp_treno, livello)
            dati = raccolta[nome]
            dati["livelli"].append(round(livello, 3))
            dati["vero"].append(y[prova])
            dati["previsto"].append(previsto)
            dati["indici"].append(np.flatnonzero(prova))
            dati["basso"].append(basso)
            dati["alto"].append(alto)
            dati["dispersioni"].append(round(disp_treno, 4))
            voce_origine["modelli"][nome] = misure(y[prova], previsto)

        for nome in BASELINE:
            colonna = pd.to_numeric(utilizzabili[nome], errors="coerce").to_numpy()
            registra(nome, colonna[prova], colonna[treno])

        for nome in MODELLI:
            previsto, previsto_treno = addestra_e_prevedi(nome, x[treno], y[treno], x[prova])
            if previsto is None:
                continue
            registra(nome, previsto, previsto_treno)

        per_origine.append(voce_origine)

    disp = dispersione(y)
    complessivo = {}
    for nome, dati in raccolta.items():
        if not dati["vero"]:
            continue
        vero = np.concatenate(dati["vero"])
        previsto = np.concatenate(dati["previsto"])
        indici = np.concatenate(dati["indici"])
        sotto = utilizzabili.iloc[indici]

        basso = np.concatenate(dati["basso"])
        alto = np.concatenate(dati["alto"])
        dentro = (vero >= basso) & (vero <= alto)
        finiti = np.isfinite(previsto) & np.isfinite(basso) & np.isfinite(alto)

        voce = misure(vero, previsto) or {}
        voce["copertura_intervallo"] = round(float(np.mean(dentro[finiti])), 4) if finiti.any() else None
        voce["livello_dichiarato"] = LIVELLO_INTERVALLO
        voce["ampiezza_media_intervallo"] = (
            round(float(np.mean((alto - basso)[finiti])), 3) if finiti.any() else None)
        voce["dispersione_per_origine"] = dati["dispersioni"]
        voce["livello_nominale_per_origine"] = dati["livelli"]
        voce["per_lega"] = per_segmento(sotto, vero, previsto, "league_id", massimo=8)
        voce["per_lato"] = per_segmento(sotto, vero, previsto, "lato")
        voce["per_fascia"] = per_fascia(vero, previsto)
        voce["esportabile"] = nome in ESPORTABILI or nome in BASELINE
        complessivo[nome] = voce

    migliore_baseline = min(
        (nome for nome in BASELINE if nome in complessivo),
        key=lambda nome: complessivo[nome]["mae"], default=None)

    for nome, voce in complessivo.items():
        if migliore_baseline and nome not in BASELINE:
            riferimento = complessivo[migliore_baseline]["mae"]
            voce["vantaggio_su_migliore_baseline"] = round(
                (riferimento - voce["mae"]) / riferimento, 5)
            vittorie = 0
            confronti = 0
            for origine in per_origine:
                if nome in origine["modelli"] and migliore_baseline in origine["modelli"]:
                    confronti += 1
                    if origine["modelli"][nome]["mae"] < origine["modelli"][migliore_baseline]["mae"]:
                        vittorie += 1
            voce["origini_vinte_su_migliore_baseline"] = str(vittorie) + "/" + str(confronti)

    return {
        "target": target,
        "righe_con_feature_complete": int(len(utilizzabili)),
        "righe_scartate_per_feature_mancanti": int((~completa).sum()),
        "colonne_feature": len(colonne),
        "colonne_scartate_per_scarsita": scartate,
        "dispersione_osservata": round(disp, 4),
        "origini": per_origine,
        "complessivo": complessivo,
        "migliore_baseline": migliore_baseline,
        "nota": (
            "un modello non e' promuovibile finche' non batte la migliore baseline sulla "
            "maggioranza delle origini e non supera il test di parita' con TypeScript"
        ),
    }


def main():
    parser = argparse.ArgumentParser(description="Validazione a finestra avanzante")
    parser.add_argument("--target", required=True)
    parser.add_argument("--origini", type=int, default=5)
    parser.add_argument("--quota-iniziale", type=float, default=0.45)
    parser.add_argument("--densita-minima", type=float, default=0.95)
    parser.add_argument("--solo-manifesto", action="store_true",
                        help="usa le sole feature promosse dal manifesto per questo target")
    parser.add_argument("--suffisso", default="",
                        help="suffisso del rapporto, per non sovrascrivere")
    argomenti = parser.parse_args()

    rapporto = valuta(argomenti.target, argomenti.origini,
                      argomenti.quota_iniziale, argomenti.densita_minima,
                      argomenti.solo_manifesto)

    os.makedirs(OUT_DIR, exist_ok=True)
    uscita = os.path.join(OUT_DIR, argomenti.target + argomenti.suffisso + "-validazione.json")
    with open(uscita, "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=2)

    print("target: " + rapporto["target"])
    print("righe con feature complete: " + str(rapporto["righe_con_feature_complete"])
          + " | scartate: " + str(rapporto["righe_scartate_per_feature_mancanti"]))
    print("colonne feature: " + str(rapporto["colonne_feature"])
          + " | dispersione: " + str(rapporto["dispersione_osservata"]))
    print("origini valutate: " + str(len(rapporto["origini"])))
    print()
    print("modello".ljust(34) + "MAE".rjust(8) + "RMSE".rjust(8) + "bias".rjust(8)
          + "cop.".rjust(7) + "vs base".rjust(9) + "origini".rjust(9))
    ordinati = sorted(rapporto["complessivo"].items(), key=lambda kv: kv[1]["mae"])
    for nome, voce in ordinati:
        print(nome.ljust(34)
              + str(voce["mae"]).rjust(8)
              + str(voce["rmse"]).rjust(8)
              + str(voce["bias"]).rjust(8)
              + str(voce.get("copertura_intervallo")).rjust(7)
              + str(voce.get("vantaggio_su_migliore_baseline", "-")).rjust(9)
              + str(voce.get("origini_vinte_su_migliore_baseline", "-")).rjust(9))
    print()
    print("migliore baseline: " + str(rapporto["migliore_baseline"]))
    print("scritto: " + uscita)
    return 0


if __name__ == "__main__":
    sys.exit(main())
