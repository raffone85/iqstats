"""Ablazioni per blocco: quanto vale davvero ciascun gruppo di feature.

Il metodo prescrive di aggiungere i blocchi uno alla volta e di misurare quanto ognuno
cambia l'errore. Qui si misura due volte, perche' le due domande sono diverse:

    cumulativa       che cosa aggiunge questo blocco a quelli che lo precedono
    lascia fuori uno che cosa si perde togliendo questo blocco dall'insieme completo

La seconda e' quella che dice se un blocco serve davvero: un blocco puo' sembrare utile
in ordine e diventare inutile quando gli altri sono gia' presenti.

Le righe utilizzabili si fissano una volta sola, sull'insieme completo delle feature:
altrimenti configurazioni diverse verrebbero valutate su campioni diversi e i confronti
non direbbero nulla.

Si usano i due modelli esportabili in TypeScript. Il gradient boosting resta fuori: e'
sempre arrivato terzo e non e' riproducibile nell'artefatto di produzione.

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/ablate.py --target yellow_cards
    .venv/Scripts/python.exe scripts/projection/models/ablate.py --tutti
"""

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import evaluate  # noqa: E402  (stesso pacchetto, caricato dopo il percorso)

OUT_DIR = os.path.join(os.path.dirname(__file__), "output")

# I blocchi disponibili oggi, nell'ordine del metodo. Ogni voce elenca i prefissi e i
# nomi esatti delle colonne che le appartengono: una colonna sta in un blocco solo.
BLOCCHI = [
    ("base", {
        "prefissi": ("lega_", "prodotto_stagione_"),
        "colonne": ("baseline_lega", "baseline_squadra_stagione", "baseline_restringimento",
                    "gare_precedenti", "zeta_dalla_lega"),
        "descrizione": "medie di lega e di squadra nella stagione, con restringimento",
    }),
    ("avversario", {
        "prefissi": ("avv_", "concesso_"),
        "colonne": ("baseline_attacco_contro_concesso", "debolezza_difesa_avversario",
                    "confronto_produce_meno_concede"),
        "descrizione": "profilo dell'avversario e valori concessi",
    }),
    ("forma", {
        "prefissi": ("prodotto_ultime", "prodotto_ewma"),
        "colonne": ("baseline_media_mobile",),
        "descrizione": "orizzonti recenti e media esponenziale",
    }),
    ("casa_trasferta", {
        "prefissi": ("prodotto_lato_",),
        "colonne": ("baseline_squadra_lato", "forza_attacco", "scarto_dalla_lega"),
        "descrizione": "split casa e trasferta e forza relativa",
    }),
    ("riposo", {
        "prefissi": ("giorni_",),
        "colonne": (),
        "descrizione": "giorni dall'ultima gara",
    }),
    ("giocatori", {
        "prefissi": ("giocatori_",),
        "colonne": (),
        "descrizione": "composizione della rosa: minuti, dipendenza da pochi, rotazione",
    }),
    ("allenatore", {
        "prefissi": ("allenatore_",),
        "colonne": (),
        "descrizione": "storia dell'allenatore prima di questa gara e gare con la squadra",
    }),
    ("arbitro", {
        "prefissi": ("arbitro_",),
        "colonne": (),
        "descrizione": "profilo dell'arbitro al momento di: severita', campione, scarto dalla lega",
    }),
    ("spaziale", {
        "prefissi": ("spaziale_",),
        "colonne": (),
        "descrizione": "profilo dei tiri: dentro e fuori area, distanza, qualita', prodotto e concesso",
    }),
    ("classifica", {
        "prefissi": ("classifica_",),
        "colonne": (),
        "descrizione": "punti e reti accumulati nella stagione, e lo scarto con l'avversario",
    }),
    ("contesto", {
        "prefissi": ("contesto_",),
        "colonne": (),
        "descrizione": "turno, derby e gare ravvicinate",
    }),
    ("interazione", {
        "prefissi": ("interazione_",),
        "colonne": (),
        "descrizione": "il lato del campo moltiplicato per forza, classifica e arbitro",
    }),
]

