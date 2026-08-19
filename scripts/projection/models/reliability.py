"""Lo strato condizionale dell'affidabilita': serve, oppure resta la costante?

L'affidabilita' di oggi e' una costante dentro la fascia: la quota di righe, misurata
fuori campione, in cui lo scarto e' rimasto entro la soglia assoluta del bersaglio. La
domanda qui e' se quella quota si possa prevedere **gara per gara** dalle condizioni note
prima del calcio d'inizio, meglio di quanto faccia la costante.

Tre scelte che questo modulo non negozia.

**Il modello condizionale non si addestra sugli errori del proprio periodo di
addestramento.** Li' gli errori sono ottimisti, perche' il modello di proiezione ha visto
quelle righe: una probabilita' stimata su quelli direbbe che il motore azzecca piu' di
quanto azzecchi. Si addestra invece sugli errori **fuori campione delle origini
precedenti** e si valuta sull'origine successiva. Costa un'origine, ed e' l'unico modo
onesto.

**Si misura contro la costante, non contro il caso.** Il termine di paragone e' la quota
per fascia stimata sugli stessi dati precedenti: se il condizionale non la batte, la
costante resta. Battere significa Brier **e** log-loss piu' bassi nella maggioranza delle
origini valutabili.

**La lega si prova a parte.** Nell'analisi di discriminazione gli estremi fra leghe sono
stati scelti guardando i numeri, quindi lo scarto e' gonfiato per costruzione: qui entra
come variante separata, codificata sui soli dati di addestramento, e passa solo se regge
la prova temporale da sola.

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/reliability.py --target offsides
"""

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import evaluate  # noqa: E402
import export_model  # noqa: E402
import validate_maturity  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "output")
SCHEMA = "affidabilita-condizionale/1"

# Quante righe servono perche' una stima abbia senso. Sotto queste, non si stima.
MINIMO_ADDESTRAMENTO = 400
MINIMO_PROVA = 150

# Le condizioni note prima del calcio d'inizio che l'analisi di discriminazione ha
# promosso su tutti e sette i bersagli, piu' quelle che il manifesto rende disponibili.
CONDIZIONI_SEMPRE = ("valore_atteso", "gare_precedenti")
CONDIZIONI_SE_CI_SONO = ("scarto_dalla_lega", "zeta_dalla_lega", "avv_gare_precedenti")


def pesi_congelati(target, nome_modello):
    """I pesi della miscela dell'artefatto: e' quella la previsione che va giudicata."""
    percorso = os.path.join(OUT_DIR, target + "-maturita.json")
    if not os.path.isfile(percorso):
        return None
    with open(percorso, "r", encoding="utf-8") as handle:
        rapporto = json.load(handle)
    if rapporto.get("modello") != nome_modello:
        return None
    return {nome: float(voce["peso_della_miscela"])
            for nome, voce in rapporto.get("parametri_per_fascia", {}).items()}


def brier(vero, probabilita):
    return float(np.mean((np.asarray(probabilita, dtype=float) - np.asarray(vero, dtype=float)) ** 2))


def log_loss(vero, probabilita):
    p = np.clip(np.asarray(probabilita, dtype=float), 1e-9, 1 - 1e-9)
    v = np.asarray(vero, dtype=float)
    return float(-np.mean(v * np.log(p) + (1 - v) * np.log(1 - p)))


def calibrazione(vero, probabilita, decili=10):
    """Quanto la probabilita' promessa somiglia alla frequenza osservata."""
    p = np.asarray(probabilita, dtype=float)
    v = np.asarray(vero, dtype=float)
    ordine = np.argsort(p)
    gruppi = np.array_split(ordine, decili)
    voci, scarto = [], []
    for indici in gruppi:
        if len(indici) == 0:
            continue
        promessa, osservata = float(np.mean(p[indici])), float(np.mean(v[indici]))
        voci.append({"righe": int(len(indici)),
                     "probabilita_promessa": round(promessa, 4),
                     "frequenza_osservata": round(osservata, 4)})
        scarto.append(abs(promessa - osservata) * len(indici))
    errore_medio = float(np.sum(scarto) / max(len(p), 1))
    return {"decili": voci, "scarto_medio_di_calibrazione": round(errore_medio, 4)}


