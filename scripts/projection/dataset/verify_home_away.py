"""L'effetto casa e' della lega o della singola squadra?

La domanda nasce da un'obiezione ragionevole: se una squadra in casa e' piu' aggressiva
e commette piu' falli, il modello dovrebbe saperlo. Il modello sa gia' l'effetto medio
della competizione, perche' le medie di lega sono calcolate per lato. Quello che
l'ablazione ha bocciato e' un'altra cosa: lo **scostamento personale** di una squadra
rispetto a quell'effetto medio.

Qui si misura se quello scostamento e' una proprieta' stabile della squadra o rumore.
Tre prove, tutte sull'archivio gia' in casa:

    effetto di lega       quanto vale, in media, giocare in casa
    ripetibilita'         lo scostamento di una squadra nella prima meta' della sua
                          stagione somiglia a quello della seconda meta'?
    permutazione          quanta della dispersione osservata fra squadre resterebbe
                          anche se l'etichetta casa/trasferta fosse mescolata a caso

La terza prova e' quella che decide: se la dispersione osservata non supera quella che
il caso produce da solo, non c'e' niente da imparare, e una feature che pretende di
impararlo aggiunge solo varianza.

Nessuna richiesta di rete. Sola lettura.

Uso:
    .venv/Scripts/python.exe scripts/projection/dataset/verify_home_away.py
"""

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

OSSERVAZIONI = os.path.join(os.path.dirname(__file__), "output", "osservazioni.csv")
OUT = os.path.join(os.path.dirname(__file__), "output", "verifica-casa-trasferta.json")

PROVENIENZE_AMMESSE = ("A", "B", "C")
METRICHE = ("fouls", "yellow_cards", "total_shots", "shots_on_target", "corner_kicks")
MIN_PER_LATO = 4          # gare per lato perche' una squadra-stagione entri
MIN_PER_META = 2          # gare per lato in ciascuna meta', per la ripetibilita'
PERMUTAZIONI = 200


def carica(metrica):
    colonne = ["event_id", "season_id", "league_id", "data", "calcio_dinizio",
               "lato", "team_id", metrica, metrica + "__p"]
    tavola = pd.read_csv(OSSERVAZIONI, usecols=colonne, low_memory=False)
    quando = tavola["calcio_dinizio"].fillna(tavola["data"])
    tavola["quando"] = pd.to_datetime(quando, errors="coerce", utc=True, format="mixed")
    valore = pd.to_numeric(tavola[metrica], errors="coerce")
    noto = tavola[metrica + "__p"].isin(PROVENIENZE_AMMESSE) & valore.notna()
    tavola["valore"] = valore.where(noto)
    return tavola[
        tavola["valore"].notna() & tavola["team_id"].notna()
        & tavola["season_id"].notna() & tavola["quando"].notna()
    ].sort_values(["team_id", "season_id", "quando", "event_id"])


def effetto(gruppo, maschera=None):
    """Media in casa meno media in trasferta, sulle righe indicate."""
    parte = gruppo if maschera is None else gruppo[maschera]
    casa = parte.loc[parte["lato"] == "home", "valore"]
    via = parte.loc[parte["lato"] == "away", "valore"]
    if len(casa) < 1 or len(via) < 1:
        return None, len(casa), len(via)
    return float(casa.mean() - via.mean()), len(casa), len(via)


def correlazione(prima, seconda):
    if len(prima) < 10:
        return None
    coefficiente = np.corrcoef(prima, seconda)[0, 1]
    return None if not np.isfinite(coefficiente) else float(coefficiente)