# Blocchi che il metodo prevede e che non sono ancora costruibili: si dichiarano invece
# di far finta che non esistano.
BLOCCHI_NON_DISPONIBILI = {
    "formazione": "le formazioni previste storiche non esistono: sarebbe contaminazione",
    "meteo_terreno_viaggio": (
        "la fonte li valorizza solo dalla meta' di aprile 2026: un campo nuovo, non un "
        "campo sparso. In finestra avanzante cadrebbero tutti nell'ultima origine"
    ),
    "campo_neutro": "falso in tutte le gare dell'archivio: costante, non feature",
    "spettatori": "mai valorizzati dalla fonte in nessuna gara",
}

MODELLI = ("poisson_glm", "ridge")


def assegna_blocchi(colonne):
    """Ogni colonna a un blocco solo; quelle che non rientrano si dichiarano."""
    assegnate = {}
    fuori = []
    for nome in colonne:
        trovato = None
        for blocco, regola in BLOCCHI:
            if nome in regola["colonne"] or nome.startswith(regola["prefissi"]):
                trovato = blocco
                break
        if trovato is None:
            fuori.append(nome)
        else:
            assegnate.setdefault(trovato, []).append(nome)
    return assegnate, fuori


def misure_per_gara(parte, vero, previsto):
    """Il totale della gara come lo produrrebbe il motore: somma delle due proiezioni.

    Entrano solo le gare di cui il periodo di prova contiene entrambi i lati: una somma
    su un lato solo non e' un totale.
    """
    frame = pd.DataFrame({
        "event_id": parte["event_id"].to_numpy(),
        "vero": vero,
        "previsto": previsto,
    })
    conteggio = frame.groupby("event_id")["vero"].size()
    completi = conteggio[conteggio == 2].index
    if not len(completi):
        return None
    somme = frame[frame["event_id"].isin(completi)].groupby("event_id").sum()
    voce = evaluate.misure(somme["vero"].to_numpy(), somme["previsto"].to_numpy())
    if voce:
        voce["gare"] = int(len(somme))
    return voce


def misura_configurazione(x, y, quando, colonne_scelte, indici, confini,
                          utilizzabili=None, dettaglio=False):
    """Finestra avanzante su una configurazione di colonne, con le stesse origini.

    Con `dettaglio` si misurano anche errore per lega e per lato e la copertura reale
    dell'intervallo: servono al confronto mirato, non a ogni passo dell'ablazione.
    """
    if not colonne_scelte:
        return None
    sotto = x[:, indici]
    esiti = {nome: {"vero": [], "previsto": [], "per_origine": [], "indici": [],
                    "basso": [], "alto": []} for nome in MODELLI}

    for k in range(len(confini) - 1):
        inizio, fine = confini[k], confini[k + 1]
        treno = (quando < inizio).to_numpy()
        prova = ((quando >= inizio) & (quando < fine)).to_numpy()
        if treno.sum() < 500 or prova.sum() < 100:
            continue
        for nome in MODELLI:
            previsto, previsto_treno = evaluate.addestra_e_prevedi(
                nome, sotto[treno], y[treno], sotto[prova])
            if previsto is None:
                continue
            esiti[nome]["vero"].append(y[prova])
            esiti[nome]["previsto"].append(previsto)
            voce = evaluate.misure(y[prova], previsto)
            esiti[nome]["per_origine"].append(voce["mae"] if voce else None)
            if dettaglio:
                disp = evaluate.dispersione_residua(y[treno], previsto_treno)
                livello, _ = evaluate.calibra_livello(y[treno], previsto_treno, disp)
                basso, alto = evaluate.intervallo(previsto, disp, livello)
                esiti[nome]["indici"].append(np.flatnonzero(prova))
                esiti[nome]["basso"].append(basso)
                esiti[nome]["alto"].append(alto)

    rapporto = {}
    for nome, dati in esiti.items():
        if not dati["vero"]:
            continue
        vero = np.concatenate(dati["vero"])
        previsto = np.concatenate(dati["previsto"])
        voce = evaluate.misure(vero, previsto)
        maes = [valore for valore in dati["per_origine"] if valore is not None]
        voce["mae_per_origine"] = maes
        voce["sd_fra_origini"] = round(float(np.std(maes, ddof=0)), 4) if maes else None
        if dettaglio and dati["basso"]:
            basso = np.concatenate(dati["basso"])
            alto = np.concatenate(dati["alto"])
            dentro = (vero >= basso) & (vero <= alto)
            finiti = np.isfinite(previsto) & np.isfinite(basso) & np.isfinite(alto)
            voce["copertura_intervallo"] = (
                round(float(np.mean(dentro[finiti])), 4) if finiti.any() else None)
            voce["livello_dichiarato"] = evaluate.LIVELLO_INTERVALLO
            if utilizzabili is not None:
                parte = utilizzabili.iloc[np.concatenate(dati["indici"])]
                voce["per_lega"] = evaluate.per_segmento(parte, vero, previsto, "league_id",
                                                         massimo=8)
                voce["per_lato"] = evaluate.per_segmento(parte, vero, previsto, "lato")
                voce["totale_di_gara"] = misure_per_gara(parte, vero, previsto)
        rapporto[nome] = voce
    rapporto["colonne"] = len(colonne_scelte)
    return rapporto