def costante_per_fascia(fascia_treno, dentro_treno, fascia_prova):
    """Il termine di paragone: la quota della fascia, stimata sugli stessi dati."""
    generale = float(np.mean(dentro_treno)) if len(dentro_treno) else 0.5
    quote = {}
    for nome in np.unique(fascia_treno):
        maschera = fascia_treno == nome
        quote[nome] = float(np.mean(dentro_treno[maschera])) if maschera.sum() >= 30 else generale
    return np.array([quote.get(nome, generale) for nome in fascia_prova], dtype=float)


def condizionale(x_treno, dentro_treno, x_prova):
    scalatore = StandardScaler().fit(x_treno)
    modello = LogisticRegression(max_iter=2000, C=1.0)
    modello.fit(scalatore.transform(x_treno), dentro_treno)
    return modello.predict_proba(scalatore.transform(x_prova))[:, 1]


def codifica_lega(lega_treno, dentro_treno, lega_prova):
    """La lega come quota media, stimata sul solo addestramento e ristretta verso il
    generale: senza restringimento una lega con poche righe porterebbe il suo rumore."""
    generale = float(np.mean(dentro_treno)) if len(dentro_treno) else 0.5
    forza = 50.0
    quote = {}
    for nome in np.unique(lega_treno):
        maschera = lega_treno == nome
        n = int(maschera.sum())
        quote[nome] = (n * float(np.mean(dentro_treno[maschera])) + forza * generale) / (n + forza)
    return np.array([quote.get(nome, generale) for nome in lega_prova], dtype=float)


