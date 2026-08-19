"""Selezione delle feature target per target, e manifesto di cio' che va in produzione.

Non esiste un insieme di feature buono per tutti i bersagli: l'arbitro vale sui falli e
non sui corner, la mappa dei tiri vale sui tiri in porta e non sugli ammoniti. Qui ogni
target decide da solo, e la decisione e' scritta con la sua prova accanto.

Che cosa si misura, per ogni blocco e per ogni target:

    costo per origine      quanto sale l'errore togliendo il blocco, origine per
                           origine e non solo in aggregato: un guadagno medio che
                           viene da una sola finestra fortunata non e' un guadagno
    importanza per         quanto sale l'errore permutando la singola colonna nel
    permutazione           periodo di prova, senza riaddestrare
    maturita'              come si comporta il modello con 3-4, 5-9 e 10 o piu' gare
                           precedenti: una feature che serve solo a chi ha molto
                           storico non deve impedire di prevedere dalla quarta gara
    costo di trasporto     che cosa bisogna portare in produzione perche' quel blocco
                           esista: la sola storia delle gare, o anche i dati per
                           giocatore e per tiro

Sui modelli lineari il contributo di Shapley coincide con il termine lineare
standardizzato: si riporta quello, invece di stimare per campionamento un numero che
si conosce in forma chiusa.

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/select_features.py --tutti
"""

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ablate  # noqa: E402
import evaluate  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT_DIR = os.path.join(os.path.dirname(__file__), "output")
MANIFESTO = os.path.join(ROOT, "data", "manifesto-feature.json")
VERSIONE_SCHEMA = "2026-08-17.1"

# Che cosa serve in produzione perche' un blocco si possa calcolare. Il trasporto non
# e' un dettaglio: un blocco che obbliga a portare le statistiche per giocatore di
# ogni gara precedente costa molto piu' di uno che si legge dalle stesse righe.
TRASPORTO = {
    "base": ("storia_squadra", "basso"),
    "avversario": ("storia_squadra", "basso"),
    "forma": ("storia_squadra", "basso"),
    "casa_trasferta": ("storia_squadra", "basso"),
    "riposo": ("storia_squadra", "basso"),
    "classifica": ("storia_squadra", "basso"),
    "contesto": ("calendario", "basso"),
    "interazione": ("storia_squadra", "basso"),
    "circolazione": ("storia_squadra_estesa", "medio"),
    "territorio": ("storia_squadra_estesa", "medio"),
    "intensita": ("storia_squadra_estesa", "medio"),
    "ambiente_tiro": ("storia_squadra_estesa", "medio"),
    "ambiente_gol": ("storia_squadra_estesa", "medio"),
    "inattive": ("storia_squadra_estesa", "medio"),
    "incrociato": ("storia_squadra_estesa", "medio"),
    "allenatore": ("storia_allenatore", "medio"),
    "arbitro": ("profilo_arbitro", "medio"),
    "giocatori": ("statistiche_per_giocatore", "alto"),
    "spaziale": ("mappa_dei_tiri", "alto"),
}

SOGLIA_NETTA = 0.002        # guadagno che vale anche senza unanimita' fra le origini
MAGGIORANZA = 3             # origini su cinque che devono migliorare
QUASI_UNANIME = 4
FASCE_MATURITA = ((3, 5, "3-4"), (5, 10, "5-9"), (10, 10 ** 6, "10+"))


def costi_per_origine(rapporto, blocco, modello):
    """Confronta origine per origine l'insieme completo e quello senza il blocco."""
    completo = rapporto["cumulativa"][-1]["misure"].get(modello, {}).get("mae_per_origine")
    senza = None
    for voce in rapporto["lascia_fuori_uno"]:
        if voce["senza"] == blocco:
            senza = voce["misure"].get(modello, {}).get("mae_per_origine")
    if not completo or not senza or len(completo) != len(senza):
        return None
    return [(dopo - prima) / prima for prima, dopo in zip(completo, senza)]