def ablazione(target, origini, quota_iniziale, densita_minima, minimo_arbitro=None,
              mirato=None, lato=None):
    tavola = evaluate.carica(target)
    if lato:
        tavola = tavola[tavola["lato"] == lato].reset_index(drop=True)

    # Il sottoinsieme si fissa prima di scegliere le colonne: altrimenti le feature
    # dell'arbitro verrebbero scartate per densita' insufficiente sull'insieme intero.
    filtro = None
    if minimo_arbitro is not None:
        prima = len(tavola)
        tavola = tavola[tavola["arbitro_campione"].fillna(-1) >= minimo_arbitro]
        tavola = tavola.reset_index(drop=True)
        filtro = {
            "criterio": "arbitro con almeno " + str(minimo_arbitro) + " gare precedenti",
            "righe_prima": prima,
            "righe_dopo": int(len(tavola)),
        }

    colonne, _ = evaluate.colonne_feature(tavola, densita_minima)

    bersaglio = pd.to_numeric(tavola["valore_noto"], errors="coerce")
    matrice = tavola[colonne].apply(pd.to_numeric, errors="coerce")
    matrice = matrice.replace([np.inf, -np.inf], np.nan)

    # Le righe si fissano qui, sull'insieme completo: tutte le configurazioni useranno
    # esattamente le stesse osservazioni.
    completa = matrice.notna().all(axis=1) & bersaglio.notna()
    utilizzabili = tavola[completa].reset_index(drop=True)
    x = matrice[completa].to_numpy(dtype=float)
    y = bersaglio[completa].to_numpy(dtype=float)
    quando = utilizzabili["quando"]

    confini = [
        quando.quantile(quota_iniziale + (1.0 - quota_iniziale) * k / origini)
        for k in range(origini + 1)
    ]

    assegnate, fuori = assegna_blocchi(colonne)
    posizione = {nome: indice for indice, nome in enumerate(colonne)}
    presenti = [nome for nome, _ in BLOCCHI if assegnate.get(nome)]

    def indici_di(blocchi_scelti):
        scelte = [nome for blocco in blocchi_scelti for nome in assegnate.get(blocco, [])]
        return scelte, [posizione[nome] for nome in scelte]

    cumulativa = []
    precedente = None
    for k in range(1, len(presenti) + 1):
        gruppo = presenti[:k]
        scelte, indici = indici_di(gruppo)
        esito = misura_configurazione(x, y, quando, scelte, indici, confini)
        if esito is None:
            continue
        voce = {"blocchi": gruppo, "aggiunto": presenti[k - 1], "misure": esito}
        for nome in MODELLI:
            if precedente and nome in esito and nome in precedente:
                prima = precedente[nome]["mae"]
                voce.setdefault("guadagno", {})[nome] = round((prima - esito[nome]["mae"]) / prima, 5)
        cumulativa.append(voce)
        precedente = esito

    completo = cumulativa[-1]["misure"] if cumulativa else None

    lascia_fuori = []
    if completo and len(presenti) > 1:
        for blocco in presenti:
            gruppo = [nome for nome in presenti if nome != blocco]
            scelte, indici = indici_di(gruppo)
            esito = misura_configurazione(x, y, quando, scelte, indici, confini)
            if esito is None:
                continue
            voce = {"senza": blocco, "blocchi": gruppo, "misure": esito, "costo": {}}
            for nome in MODELLI:
                if nome in esito and nome in completo:
                    intero = completo[nome]["mae"]
                    voce["costo"][nome] = round((esito[nome]["mae"] - intero) / intero, 5)
            lascia_fuori.append(voce)

    confronto = None
    if mirato and assegnate.get(mirato):
        # Le due configurazioni differiscono per un blocco solo, sulle stesse righe e
        # con le stesse origini: e' il confronto che risponde «quanto vale questo blocco».
        senza = [nome for nome in presenti if nome != mirato]
        scelte_senza, indici_senza = indici_di(senza)
        scelte_con, indici_con = indici_di(presenti)
        misure_senza = misura_configurazione(x, y, quando, scelte_senza, indici_senza,
                                             confini, utilizzabili, dettaglio=True)
        misure_con = misura_configurazione(x, y, quando, scelte_con, indici_con,
                                           confini, utilizzabili, dettaglio=True)
        confronto = {
            "blocco": mirato,
            "colonne_del_blocco": assegnate.get(mirato, []),
            "senza": misure_senza,
            "con": misure_con,
            "guadagno": {},
        }
        for nome in MODELLI:
            if misure_senza and misure_con and nome in misure_senza and nome in misure_con:
                prima = misure_senza[nome]["mae"]
                confronto["guadagno"][nome] = round((prima - misure_con[nome]["mae"]) / prima, 5)

    return {
        "target": target,
        "generato_da": "scripts/projection/models/ablate.py",
        "righe_valutate": int(len(utilizzabili)),
        "sottoinsieme": filtro,
        "confronto_mirato": confronto,
        "origini": origini,
        "modelli": list(MODELLI),
        "blocchi_disponibili": {
            nome: {
                "colonne": len(assegnate.get(nome, [])),
                "descrizione": dict(BLOCCHI)[nome]["descrizione"],
            }
            for nome in presenti
        },
        "blocchi_non_disponibili": BLOCCHI_NON_DISPONIBILI,
        "colonne_non_assegnate": fuori,
        "cumulativa": cumulativa,
        "lascia_fuori_uno": lascia_fuori,
        "nota": (
            "il costo di «lascia fuori uno» e' l'aumento relativo dell'errore quando il "
            "blocco viene tolto dall'insieme completo: e' la misura di quanto serve davvero"
        ),
    }


