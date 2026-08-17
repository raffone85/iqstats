"""Quanto vale la proiezione quando la squadra ha giocato poco.

Il motore deve partire dalla quarta giornata: con tre gare precedenti prevede, e la
domanda non e' se mostrare la proiezione ma **quanto fidarsene**. Questo script misura
l'errore separatamente per fascia di storico della squadra, e per ogni fascia confronta il
modello con i suoi ripieghi.

Due cose che distinguono questa misura da una scorciatoia:

**Il modello non viene riaddestrato su un campione ridotto.** Cio' che scarseggia alla
quarta giornata e' lo storico *della squadra*, non lo storico di addestramento: il modello
resta quello vero, addestrato su tutto il passato disponibile all'origine. Simulare
l'inizio stagione riaddestrando su mille righe misurerebbe un motore che non esiste.

**L'intervallo si calibra anche per fascia.** Se in fascia EARLY l'errore e' maggiore,
l'intervallo deve essere piu' largo li' e non ovunque. Dispersione e livello nominale si
stimano sul solo periodo di addestramento, dentro la fascia.

Le fasce, che descrivono la maturita' del campione e mai la disponibilita' del motore:

    EARLY       3-4 gare precedenti
    DEVELOPING  5-9
    MATURE      10 o piu'

I metodi confrontati, che sono i gradini della gerarchia di ripiego del metodo:

    A  modello completo         le feature del manifesto per quel bersaglio
    B  modello ridotto          i soli blocchi base, avversario e interazione
    C  baseline avversario      attacco della squadra contro concesso dell'avversario
    D  baseline restringimento  media di squadra ristretta verso la media di lega
    E  miscela calibrata        A e D pesati, con il peso stimato nella fascia sul treno

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/validate_maturity.py --target fouls \
        --modello ridge --densita-minima 0.80
"""

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ablate  # noqa: E402  (stesso pacchetto, caricato dopo il percorso)
import evaluate  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "output")

# I blocchi che restano informativi quando la squadra ha giocato poco: medie di lega e di
# stagione, profilo dell'avversario, e il lato del campo. Nessuno dei tre ha bisogno di una
# finestra lunga per essere calcolato.
BLOCCHI_RIDOTTI = ("base", "avversario", "interazione")

FASCE = (
    ("EARLY", 3, 4),
    ("DEVELOPING", 5, 9),
    ("MATURE", 10, 10 ** 6),
)

# I pesi provati per la miscela fra modello e baseline: il migliore si sceglie sul treno.
PESI = np.round(np.arange(0.0, 1.001, 0.05), 3)


def colonne_ridotte(colonne):
    """Le colonne del manifesto che appartengono ai blocchi robusti a poco storico."""
    assegnate, _ = ablate.assegna_blocchi(colonne)
    scelte = []
    for blocco in BLOCCHI_RIDOTTI:
        scelte.extend(assegnate.get(blocco, []))
    return [nome for nome in colonne if nome in set(scelte)]


def etichetta_fascia(gare):
    """La fascia di maturita' di ogni riga, come stringa; fuori dalle fasce resta vuota."""
    esito = np.full(len(gare), "", dtype=object)
    for nome, minimo, massimo in FASCE:
        esito[(gare >= minimo) & (gare <= massimo)] = nome
    return esito


def errore_standard_del_mae(errore):
    """Quanto e' incerta la stima del MAE: senza questo numero 87 righe sembrano una prova."""
    if len(errore) < 2:
        return None
    return float(np.std(np.abs(errore), ddof=1) / np.sqrt(len(errore)))


