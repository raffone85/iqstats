"""Campione di riscontro per le feature «al momento di».

Per un numero dichiarato di righe reali scrive due cose accanto: l'ingresso completo,
nella forma esatta in cui il lato che prevede lo ricevera', e le feature che il lato che
addestra ha calcolato da quell'ingresso.

E' la prova su cui gira il test di parita': se i due lati leggono la stessa storia e
producono numeri diversi, il test lo dice prima che lo dica una proiezione sbagliata.

L'ingresso porta il profilo dell'arbitro **non ristretto**, perche' il restringimento e'
una regola del lato che prevede e va verificata anch'essa. Le feature attese vengono
percio' dalla tavola costruita col restringimento.

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/export_asof.py --target yellow_cards
"""

import argparse
import json
import math
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dataset"))

import build_features  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MANIFESTO = os.path.join(ROOT, "data", "manifesto-feature.json")
OUT_DIR = os.path.join(os.path.dirname(__file__), "output", "artefatti")

CAMPI_TIRO = (
    ("spaziale_totali", "totali"),
    ("spaziale_quota_in_area", "quotaInArea"),
    ("spaziale_distanza_media", "distanzaMedia"),
    ("spaziale_xg_per_tiro", "xgPerTiro"),
    ("spaziale_quota_qualita", "quotaQualita"),
    ("spaziale_quota_bloccati", "quotaBloccati"),
    ("spaziale_quota_da_fermo", "quotaDaFermo"),
)


def numero(valore):
    """Un valore ignoto resta ignoto: non diventa zero e non diventa una stringa."""
    if valore is None:
        return None
    if isinstance(valore, (np.integer,)):
        return int(valore)
    if isinstance(valore, (np.floating, float)):
        if math.isnan(float(valore)) or math.isinf(float(valore)):
            return None
        return float(valore)
    if isinstance(valore, (int,)):
        return int(valore)
    try:
        convertito = float(valore)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(convertito) else convertito


def carica_tiri():
    """(event_id, lato) -> profilo dei tiri di quella gara.

    Il dataset delle feature non li conserva: sono la misura della gara stessa e la
    tavola li getta appena ha finito di farne le medie. Qui servono grezzi, perche'
    sono un ingresso del calcolo, non un suo risultato.
    """
    percorso = os.path.join(ROOT, "scripts", "projection", "dataset", "output", "tiri.csv")
    if not os.path.isfile(percorso):
        return {}
    tavola = pd.read_csv(percorso, low_memory=False)
    mappa = {}
    for _, riga in tavola.iterrows():
        voce = {}
        for colonna, chiave in CAMPI_TIRO:
            voce[chiave] = numero(riga.get("tiro_" + colonna[len("spaziale_"):]))
        mappa[(int(riga["event_id"]), riga["lato"])] = voce
    return mappa


def gara_precedente(riga, tiri):
    voce = {
        "eventId": int(riga["event_id"]),
        "quando": pd.Timestamp(riga["quando"]).isoformat().replace("+00:00", "Z"),
        "stagione": numero(riga.get("season_id")),
        "lato": riga["lato"],
        "prodotto": numero(riga.get("valore_noto")),
        "concesso": numero(riga.get("concesso")),
        "punti": numero(riga.get("punti")),
        "retiFatte": numero(riga.get("reti_fatte")),
        "retiSubite": numero(riga.get("reti_subite")),
    }
    chiave = (int(riga["event_id"]), riga["lato"])
    altro = (int(riga["event_id"]), "away" if riga["lato"] == "home" else "home")
    if chiave in tiri:
        voce["tiri"] = tiri[chiave]
    if altro in tiri:
        voce["tiriConcessi"] = tiri[altro]
    return voce


def storia(tavola, chiave, valore, quando, event_id, tiri):
    """Le gare precedenti secondo lo stesso ordine del lato che addestra."""
    if valore is None or (isinstance(valore, float) and math.isnan(valore)):
        return []
    sotto = tavola[tavola[chiave] == valore]
    prima = sotto[
        (sotto["quando"] < quando)
        | ((sotto["quando"] == quando) & (sotto["event_id"] < event_id))
    ]
    prima = prima.sort_values(["quando", "event_id"])
    return [gara_precedente(riga, tiri) for _, riga in prima.iterrows()]


def profilo_arbitro(riga):
    if not riga.get("referee_id") or numero(riga.get("arbitro_campione")) is None:
        return None
    return {
        "campione": int(numero(riga["arbitro_campione"]) or 0),
        "gareViste": int(numero(riga.get("arbitro_gare_viste")) or 0),
        "prodottoMedia": numero(riga.get("arbitro_prodotto_media")),
        "prodottoSd": numero(riga.get("arbitro_prodotto_sd")),
        "prodottoEwma": numero(riga.get("arbitro_prodotto_ewma")),
        "prodottoLatoMedia": numero(riga.get("arbitro_prodotto_lato_media")),
        "falliMedia": numero(riga.get("arbitro_falli_media")),
        "ammonitiMedia": numero(riga.get("arbitro_ammoniti_media")),
        "espulsioniMedia": numero(riga.get("arbitro_espulsioni_media")),
    }