def stampa(rapporto):
    print("target: " + rapporto["target"]
          + " | righe: " + str(rapporto["righe_valutate"])
          + " | origini: " + str(rapporto["origini"]))
    if rapporto.get("sottoinsieme"):
        filtro = rapporto["sottoinsieme"]
        print("sottoinsieme: " + filtro["criterio"] + " -> "
              + str(filtro["righe_dopo"]) + " righe su " + str(filtro["righe_prima"]))
    print("blocchi disponibili: " + ", ".join(
        nome + " (" + str(voce["colonne"]) + ")"
        for nome, voce in rapporto["blocchi_disponibili"].items()))
    if rapporto["colonne_non_assegnate"]:
        print("colonne non assegnate: " + ", ".join(rapporto["colonne_non_assegnate"]))

    print()
    print("cumulativa".ljust(24) + "MAE poisson".rjust(13) + "MAE ridge".rjust(11)
          + "guadagno poisson".rjust(18) + "guadagno ridge".rjust(16))
    for voce in rapporto["cumulativa"]:
        guadagno = voce.get("guadagno", {})
        print(("+ " + voce["aggiunto"]).ljust(24)
              + str(voce["misure"].get("poisson_glm", {}).get("mae", "-")).rjust(13)
              + str(voce["misure"].get("ridge", {}).get("mae", "-")).rjust(11)
              + str(guadagno.get("poisson_glm", "-")).rjust(18)
              + str(guadagno.get("ridge", "-")).rjust(16))

    confronto = rapporto.get("confronto_mirato")
    if confronto:
        print()
        print("confronto mirato sul blocco «" + confronto["blocco"] + "» ("
              + str(len(confronto["colonne_del_blocco"])) + " colonne)")
        print("".ljust(24) + "MAE".rjust(9) + "RMSE".rjust(9) + "bias".rjust(9)
              + "copertura".rjust(11) + "sd origini".rjust(12))
        for etichetta in ("senza", "con"):
            misure = confronto.get(etichetta) or {}
            for nome in MODELLI:
                voce = misure.get(nome)
                if not voce:
                    continue
                print((etichetta + " " + nome).ljust(24)
                      + str(voce.get("mae")).rjust(9)
                      + str(voce.get("rmse")).rjust(9)
                      + str(voce.get("bias")).rjust(9)
                      + str(voce.get("copertura_intervallo")).rjust(11)
                      + str(voce.get("sd_fra_origini")).rjust(12))
        print("guadagno: " + json.dumps(confronto["guadagno"], ensure_ascii=False))

    if rapporto["lascia_fuori_uno"]:
        print()
        print("lascia fuori uno".ljust(24) + "MAE poisson".rjust(13) + "MAE ridge".rjust(11)
              + "costo poisson".rjust(15) + "costo ridge".rjust(13))
        for voce in sorted(rapporto["lascia_fuori_uno"],
                           key=lambda v: -(v["costo"].get("ridge") or 0)):
            print(("- " + voce["senza"]).ljust(24)
                  + str(voce["misure"].get("poisson_glm", {}).get("mae", "-")).rjust(13)
                  + str(voce["misure"].get("ridge", {}).get("mae", "-")).rjust(11)
                  + str(voce["costo"].get("poisson_glm", "-")).rjust(15)
                  + str(voce["costo"].get("ridge", "-")).rjust(13))