def decidi(costi, trasporto):
    """La regola, scritta una volta sola e applicata a tutti allo stesso modo."""
    if not costi:
        return False, "misura non disponibile"
    medio = float(np.mean(costi))
    migliorate = int(sum(1 for valore in costi if valore > 0))

    if medio <= 0:
        return False, ("toglierlo non peggiora: costo medio "
                       + str(round(medio * 100, 3)) + "% su " + str(len(costi)) + " origini")
    if migliorate >= QUASI_UNANIME:
        return True, ("costo " + str(round(medio * 100, 3)) + "% e "
                      + str(migliorate) + " origini su " + str(len(costi)))
    if medio >= SOGLIA_NETTA and migliorate >= MAGGIORANZA:
        return True, ("costo netto " + str(round(medio * 100, 3)) + "% con "
                      + str(migliorate) + " origini su " + str(len(costi)))
    if migliorate >= MAGGIORANZA and trasporto == "basso":
        return True, ("guadagno piccolo ma senza costo di trasporto: "
                      + str(round(medio * 100, 3)) + "%, " + str(migliorate) + " origini")
    return False, ("guadagno " + str(round(medio * 100, 3)) + "% instabile: solo "
                   + str(migliorate) + " origini su " + str(len(costi))
                   + ", trasporto " + trasporto)


def conferma(x, y, quando, confini, colonne, assegnate, tenuti, blocchi):
    """Il set scelto non deve perdere contro l'insieme intero.

    La decisione blocco per blocco misura un contributo **marginale**: se due blocchi
    dicono la stessa cosa, ciascuno sembra superfluo perche' l'altro c'e', e la regola
    li scarta entrambi. Tolti insieme, pero', quella cosa non la dice piu' nessuno.

    Qui si verifica, e se il set potato perde si reintegra il blocco piu' promettente
    fra gli scartati, uno alla volta, finche' il conto torna. La priorita' e'
    l'accuratezza, non il numero di colonne.
    """
    posizione = {nome: indice for indice, nome in enumerate(colonne)}

    def misura(gruppi):
        scelte = [nome for gruppo in gruppi for nome in assegnate.get(gruppo, [])]
        if not scelte:
            return None
        indici = [posizione[nome] for nome in scelte]
        esito = ablate.misura_configurazione(x, y, quando, scelte, indici, confini)
        if not esito:
            return None
        migliore = min(
            (nome for nome in ablate.MODELLI if nome in esito),
            key=lambda nome: esito[nome]["mae"],
            default=None,
        )
        return None if migliore is None else esito[migliore]["mae"]

    interi = [nome for nome in assegnate if assegnate.get(nome)]
    mae_intero = misura(interi)
    scelti = list(tenuti)
    mae_scelto = misura(scelti)
    reintegrati = []

    candidati = sorted(
        (nome for nome in interi if nome not in scelti
         and (blocchi.get(nome, {}).get("costo_medio") or 0) > 0),
        key=lambda nome: -(blocchi[nome]["costo_medio"] or 0),
    )
    while (mae_intero is not None and mae_scelto is not None
           and mae_scelto > mae_intero and candidati):
        reintegrato = candidati.pop(0)
        scelti.append(reintegrato)
        reintegrati.append(reintegrato)
        mae_scelto = misura(scelti)

    return scelti, {
        "mae_insieme_intero": None if mae_intero is None else round(mae_intero, 4),
        "mae_set_scelto": None if mae_scelto is None else round(mae_scelto, 4),
        "blocchi_reintegrati": reintegrati,
        "regola": (
            "il set scelto non puo' avere errore maggiore dell'insieme intero: se lo ha, "
            "si reintegrano i blocchi scartati con costo medio positivo, dal maggiore"
        ),
    }


def prepara(target, densita_minima):
    tavola = evaluate.carica(target)
    colonne, _ = evaluate.colonne_feature(tavola, densita_minima)
    bersaglio = pd.to_numeric(tavola["valore_noto"], errors="coerce")
    matrice = tavola[colonne].apply(pd.to_numeric, errors="coerce")
    matrice = matrice.replace([np.inf, -np.inf], np.nan)
    completa = matrice.notna().all(axis=1) & bersaglio.notna()
    utilizzabili = tavola[completa].reset_index(drop=True)
    x = matrice[completa].to_numpy(dtype=float)
    y = bersaglio[completa].to_numpy(dtype=float)
    return utilizzabili, colonne, x, y