def colonne_del_manifesto(target):
    with open(MANIFESTO, "r", encoding="utf-8") as handle:
        manifesto = json.load(handle)
    voce = manifesto.get("target", {}).get(target)
    if not voce:
        raise SystemExit("nessuna voce di manifesto per " + target)
    return voce["feature"]


def esporta(target, quante, forza):
    tiri = carica_tiri()
    intera_pura = build_features.tavola_completa(target, "puro")
    intera_ristretta = build_features.tavola_completa(target, "restringimento", forza)

    colonne = colonne_del_manifesto(target)
    utilizzabile = (
        intera_ristretta["valore_noto"].notna()
        & intera_ristretta["team_id"].notna()
        & intera_ristretta["quando"].notna()
        & (intera_ristretta["gare_precedenti"] >= build_features.MIN_PREVIOUS_MATCHES)
        & (intera_ristretta["avv_gare_precedenti"].fillna(-1)
           >= build_features.MIN_PREVIOUS_MATCHES)
    )
    candidate = intera_ristretta[utilizzabile].sort_values(["quando", "event_id", "lato"])
    if len(candidate) == 0:
        raise SystemExit("nessuna riga utilizzabile per " + target)

    # Righe distribuite su tutto l'intervallo, non le prime che capitano.
    passo = max(len(candidate) // quante, 1)
    scelte = candidate.iloc[::passo].head(quante)

    prove = []
    for _, riga in scelte.iterrows():
        gemella = intera_pura[
            (intera_pura["event_id"] == riga["event_id"])
            & (intera_pura["lato"] == riga["lato"])
        ]
        if len(gemella) != 1:
            continue
        pura = gemella.iloc[0]

        ingresso = {
            "quando": pd.Timestamp(riga["quando"]).isoformat().replace("+00:00", "Z"),
            "lato": riga["lato"],
            "stagione": numero(riga.get("season_id")),
            "turno": numero(riga.get("contesto_turno")),
            "derby": numero(riga.get("contesto_derby")),
            "squadra": storia(intera_pura, "team_id", riga["team_id"],
                              riga["quando"], riga["event_id"], tiri),
            "avversario": storia(intera_pura, "team_id", riga["opponent_id"],
                                 riga["quando"], riga["event_id"], tiri),
            "allenatore": storia(intera_pura, "coach_id", riga.get("coach_id"),
                                 riga["quando"], riga["event_id"], tiri),
            "allenatoreConLaSquadra": numero(riga.get("allenatore_gare_con_la_squadra")),
            "lega": {
                "media": numero(riga.get("lega_media")),
                "sd": numero(riga.get("lega_sd")),
                "latoMedia": numero(riga.get("lega_lato_media")),
                "latoCampione": numero(riga.get("lega_lato_campione")),
                "falli": numero(riga.get("rif_lega_falli")),
                "ammoniti": numero(riga.get("rif_lega_ammoniti")),
                "espulsioni": numero(riga.get("rif_lega_espulsioni")),
            },
            "arbitro": profilo_arbitro(pura),
            "rosa": {
                nome: numero(riga.get(nome))
                for nome in riga.index if str(nome).startswith("giocatori_")
            },
        }
        attese = {nome: numero(riga.get(nome)) for nome in colonne}
        prove.append({
            "event_id": int(riga["event_id"]),
            "lato": riga["lato"],
            "ingresso": ingresso,
            "attese": attese,
        })

    documento = {
        "generato_da": "scripts/projection/models/export_asof.py",
        "target": target,
        "colonne": colonne,
        "forza_restringimento_arbitro": forza,
        "min_previous_matches": build_features.MIN_PREVIOUS_MATCHES,
        "prove": prove,
        "nota": (
            "l'ingresso porta il profilo dell'arbitro non ristretto: il restringimento e' "
            "una regola del lato che prevede, e il test verifica anche quella"
        ),
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    uscita = os.path.join(OUT_DIR, target + "-riscontro-asof.json")
    with open(uscita, "w", encoding="utf-8") as handle:
        json.dump(documento, handle, ensure_ascii=False)
    return documento, uscita


def main():
    parser = argparse.ArgumentParser(description="Campione di riscontro per le feature as-of")
    parser.add_argument("--target", required=True)
    parser.add_argument("--quante", type=int, default=40)
    parser.add_argument("--forza-arbitro", type=float,
                        default=build_features.FORZA_RESTRINGIMENTO)
    argomenti = parser.parse_args()

    documento, uscita = esporta(argomenti.target, argomenti.quante, argomenti.forza_arbitro)
    print("target: " + documento["target"])
    print("prove: " + str(len(documento["prove"])))
    print("colonne: " + str(len(documento["colonne"])))
    gare = sum(len(prova["ingresso"]["squadra"]) + len(prova["ingresso"]["avversario"])
               for prova in documento["prove"])
    print("gare di storia serializzate: " + str(gare))
    print("scritto: " + uscita)
    return 0


if __name__ == "__main__":
    sys.exit(main())