def valuta(target, nome_modello, origini, quota_iniziale, densita_minima):
    metriche = export_model.metriche_di_validazione(target, nome_modello, "-manifesto")
    soglia = export_model.soglia_assoluta(metriche)
    if soglia is None:
        raise SystemExit("nessuna soglia calcolabile per " + target)
    pesi = pesi_congelati(target, nome_modello)
    if pesi is None:
        raise SystemExit("nessun rapporto di maturita' per " + target + " con " + nome_modello)

    tavola = evaluate.carica(target)
    colonne, _ = evaluate.colonne_feature(tavola, densita_minima)
    complete = evaluate.colonne_dal_manifesto(target, set(colonne))
    if complete is None:
        raise SystemExit("nessuna voce di manifesto per il target " + target)

    bersaglio = pd.to_numeric(tavola["valore_noto"], errors="coerce")
    matrice = tavola[complete].apply(pd.to_numeric, errors="coerce")
    matrice = matrice.replace([np.inf, -np.inf], np.nan)
    utilizzabile = matrice.notna().all(axis=1) & bersaglio.notna()

    righe = tavola[utilizzabile].reset_index(drop=True)
    x = matrice[utilizzabile].to_numpy(dtype=float)
    y = bersaglio[utilizzabile].to_numpy(dtype=float)
    ripiego = pd.to_numeric(righe["baseline_restringimento"], errors="coerce").to_numpy()
    gare = pd.to_numeric(righe["gare_precedenti"], errors="coerce").to_numpy()
    fascia = validate_maturity.etichetta_fascia(gare)
    lega = righe["league_id"].astype(str).to_numpy()

    # Una condizione che non e' fra le colonne del modello non arriverebbe mai al lato che
    # prevede: si escluderebbe da sola in produzione, quindi non entra nemmeno qui.
    condizioni = list(CONDIZIONI_SEMPRE)
    extra = [nome for nome in CONDIZIONI_SE_CI_SONO
             if nome in righe.columns and nome in complete]
    accessorie = {nome: pd.to_numeric(righe[nome], errors="coerce").to_numpy() for nome in extra}

    quando = righe["quando"]
    confini = [
        quando.quantile(quota_iniziale + (1.0 - quota_iniziale) * k / origini)
        for k in range(origini + 1)
    ]

    raccolta = []
    for k in range(origini):
        inizio, fine = confini[k], confini[k + 1]
        treno = (quando < inizio).to_numpy()
        prova = ((quando >= inizio) & (quando < fine)).to_numpy()
        if treno.sum() < 500 or prova.sum() < 100:
            continue
        previsto, _ = evaluate.addestra_e_prevedi(nome_modello, x[treno], y[treno], x[prova])
        previsto = np.asarray(previsto, dtype=float)
        # La miscela congelata: e' il numero che il predittore produce davvero.
        atteso = previsto.copy()
        for nome, peso in pesi.items():
            dentro_fascia = fascia[prova] == nome
            if peso < 1 and dentro_fascia.any():
                atteso[dentro_fascia] = (peso * previsto[dentro_fascia]
                                         + (1 - peso) * ripiego[prova][dentro_fascia])
        dentro = (np.abs(atteso - y[prova]) <= soglia).astype(float)
        raccolta.append({
            "origine": k + 1,
            "atteso": atteso,
            "gare": gare[prova],
            "fascia": fascia[prova],
            "lega": lega[prova],
            "dentro": dentro,
            "accessorie": {nome: valori[prova] for nome, valori in accessorie.items()},
        })

    confronto = []
    for indice in range(1, len(raccolta)):
        prima = raccolta[:indice]
        ora = raccolta[indice]
        atteso_treno = np.concatenate([v["atteso"] for v in prima])
        gare_treno = np.concatenate([v["gare"] for v in prima])
        fascia_treno = np.concatenate([v["fascia"] for v in prima])
        lega_treno = np.concatenate([v["lega"] for v in prima])
        dentro_treno = np.concatenate([v["dentro"] for v in prima])
        if len(dentro_treno) < MINIMO_ADDESTRAMENTO or len(ora["dentro"]) < MINIMO_PROVA:
            continue
        # Senza due esiti diversi non c'e' niente da stimare, e la costante e' esatta.
        if len(np.unique(dentro_treno)) < 2:
            continue

        colonne_treno = [atteso_treno, gare_treno]
        colonne_prova = [ora["atteso"], ora["gare"]]
        for nome in extra:
            colonne_treno.append(np.concatenate([v["accessorie"][nome] for v in prima]))
            colonne_prova.append(ora["accessorie"][nome])
        x_treno = np.column_stack(colonne_treno)
        x_prova = np.column_stack(colonne_prova)
        buone_treno = np.isfinite(x_treno).all(axis=1)
        buone_prova = np.isfinite(x_prova).all(axis=1)
        if buone_treno.sum() < MINIMO_ADDESTRAMENTO or buone_prova.sum() < MINIMO_PROVA:
            continue

        vero = ora["dentro"][buone_prova]
        p_costante = costante_per_fascia(
            fascia_treno[buone_treno], dentro_treno[buone_treno], ora["fascia"][buone_prova])
        p_condizionale = condizionale(
            x_treno[buone_treno], dentro_treno[buone_treno], x_prova[buone_prova])

        con_lega_treno = np.column_stack([
            x_treno[buone_treno],
            codifica_lega(lega_treno[buone_treno], dentro_treno[buone_treno],
                          lega_treno[buone_treno])])
        con_lega_prova = np.column_stack([
            x_prova[buone_prova],
            codifica_lega(lega_treno[buone_treno], dentro_treno[buone_treno],
                          ora["lega"][buone_prova])])
        p_con_lega = condizionale(con_lega_treno, dentro_treno[buone_treno], con_lega_prova)

        confronto.append({
            "origine": ora["origine"],
            "righe_di_addestramento": int(buone_treno.sum()),
            "righe_di_prova": int(buone_prova.sum()),
            "quota_osservata": round(float(np.mean(vero)), 4),
            "costante_per_fascia": {"brier": round(brier(vero, p_costante), 5),
                                    "log_loss": round(log_loss(vero, p_costante), 5)},
            "condizionale": {"brier": round(brier(vero, p_condizionale), 5),
                             "log_loss": round(log_loss(vero, p_condizionale), 5),
                             "calibrazione": calibrazione(vero, p_condizionale)},
            "condizionale_con_lega": {"brier": round(brier(vero, p_con_lega), 5),
                                      "log_loss": round(log_loss(vero, p_con_lega), 5),
                                      "calibrazione": calibrazione(vero, p_con_lega)},
        })

    def vittorie(chiave, misura):
        return sum(1 for v in confronto
                   if v[chiave][misura] < v["costante_per_fascia"][misura])

    esito = {}
    for chiave in ("condizionale", "condizionale_con_lega"):
        if not confronto:
            esito[chiave] = {"promosso": False, "perche": "nessuna origine valutabile"}
            continue
        b, l = vittorie(chiave, "brier"), vittorie(chiave, "log_loss")
        totale = len(confronto)
        medio_brier = float(np.mean([v[chiave]["brier"] - v["costante_per_fascia"]["brier"]
                                     for v in confronto]))
        promosso = b > totale / 2.0 and l > totale / 2.0
        esito[chiave] = {
            "promosso": bool(promosso),
            "origini_vinte_su_brier": str(b) + "/" + str(totale),
            "origini_vinte_su_log_loss": str(l) + "/" + str(totale),
            "scarto_medio_di_brier": round(medio_brier, 6),
            "perche": ("batte la costante su entrambe le misure nella maggioranza delle "
                       "origini" if promosso else
                       "non batte la costante su entrambe le misure: resta la costante"),
        }

    promosso = esito.get("condizionale", {}).get("promosso", False)
    produzione = None
    if promosso and raccolta:
        colonne_tutte = [np.concatenate([v["atteso"] for v in raccolta]),
                         np.concatenate([v["gare"] for v in raccolta])]
        for nome in extra:
            colonne_tutte.append(np.concatenate([v["accessorie"][nome] for v in raccolta]))
        x_tutte = np.column_stack(colonne_tutte)
        y_tutte = np.concatenate([v["dentro"] for v in raccolta])
        buone = np.isfinite(x_tutte).all(axis=1)
        if buone.sum() >= MINIMO_ADDESTRAMENTO and len(np.unique(y_tutte[buone])) == 2:
            # Il modello che va in produzione si addestra su **tutte** le righe fuori
            # campione raccolte, non solo su quelle usate per giudicarlo: giudicare e
            # addestrare sono due momenti diversi, e qui si usa tutto cio' che si ha.
            scalatore = StandardScaler().fit(x_tutte[buone])
            logistica = LogisticRegression(max_iter=2000, C=1.0)
            logistica.fit(scalatore.transform(x_tutte[buone]), y_tutte[buone])
            calibrazioni = [v["condizionale"]["calibrazione"]["scarto_medio_di_calibrazione"]
                            for v in confronto]
            produzione = {
                "condizioni": ["valore_atteso", "gare_precedenti"] + extra,
                "standardizzazione": {
                    "media": [round(float(v), 10) for v in scalatore.mean_],
                    "scala": [round(float(v), 10) for v in scalatore.scale_],
                },
                "coefficienti": [round(float(v), 10) for v in logistica.coef_[0]],
                "intercetta": round(float(logistica.intercept_[0]), 10),
                "righe_di_addestramento": int(buone.sum()),
                "scarto_medio_di_calibrazione": round(float(np.mean(calibrazioni)), 4),
                "regola": (
                    "regressione logistica sulle condizioni note prima del calcio "
                    "d'inizio, addestrata sugli errori fuori campione di tutte le origini"
                ),
            }

    return {
        "target": target,
        "modello": nome_modello,
        "schema": SCHEMA,
        "modello_di_produzione": produzione,
        "soglia_assoluta": soglia,
        "come_e_stata_misurata": (
            "lo strato condizionale si addestra sugli errori fuori campione delle origini "
            "precedenti e si valuta sull'origine successiva: sugli errori del proprio "
            "periodo di addestramento sarebbe ottimista"
        ),
        "condizioni_usate": condizioni + extra,
        "origini_valutabili": len(confronto),
        "confronto_per_origine": confronto,
        "esito": esito,
        "avvertenza": (
            "la lega e' provata a parte perche' nell'analisi di discriminazione i suoi "
            "estremi sono stati scelti guardando i numeri, quindi lo scarto e' gonfiato "
            "per costruzione"
        ),
    }