def main():
    parser = argparse.ArgumentParser(description="Ablazioni per blocco di feature")
    parser.add_argument("--target", default=None)
    parser.add_argument("--tutti", action="store_true")
    parser.add_argument("--origini", type=int, default=5)
    parser.add_argument("--quota-iniziale", type=float, default=0.45)
    parser.add_argument("--densita-minima", type=float, default=0.95)
    parser.add_argument("--minimo-arbitro", type=int, default=None,
                        help="tiene solo le righe il cui arbitro ha almeno N gare precedenti")
    parser.add_argument("--mirato", default=None,
                        help="blocco da confrontare con e senza, a misure dettagliate")
    parser.add_argument("--suffisso", default="",
                        help="suffisso del file di rapporto, per non sovrascrivere")
    parser.add_argument("--lato", choices=("home", "away"), default=None,
                        help="misura un lato solo, per separare casa e trasferta")
    argomenti = parser.parse_args()

    if argomenti.tutti:
        bersagli = [nome[:-4] for nome in sorted(os.listdir(evaluate.FEATURE_DIR))
                    if nome.endswith(".csv")]
    elif argomenti.target:
        bersagli = [argomenti.target]
    else:
        print("indicare --target oppure --tutti")
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)
    for target in bersagli:
        rapporto = ablazione(target, argomenti.origini,
                             argomenti.quota_iniziale, argomenti.densita_minima,
                             argomenti.minimo_arbitro, argomenti.mirato, argomenti.lato)
        uscita = os.path.join(OUT_DIR, target + argomenti.suffisso + "-ablazione.json")
        with open(uscita, "w", encoding="utf-8") as handle:
            json.dump(rapporto, handle, ensure_ascii=False, indent=2)
        stampa(rapporto)
        print("scritto: " + uscita)
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