def importanza_e_maturita(utilizzabili, colonne, x, y, modello, origini, quota_iniziale):
    """Permutazione colonna per colonna e errore per fascia di storico, fuori campione."""
    quando = utilizzabili["quando"]
    confini = [
        quando.quantile(quota_iniziale + (1.0 - quota_iniziale) * k / origini)
        for k in range(origini + 1)
    ]
    generatore = np.random.default_rng(0)
    aumenti = {nome: [] for nome in colonne}
    veri, previsti, indici = [], [], []

    for k in range(origini):
        inizio, fine = confini[k], confini[k + 1]
        treno = (quando < inizio).to_numpy()
        prova = ((quando >= inizio) & (quando < fine)).to_numpy()
        if treno.sum() < 500 or prova.sum() < 100:
            continue
        prevedi = evaluate.addestra(modello, x[treno], y[treno])
        if prevedi is None:
            continue
        previsto = prevedi(x[prova])
        base = evaluate.misure(y[prova], previsto)["mae"]
        veri.append(y[prova])
        previsti.append(previsto)
        indici.append(np.flatnonzero(prova))

        # Il modello resta quello addestrato: si guasta la colonna, non l'addestramento.
        campione = x[prova].copy()
        for posizione, nome in enumerate(colonne):
            originale = campione[:, posizione].copy()
            campione[:, posizione] = generatore.permutation(originale)
            guasto = prevedi(campione)
            campione[:, posizione] = originale
            aumenti[nome].append((evaluate.misure(y[prova], guasto)["mae"] - base) / base)

    importanza = []
    for nome in colonne:
        valori = aumenti[nome]
        if not valori:
            continue
        importanza.append({
            "colonna": nome,
            "aumento_medio": round(float(np.mean(valori)), 6),
            "origini_positive": int(sum(1 for valore in valori if valore > 0)),
            "origini": len(valori),
        })
    importanza.sort(key=lambda voce: -voce["aumento_medio"])

    maturita = {}
    if veri:
        vero = np.concatenate(veri)
        previsto = np.concatenate(previsti)
        parte = utilizzabili.iloc[np.concatenate(indici)]
        gare = pd.to_numeric(parte["gare_precedenti"], errors="coerce").to_numpy()
        for minimo, massimo, etichetta in FASCE_MATURITA:
            dentro = (gare >= minimo) & (gare < massimo)
            if dentro.sum() >= 100:
                maturita[etichetta] = evaluate.misure(vero[dentro], previsto[dentro])
    return importanza, maturita


def seleziona(target, origini, quota_iniziale, densita_minima):
    percorso = os.path.join(OUT_DIR, target + "-ablazione.json")
    if not os.path.isfile(percorso):
        return None
    with open(percorso, "r", encoding="utf-8") as handle:
        rapporto = json.load(handle)

    completo = rapporto["cumulativa"][-1]["misure"]
    migliore = min(
        (nome for nome in ablate.MODELLI if nome in completo),
        key=lambda nome: completo[nome]["mae"],
    )

    blocchi = {}
    tenuti = []
    for blocco in rapporto["blocchi_disponibili"]:
        _, costo_trasporto = TRASPORTO.get(blocco, ("ignoto", "medio"))
        costi = costi_per_origine(rapporto, blocco, migliore)
        tenere, motivo = decidi(costi, costo_trasporto)
        blocchi[blocco] = {
            "tenuto": tenere,
            "motivo": motivo,
            "costo_medio": round(float(np.mean(costi)), 6) if costi else None,
            "costo_per_origine": [round(valore, 6) for valore in costi] if costi else None,
            "trasporto": TRASPORTO.get(blocco, ("ignoto", "medio"))[0],
            "costo_trasporto": costo_trasporto,
        }
        if tenere:
            tenuti.append(blocco)

    utilizzabili, colonne, x, y = prepara(target, densita_minima)
    importanza, maturita = importanza_e_maturita(
        utilizzabili, colonne, x, y, migliore, origini, quota_iniziale)

    assegnate, _ = ablate.assegna_blocchi(colonne)
    quando = utilizzabili["quando"]
    confini = [
        quando.quantile(quota_iniziale + (1.0 - quota_iniziale) * k / origini)
        for k in range(origini + 1)
    ]
    tenuti, esito_conferma = conferma(
        x, y, quando, confini, colonne, assegnate, tenuti, blocchi)
    for blocco in esito_conferma["blocchi_reintegrati"]:
        blocchi[blocco]["tenuto"] = True
        blocchi[blocco]["motivo"] = (
            "reintegrato: senza di lui il set scelto perdeva contro l'insieme intero")
    scelte = [nome for blocco in tenuti for nome in assegnate.get(blocco, [])]

    return {
        "target": target,
        "modello_di_riferimento": migliore,
        "mae_insieme_completo": completo[migliore]["mae"],
        "righe_valutate": rapporto["righe_valutate"],
        "blocchi": blocchi,
        "blocchi_tenuti": tenuti,
        "conferma": esito_conferma,
        "feature": scelte,
        "feature_totali_candidate": len(colonne),
        "trasporto_richiesto": sorted({TRASPORTO.get(b, ("ignoto",))[0] for b in tenuti}),
        "maturita": maturita,
        "importanza_per_permutazione": importanza[:20],
        "importanza_coda": importanza[-10:],
    }