def misure(vero, previsto, basso=None, alto=None):
    vero = np.asarray(vero, dtype=float)
    previsto = np.asarray(previsto, dtype=float)
    valido = np.isfinite(vero) & np.isfinite(previsto)
    if valido.sum() == 0:
        return None
    errore = previsto[valido] - vero[valido]
    voce = {
        "n": int(valido.sum()),
        "mae": round(float(np.mean(np.abs(errore))), 4),
        "rmse": round(float(np.sqrt(np.mean(errore ** 2))), 4),
        "bias": round(float(np.mean(errore)), 4),
        "mae_mediano": round(float(np.median(np.abs(errore))), 4),
    }
    incertezza = errore_standard_del_mae(errore)
    voce["errore_standard_mae"] = round(incertezza, 4) if incertezza is not None else None
    if basso is not None and alto is not None:
        basso = np.asarray(basso, dtype=float)[valido]
        alto = np.asarray(alto, dtype=float)[valido]
        finiti = np.isfinite(basso) & np.isfinite(alto)
        if finiti.any():
            dentro = (vero[valido] >= basso) & (vero[valido] <= alto)
            voce["copertura_intervallo"] = round(float(np.mean(dentro[finiti])), 4)
            voce["ampiezza_media_intervallo"] = round(float(np.mean((alto - basso)[finiti])), 3)
    return voce


def per_segmento(valori, vero, previsto, massimo=None):
    """Errore per lega o per lato, sulle righe di una fascia.

    La soglia e' venti righe e non cento come nella validazione principale: qui i segmenti
    sono per costruzione piccoli, e sopprimerli tutti nasconderebbe la cosa da guardare.
    """
    esiti = {}
    categorie = valori.value_counts().index
    if massimo:
        categorie = categorie[:massimo]
    for categoria in categorie:
        maschera = (valori == categoria).to_numpy()
        voce = misure(vero[maschera], previsto[maschera])
        if voce and voce["n"] >= 20:
            esiti[str(categoria)] = voce
    return esiti


def instabilita(fra_origini):
    """Quanto l'errore cambia davvero da un periodo all'altro, tolto il rumore campionario.

    Con quaranta righe per origine, due origini danno MAE diversi anche se il modello e'
    identico: la dispersione osservata contiene sempre una quota che il caso produce da
    solo. La si sottrae in varianza, come nella verifica dell'effetto casa. Cio' che resta
    e' l'instabilita' vera, ed e' l'unico numero che distingue una fascia dall'altra
    quando il MAE medio non lo fa.
    """
    valide = [voce for voce in fra_origini
              if voce and voce.get("errore_standard_mae") is not None]
    if len(valide) < 2:
        return None
    mae = np.array([voce["mae"] for voce in valide], dtype=float)
    errori = np.array([voce["errore_standard_mae"] for voce in valide], dtype=float)
    osservata = float(np.var(mae, ddof=1))
    dal_caso = float(np.mean(errori ** 2))
    vera = max(osservata - dal_caso, 0.0)
    return {
        "origini": len(valide),
        "deviazione_osservata": round(float(np.sqrt(osservata)), 4),
        "deviazione_attesa_dal_caso": round(float(np.sqrt(dal_caso)), 4),
        "deviazione_vera": round(float(np.sqrt(vera)), 4),
    }


def confronto_appaiato(vero, primo, secondo):
    """Differenza di errore assoluto sulle stesse righe: appaiato, quindi molto piu' preciso.

    Con poche decine di righe la stima del MAE di ciascun metodo e' incerta, ma la
    differenza fra due metodi valutati sulle *stesse* righe lo e' molto meno.
    """
    vero = np.asarray(vero, dtype=float)
    valido = np.isfinite(vero) & np.isfinite(primo) & np.isfinite(secondo)
    if valido.sum() < 2:
        return None
    scarto = np.abs(primo[valido] - vero[valido]) - np.abs(secondo[valido] - vero[valido])
    media = float(np.mean(scarto))
    errore = float(np.std(scarto, ddof=1) / np.sqrt(len(scarto)))
    return {
        "n": int(valido.sum()),
        "differenza_mae": round(media, 4),
        "errore_standard": round(errore, 4),
        "rapporto": round(media / errore, 2) if errore > 0 else None,
    }


def peso_migliore(vero, modello, baseline):
    """Il peso della miscela che minimizza l'errore assoluto, cercato solo sul treno."""
    valido = np.isfinite(vero) & np.isfinite(modello) & np.isfinite(baseline)
    if valido.sum() < 50:
        return 1.0
    vero, modello, baseline = vero[valido], modello[valido], baseline[valido]
    errori = [float(np.mean(np.abs(peso * modello + (1 - peso) * baseline - vero)))
              for peso in PESI]
    return float(PESI[int(np.argmin(errori))])