def main():
    parser = argparse.ArgumentParser(description="Strato condizionale dell'affidabilita'")
    parser.add_argument("--target", required=True)
    parser.add_argument("--modello", default="poisson_glm", choices=sorted(evaluate.ESPORTABILI))
    parser.add_argument("--origini", type=int, default=5)
    parser.add_argument("--quota-iniziale", type=float, default=0.45)
    parser.add_argument("--densita-minima", type=float, default=0.80)
    argomenti = parser.parse_args()

    rapporto = valuta(argomenti.target, argomenti.modello, argomenti.origini,
                      argomenti.quota_iniziale, argomenti.densita_minima)
    os.makedirs(OUT_DIR, exist_ok=True)
    percorso = os.path.join(OUT_DIR, argomenti.target + "-affidabilita-condizionale.json")
    with open(percorso, "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=2)

    print("target: " + argomenti.target + " | modello: " + argomenti.modello
          + " | soglia: " + str(rapporto["soglia_assoluta"]))
    print("origini valutabili: " + str(rapporto["origini_valutabili"]))
    for chiave, voce in rapporto["esito"].items():
        print("  " + chiave + ": " + ("PROMOSSO" if voce.get("promosso") else "non promosso")
              + " | " + str(voce.get("origini_vinte_su_brier", "-")) + " su Brier, "
              + str(voce.get("origini_vinte_su_log_loss", "-")) + " su log-loss")
    print("scritto: " + percorso)
    return 0


if __name__ == "__main__":
    sys.exit(main())