def main():
    parser = argparse.ArgumentParser(description="Selezione delle feature per target")
    parser.add_argument("--target", default=None)
    parser.add_argument("--tutti", action="store_true")
    parser.add_argument("--origini", type=int, default=5)
    parser.add_argument("--quota-iniziale", type=float, default=0.45)
    parser.add_argument("--densita-minima", type=float, default=0.80)
    argomenti = parser.parse_args()

    if argomenti.tutti:
        bersagli = [nome[: -len("-ablazione.json")] for nome in sorted(os.listdir(OUT_DIR))
                    if nome.endswith("-ablazione.json") and "-k" not in nome
                    and "-arbitro5" not in nome]
    elif argomenti.target:
        bersagli = [argomenti.target]
    else:
        print("indicare --target oppure --tutti")
        return 1

    voci = {}
    for target in bersagli:
        voce = seleziona(target, argomenti.origini, argomenti.quota_iniziale,
                         argomenti.densita_minima)
        if voce is None:
            print("manca il rapporto di ablazione per " + target)
            continue
        voci[target] = voce
        print("target: " + target + " | modello " + voce["modello_di_riferimento"]
              + " | feature " + str(len(voce["feature"])) + " su "
              + str(voce["feature_totali_candidate"]))
        for blocco, dettaglio in voce["blocchi"].items():
            segno = "tieni  " if dettaglio["tenuto"] else "scarta "
            print("   " + segno + blocco.ljust(16) + dettaglio["motivo"])
        prova = voce["conferma"]
        print("   conferma: insieme intero " + str(prova["mae_insieme_intero"])
              + " | set scelto " + str(prova["mae_set_scelto"])
              + (" | reintegrati " + ", ".join(prova["blocchi_reintegrati"])
                 if prova["blocchi_reintegrati"] else " | nessun reintegro"))
        if voce["maturita"]:
            print("   maturita: " + ", ".join(
                fascia + " MAE " + str(misura["mae"]) + " (n " + str(misura["n"]) + ")"
                for fascia, misura in voce["maturita"].items()))
        print("   prime feature per permutazione: " + ", ".join(
            riga["colonna"] + " " + str(round(riga["aumento_medio"] * 100, 2)) + "%"
            for riga in voce["importanza_per_permutazione"][:5]))
        print()

    # Il manifesto si aggiorna, non si riscrive da zero: chi lancia la selezione per un
    # solo bersaglio non intende cancellare gli altri, e senza questa fusione le voci gia'
    # validate sparirebbero insieme ai modelli che le citano.
    gia_presenti = {}
    if os.path.isfile(MANIFESTO):
        with open(MANIFESTO, "r", encoding="utf-8") as handle:
            gia_presenti = json.load(handle).get("target") or {}
    sostituiti = sorted(set(gia_presenti) & set(voci))
    if sostituiti:
        print("voci del manifesto rifatte: " + ", ".join(sostituiti))

    manifesto = {
        "versione_schema": VERSIONE_SCHEMA,
        "generato_da": "scripts/projection/models/select_features.py",
        "regola": {
            "tieni_se_quasi_unanime": "costo medio positivo e almeno "
                                      + str(QUASI_UNANIME) + " origini su cinque",
            "tieni_se_netto": "costo medio almeno " + str(SOGLIA_NETTA)
                              + " con almeno " + str(MAGGIORANZA) + " origini",
            "tieni_se_gratis": "almeno " + str(MAGGIORANZA)
                               + " origini e nessun costo di trasporto",
            "scarta_altrimenti": "costo medio nullo o negativo, oppure guadagno instabile",
            "nota": "la decisione e' presa target per target, mai in media fra i target",
        },
        "target": dict(sorted({**gia_presenti, **voci}.items())),
    }
    if voci:
        with open(MANIFESTO, "w", encoding="utf-8") as handle:
            json.dump(manifesto, handle, ensure_ascii=False, indent=2)
        print("scritto: " + MANIFESTO)
    return 0


if __name__ == "__main__":
    sys.exit(main())