def calibra(vero_treno, previsto_treno, previsto_prova):
    """Dispersione e livello nominale stimati sul treno, e gli estremi sulla prova."""
    disp = evaluate.dispersione_residua(vero_treno, previsto_treno)
    livello, _ = evaluate.calibra_livello(vero_treno, previsto_treno, disp)
    basso, alto = evaluate.intervallo(previsto_prova, disp, livello)
    return basso, alto, round(float(disp), 4), round(float(livello), 3)


def valuta(target, nome_modello, origini, quota_iniziale, densita_minima):
    tavola = evaluate.carica(target)
    colonne, _ = evaluate.colonne_feature(tavola, densita_minima)
    complete = evaluate.colonne_dal_manifesto(target, set(colonne))
    if complete is None:
        raise SystemExit("nessuna voce di manifesto per il target " + target)
    ridotte = colonne_ridotte(complete)

    bersaglio = pd.to_numeric(tavola["valore_noto"], errors="coerce")
    matrice = tavola[complete].apply(pd.to_numeric, errors="coerce")
    matrice = matrice.replace([np.inf, -np.inf], np.nan)
    utilizzabile = matrice.notna().all(axis=1) & bersaglio.notna()

    righe = tavola[utilizzabile].reset_index(drop=True)
    x = matrice[utilizzabile].to_numpy(dtype=float)
    posizioni_ridotte = [complete.index(nome) for nome in ridotte]
    y = bersaglio[utilizzabile].to_numpy(dtype=float)

    gare = pd.to_numeric(righe["gare_precedenti"], errors="coerce").to_numpy()
    gare_avversario = pd.to_numeric(righe["avv_gare_precedenti"], errors="coerce").to_numpy()
    fascia = etichetta_fascia(gare)
    fascia_coppia = etichetta_fascia(np.minimum(gare, gare_avversario))

    quando = righe["quando"]
    confini = [
        quando.quantile(quota_iniziale + (1.0 - quota_iniziale) * k / origini)
        for k in range(origini + 1)
    ]

    metodi = ("A_modello_completo", "B_modello_ridotto", "C_baseline_avversario",
              "D_baseline_restringimento", "E_miscela_calibrata", "F_miscela_congelata")
    storia_del_peso = {nome: [] for nome, _, _ in FASCE}
    raccolta = {nome: {"previsto": [], "basso": [], "alto": [], "basso_fascia": [],
                       "alto_fascia": [], "indici": []} for nome in metodi}
    per_origine = []

    for k in range(origini):
        inizio, fine = confini[k], confini[k + 1]
        treno = (quando < inizio).to_numpy()
        prova = ((quando >= inizio) & (quando < fine)).to_numpy()
        if treno.sum() < 500 or prova.sum() < 100:
            continue

        previsioni = {}
        previsioni_treno = {}

        completo, completo_treno = evaluate.addestra_e_prevedi(
            nome_modello, x[treno], y[treno], x[prova])
        previsioni["A_modello_completo"] = completo
        previsioni_treno["A_modello_completo"] = completo_treno

        ridotto, ridotto_treno = evaluate.addestra_e_prevedi(
            nome_modello, x[treno][:, posizioni_ridotte], y[treno], x[prova][:, posizioni_ridotte])
        previsioni["B_modello_ridotto"] = ridotto
        previsioni_treno["B_modello_ridotto"] = ridotto_treno

        for nome, colonna in (("C_baseline_avversario", "baseline_attacco_contro_concesso"),
                              ("D_baseline_restringimento", "baseline_restringimento")):
            valori = pd.to_numeric(righe[colonna], errors="coerce").to_numpy()
            previsioni[nome] = valori[prova]
            previsioni_treno[nome] = valori[treno]

        # La miscela: un peso per fascia, cercato sul solo treno e applicato alla prova.
        pesi = {}
        miscela = np.array(previsioni["A_modello_completo"], dtype=float)
        miscela_treno = np.array(previsioni_treno["A_modello_completo"], dtype=float)
        for nome, _, _ in FASCE:
            dentro_treno = fascia[treno] == nome
            if dentro_treno.sum() < 50:
                pesi[nome] = 1.0
                continue
            peso = peso_migliore(
                y[treno][dentro_treno],
                np.asarray(previsioni_treno["A_modello_completo"])[dentro_treno],
                np.asarray(previsioni_treno["D_baseline_restringimento"])[dentro_treno])
            pesi[nome] = peso
            dentro_prova = fascia[prova] == nome
            miscela[dentro_prova] = (
                peso * np.asarray(previsioni["A_modello_completo"])[dentro_prova]
                + (1 - peso) * np.asarray(previsioni["D_baseline_restringimento"])[dentro_prova])
            miscela_treno[dentro_treno] = (
                peso * np.asarray(previsioni_treno["A_modello_completo"])[dentro_treno]
                + (1 - peso) * np.asarray(previsioni_treno["D_baseline_restringimento"])[dentro_treno])
        previsioni["E_miscela_calibrata"] = miscela

        # La miscela congelata: il peso non si ristima a ogni origine, si prende la mediana
        # dei pesi gia' stimati fino a qui. E' la forma che finisce nell'artefatto, e va
        # provata cosi': un peso solo, deciso prima, valutato su un periodo mai guardato.
        pesi_congelati = {}
        congelata = np.array(previsioni["A_modello_completo"], dtype=float)
        for nome, _, _ in FASCE:
            storia_del_peso[nome].append(pesi.get(nome, 1.0))
            peso = float(np.median(storia_del_peso[nome]))
            pesi_congelati[nome] = round(peso, 3)
            dentro_prova = fascia[prova] == nome
            congelata[dentro_prova] = (
                peso * np.asarray(previsioni["A_modello_completo"])[dentro_prova]
                + (1 - peso) * np.asarray(previsioni["D_baseline_restringimento"])[dentro_prova])
        previsioni["F_miscela_congelata"] = congelata
        previsioni_treno["F_miscela_congelata"] = miscela_treno
        previsioni_treno["E_miscela_calibrata"] = miscela_treno

        voce_origine = {"origine": str(inizio)[:10], "treno": int(treno.sum()),
                        "prova": int(prova.sum()), "pesi_della_miscela": pesi,
                        "pesi_congelati": pesi_congelati, "metodi": {}}

        for nome in metodi:
            previsto = np.asarray(previsioni[nome], dtype=float)
            previsto_treno = np.asarray(previsioni_treno[nome], dtype=float)
            basso, alto, disp, livello = calibra(y[treno], previsto_treno, previsto)

            # Il secondo intervallo e' calibrato dentro la fascia: se l'errore cresce con
            # poco storico, l'intervallo deve crescere li' e non dappertutto.
            basso_fascia = np.full(len(previsto), np.nan)
            alto_fascia = np.full(len(previsto), np.nan)
            calibrazione_fascia = {}
            for etichetta, _, _ in FASCE:
                dentro_treno = fascia[treno] == etichetta
                dentro_prova = fascia[prova] == etichetta
                if dentro_treno.sum() < 200 or not dentro_prova.any():
                    continue
                b, a, d, l = calibra(y[treno][dentro_treno], previsto_treno[dentro_treno],
                                     previsto[dentro_prova])
                basso_fascia[dentro_prova] = b
                alto_fascia[dentro_prova] = a
                calibrazione_fascia[etichetta] = {"dispersione": d, "livello_nominale": l,
                                                  "righe_di_stima": int(dentro_treno.sum())}

            dati = raccolta[nome]
            dati["previsto"].append(previsto)
            dati["basso"].append(basso)
            dati["alto"].append(alto)
            dati["basso_fascia"].append(basso_fascia)
            dati["alto_fascia"].append(alto_fascia)
            dati["indici"].append(np.flatnonzero(prova))
            voce_origine["metodi"][nome] = {
                "dispersione": disp,
                "livello_nominale": livello,
                "calibrazione_per_fascia": calibrazione_fascia,
                "per_fascia": {
                    etichetta: misure(y[prova][fascia[prova] == etichetta],
                                      previsto[fascia[prova] == etichetta])
                    for etichetta, _, _ in FASCE
                    if (fascia[prova] == etichetta).any()
                },
            }

        per_origine.append(voce_origine)

    if not per_origine:
        raise SystemExit("nessuna origine valutabile per il target " + target)

    indici = np.concatenate(raccolta["A_modello_completo"]["indici"])
    vero = y[indici]
    sotto = righe.iloc[indici].reset_index(drop=True)
    fascia_prova = fascia[indici]
    fascia_coppia_prova = fascia_coppia[indici]

    unite = {}
    for nome in metodi:
        dati = raccolta[nome]
        unite[nome] = {
            "previsto": np.concatenate(dati["previsto"]),
            "basso": np.concatenate(dati["basso"]),
            "alto": np.concatenate(dati["alto"]),
            "basso_fascia": np.concatenate(dati["basso_fascia"]),
            "alto_fascia": np.concatenate(dati["alto_fascia"]),
        }

    per_fascia = {}
    for etichetta, _, _ in FASCE:
        dentro = fascia_prova == etichetta
        if not dentro.any():
            continue
        voce = {"righe": int(dentro.sum()), "metodi": {}}
        for nome in metodi:
            previsto = unite[nome]["previsto"][dentro]
            misura = misure(vero[dentro], previsto,
                            unite[nome]["basso"][dentro], unite[nome]["alto"][dentro])
            if misura is None:
                continue
            con_fascia = misure(vero[dentro], previsto,
                                unite[nome]["basso_fascia"][dentro],
                                unite[nome]["alto_fascia"][dentro])
            misura["copertura_intervallo_calibrato_per_fascia"] = (
                con_fascia.get("copertura_intervallo") if con_fascia else None)
            misura["ampiezza_media_intervallo_calibrato_per_fascia"] = (
                con_fascia.get("ampiezza_media_intervallo") if con_fascia else None)
            segmento = sotto[dentro].reset_index(drop=True)
            misura["per_lega"] = per_segmento(segmento["league_id"], vero[dentro], previsto,
                                              massimo=6)
            misura["per_lato"] = per_segmento(segmento["lato"], vero[dentro], previsto)
            fra_origini = [
                origine["metodi"][nome]["per_fascia"][etichetta]
                for origine in per_origine
                if etichetta in origine["metodi"][nome]["per_fascia"]
                and origine["metodi"][nome]["per_fascia"][etichetta] is not None
            ]
            misura["mae_per_origine"] = [voce_origine["mae"] for voce_origine in fra_origini]
            misura["righe_per_origine"] = [voce_origine["n"] for voce_origine in fra_origini]
            misura["instabilita_fra_origini"] = instabilita(fra_origini)
            voce["metodi"][nome] = misura

        migliore = min(voce["metodi"], key=lambda nome: voce["metodi"][nome]["mae"])
        voce["metodo_con_errore_minore"] = migliore
        voce["confronti_appaiati_contro_il_migliore"] = {
            nome: confronto_appaiato(vero[dentro], unite[nome]["previsto"][dentro],
                                     unite[migliore]["previsto"][dentro])
            for nome in metodi if nome != migliore
        }
        per_fascia[etichetta] = voce

    # Seconda vista: la fascia definita sul minimo fra le due squadre. La prima dice «da
    # quante gare parte la squadra», questa dice «quanto e' povero l'insieme dei due».
    per_fascia_coppia = {}
    for etichetta, _, _ in FASCE:
        dentro = fascia_coppia_prova == etichetta
        if not dentro.any():
            continue
        per_fascia_coppia[etichetta] = {
            "righe": int(dentro.sum()),
            "metodi": {nome: misure(vero[dentro], unite[nome]["previsto"][dentro])
                       for nome in metodi},
        }

    # Cio' che il modello di produzione deve portarsi dietro: un peso per fascia, preso
    # come mediana fra le origini perche' ogni origine lo ha stimato sul proprio treno,
    # dove le righe di fascia EARLY sono centinaia e non decine.
    parametri = {}
    for etichetta, _, _ in FASCE:
        pesi = [origine["pesi_della_miscela"][etichetta] for origine in per_origine
                if etichetta in origine["pesi_della_miscela"]]
        if not pesi:
            continue
        misurati_fascia = per_fascia.get(etichetta, {}).get("metodi", {})
        voce = misurati_fascia.get("A_modello_completo") or {}
        congelata = misurati_fascia.get("F_miscela_congelata") or {}
        parametri[etichetta] = {
            "peso_della_miscela": round(float(np.median(pesi)), 3),
            "pesi_per_origine": pesi,
            "mescolato_con": "D_baseline_restringimento",
            "mae_con_peso_congelato": congelata.get("mae"),
            "bias_con_peso_congelato": congelata.get("bias"),
            "copertura_con_peso_congelato": congelata.get(
                "copertura_intervallo_calibrato_per_fascia"),
            "mae_fuori_campione": voce.get("mae"),
            "errore_standard_mae": voce.get("errore_standard_mae"),
            "bias_fuori_campione": voce.get("bias"),
            "righe_di_prova": voce.get("n"),
            "instabilita_fra_origini": voce.get("instabilita_fra_origini"),
        }

    return {
        "target": target,
        "modello": nome_modello,
        "schema": "validazione-maturita/1",
        "parametri_per_fascia": parametri,
        "definizione_delle_fasce": {
            nome: str(minimo) + "-" + ("oltre" if massimo > 1000 else str(massimo))
            for nome, minimo, massimo in FASCE
        },
        "significato_delle_fasce": (
            "maturita' del campione della squadra, mai disponibilita' del motore: con tre "
            "gare precedenti il motore prevede"
        ),
        "come_e_stata_misurata": (
            "finestra avanzante identica alla validazione principale: il modello e' "
            "addestrato su tutto il passato disponibile all'origine e non su un campione "
            "ridotto. Cio' che varia fra le fasce e' lo storico della squadra, non quello "
            "di addestramento"
        ),
        "feature_complete": len(complete),
        "feature_ridotte": len(ridotte),
        "blocchi_del_modello_ridotto": list(BLOCCHI_RIDOTTI),
        "righe_utilizzabili": int(len(righe)),
        "origini": per_origine,
        "per_fascia_della_squadra": per_fascia,
        "per_fascia_della_coppia": per_fascia_coppia,
        "avvertenza": (
            "la fascia EARLY ha poche righe nel periodo di prova perche' quasi tutti gli "
            "inizi di stagione dell'archivio cadono prima della prima origine: leggere "
            "l'errore standard del MAE e i confronti appaiati, non il solo MAE"
        ),
    }