def analizza(metrica, generatore):
    tavola = carica(metrica)

    # 1. L'effetto medio della competizione, per lega e stagione.
    per_lega = []
    for _, gruppo in tavola.groupby(["league_id", "season_id"], sort=False):
        valore, casa, via = effetto(gruppo)
        if valore is not None and casa >= 20 and via >= 20:
            per_lega.append(valore)
    effetto_lega = float(np.mean(per_lega)) if per_lega else None

    # 2. Lo scostamento personale di ogni squadra dentro la sua stagione, e la sua
    #    ripetibilita' fra le due meta' alternate della stagione.
    individuali = []
    prima_meta = []
    seconda_meta = []
    for _, gruppo in tavola.groupby(["team_id", "season_id"], sort=False):
        valore, casa, via = effetto(gruppo)
        if valore is None or casa < MIN_PER_LATO or via < MIN_PER_LATO:
            continue
        individuali.append(valore)

        # Meta' alternate dentro ciascun lato: evita che un andamento stagionale
        # finisca tutto da una parte.
        ordine = gruppo.groupby("lato").cumcount()
        pari = (ordine % 2) == 0
        uno, casa_uno, via_uno = effetto(gruppo, pari)
        due, casa_due, via_due = effetto(gruppo, ~pari)
        if (uno is not None and due is not None
                and min(casa_uno, via_uno, casa_due, via_due) >= MIN_PER_META):
            prima_meta.append(uno)
            seconda_meta.append(due)

    ripetibilita = correlazione(np.array(prima_meta), np.array(seconda_meta))
    intera = None
    if ripetibilita is not None and ripetibilita > -1:
        # Spearman-Brown: due meta' sono meta' del campione, l'affidabilita' della
        # stagione intera e' piu' alta di quella di una meta'.
        intera = 2 * ripetibilita / (1 + ripetibilita)

    # 3. Quanta dispersione produrrebbe il caso da solo, mescolando le etichette.
    sd_osservata = float(np.std(individuali, ddof=1)) if len(individuali) > 2 else None
    sd_nulle = []
    ammesse = [
        gruppo for _, gruppo in tavola.groupby(["team_id", "season_id"], sort=False)
        if (gruppo["lato"] == "home").sum() >= MIN_PER_LATO
        and (gruppo["lato"] == "away").sum() >= MIN_PER_LATO
    ]
    for _ in range(PERMUTAZIONI):
        finti = []
        for gruppo in ammesse:
            etichette = generatore.permutation(gruppo["lato"].to_numpy())
            valori = gruppo["valore"].to_numpy()
            casa = valori[etichette == "home"]
            via = valori[etichette == "away"]
            if len(casa) and len(via):
                finti.append(float(casa.mean() - via.mean()))
        if len(finti) > 2:
            sd_nulle.append(float(np.std(finti, ddof=1)))
    sd_nulla = float(np.mean(sd_nulle)) if sd_nulle else None

    vera = None
    if sd_osservata is not None and sd_nulla is not None:
        differenza = sd_osservata ** 2 - sd_nulla ** 2
        vera = float(np.sqrt(differenza)) if differenza > 0 else 0.0

    return {
        "metrica": metrica,
        "righe": int(len(tavola)),
        "squadre_stagione": len(individuali),
        "effetto_medio_di_lega": None if effetto_lega is None else round(effetto_lega, 4),
        "scostamento_individuale_medio": round(float(np.mean(individuali)), 4) if individuali else None,
        "sd_osservata_fra_squadre": None if sd_osservata is None else round(sd_osservata, 4),
        "sd_attesa_dal_caso": None if sd_nulla is None else round(sd_nulla, 4),
        "sd_vera_stimata": None if vera is None else round(vera, 4),
        "quota_di_varianza_vera": (
            None if (sd_osservata in (None, 0) or vera is None)
            else round((vera ** 2) / (sd_osservata ** 2), 4)
        ),
        "coppie_di_meta": len(prima_meta),
        "ripetibilita_meta_contro_meta": None if ripetibilita is None else round(ripetibilita, 4),
        "affidabilita_stagione_intera": None if intera is None else round(intera, 4),
    }


def main():
    parser = argparse.ArgumentParser(description="L'effetto casa e' della lega o della squadra?")
    parser.add_argument("--permutazioni", type=int, default=PERMUTAZIONI)
    argomenti = parser.parse_args()

    generatore = np.random.default_rng(0)
    esiti = []
    for metrica in METRICHE:
        esiti.append(analizza(metrica, generatore))

    rapporto = {
        "generato_da": "scripts/projection/dataset/verify_home_away.py",
        "permutazioni": argomenti.permutazioni,
        "min_gare_per_lato": MIN_PER_LATO,
        "metriche": esiti,
        "nota": (
            "l'effetto medio di lega e' gia' nel modello attraverso le medie di lega per "
            "lato; qui si misura solo lo scostamento personale della singola squadra"
        ),
    }
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=2)

    print("metrica".ljust(17) + "eff.lega".rjust(9) + "sd oss.".rjust(9)
          + "sd caso".rjust(9) + "sd vera".rjust(9) + "% vera".rjust(8)
          + "ripetib.".rjust(10) + "affid.".rjust(8) + "squadre".rjust(9))
    for voce in esiti:
        print(voce["metrica"].ljust(17)
              + str(voce["effetto_medio_di_lega"]).rjust(9)
              + str(voce["sd_osservata_fra_squadre"]).rjust(9)
              + str(voce["sd_attesa_dal_caso"]).rjust(9)
              + str(voce["sd_vera_stimata"]).rjust(9)
              + str(voce["quota_di_varianza_vera"]).rjust(8)
              + str(voce["ripetibilita_meta_contro_meta"]).rjust(10)
              + str(voce["affidabilita_stagione_intera"]).rjust(8)
              + str(voce["squadre_stagione"]).rjust(9))
    print("scritto: " + OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