def main():
    parser = argparse.ArgumentParser(description="Errore e ripieghi per fascia di maturita'")
    parser.add_argument("--target", required=True)
    parser.add_argument("--modello", default="poisson_glm", choices=sorted(evaluate.ESPORTABILI))
    parser.add_argument("--origini", type=int, default=5)
    parser.add_argument("--quota-iniziale", type=float, default=0.45)
    parser.add_argument("--densita-minima", type=float, default=0.80)
    argomenti = parser.parse_args()

    rapporto = valuta(argomenti.target, argomenti.modello, argomenti.origini,
                      argomenti.quota_iniziale, argomenti.densita_minima)

    os.makedirs(OUT_DIR, exist_ok=True)
    uscita = os.path.join(OUT_DIR, argomenti.target + "-maturita.json")
    with open(uscita, "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=2)

    print("target: " + rapporto["target"] + " | modello: " + rapporto["modello"])
    print("feature: " + str(rapporto["feature_complete"]) + " complete, "
          + str(rapporto["feature_ridotte"]) + " ridotte")
    for etichetta, voce in rapporto["per_fascia_della_squadra"].items():
        print(etichetta + " (" + str(voce["righe"]) + " righe) -> "
              + voce["metodo_con_errore_minore"])
        for nome, misura in voce["metodi"].items():
            riga = "    " + nome.ljust(28) + "mae " + str(misura["mae"])
            riga += " +/- " + str(misura["errore_standard_mae"])
            riga += " | bias " + str(misura["bias"])
            riga += " | copertura " + str(misura.get("copertura_intervallo"))
            riga += " -> " + str(misura.get("copertura_intervallo_calibrato_per_fascia"))
            print(riga)
    print("scritto: " + uscita)
    return 0


if __name__ == "__main__":
    sys.exit(main())
