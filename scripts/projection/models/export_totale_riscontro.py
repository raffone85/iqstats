"""Il campione di riscontro del totale e delle cinque linee.

L'artefatto porta i parametri; questo script porta i **numeri che ne devono uscire**, per
un insieme di gare reali, così che TypeScript possa ritrovarli partendo dagli stessi
parametri. È la stessa disciplina già in uso per il predittore e per le feature «al
momento di»: due implementazioni della stessa formula sono due numeri che prima o poi
divergono, e l'unico modo di accorgersene è confrontarli.

Le coppie di valori attesi non sono inventate: si prendono dal campione di riscontro del
predittore, appaiando le due righe della stessa gara. Sono quindi valori che il modello
produce davvero, con la loro scala e la loro variabilità.

Nessuna richiesta di rete. Sola lettura, salvo il file scritto.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/export_totale_riscontro.py
"""

import argparse
import glob
import json
import os
import sys

from scipy import stats

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import evaluate  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "output", "artefatti")
SCHEMA = "riscontro-totale/1"
PASSI = (-2.0, -1.0, 0.0, 1.0, 2.0)
COPPIE_MASSIME = 40


def soglie_di(atteso):
    centro = round(atteso) - 0.5
    return [centro + passo for passo in PASSI]


def probabilita_sopra(distribuzione, dispersione, atteso, soglia):
    """P(valore > soglia), letta dalla distribuzione calibrata, senza correzioni."""
    media = max(float(atteso), 1e-9)
    if distribuzione == "poisson":
        return float(1.0 - stats.poisson.cdf(soglia, media))
    p = 1.0 / dispersione
    r = media / (dispersione - 1.0)
    return float(1.0 - stats.nbinom.cdf(soglia, r, p))


def linee_di(distribuzione, dispersione, atteso):
    voci = []
    for soglia in soglie_di(atteso):
        sopra = probabilita_sopra(distribuzione, dispersione, atteso, soglia)
        voci.append({
            "soglia": soglia,
            "probabilita_sopra": sopra,
            "probabilita_sotto": 1.0 - sopra,
        })
    return voci


def coppie_dal_riscontro(percorso):
    with open(percorso, "r", encoding="utf-8") as handle:
        documento = json.load(handle)
    per_gara = {}
    for riga in documento.get("righe", []):
        chiave = str(riga.get("event_id"))
        per_gara.setdefault(chiave, {})[riga.get("lato")] = riga.get("valore_atteso")
    coppie = []
    for chiave in sorted(per_gara, key=lambda v: (len(v), v)):
        voce = per_gara[chiave]
        if voce.get("home") is None or voce.get("away") is None:
            continue
        coppie.append((chiave, float(voce["home"]), float(voce["away"])))
    return coppie


def costruisci(percorso_artefatto):
    with open(percorso_artefatto, "r", encoding="utf-8") as handle:
        artefatto = json.load(handle)
    totale = artefatto.get("totale")
    if not totale:
        return None

    riscontro = percorso_artefatto[:-5] + "-riscontro.json"
    if not os.path.isfile(riscontro):
        return None
    coppie = coppie_dal_riscontro(riscontro)[:COPPIE_MASSIME]
    if not coppie:
        return None

    calibrazione = artefatto["calibration"]
    prove = []
    for chiave, casa, trasferta in coppie:
        somma = casa + trasferta
        basso, alto = evaluate.intervallo(
            somma, totale["dispersione"], totale["livello_nominale"])
        prove.append({
            "event_id": chiave,
            "atteso_casa": casa,
            "atteso_trasferta": trasferta,
            "totale": {
                "valore_atteso": somma,
                "intervallo_basso": float(basso),
                "intervallo_alto": float(alto),
                "linee": linee_di(totale["distribuzione"], totale["dispersione"], somma),
            },
            "linee_casa": linee_di(
                calibrazione["distribuzione_intervallo"], calibrazione["dispersione"], casa),
            "linee_trasferta": linee_di(
                calibrazione["distribuzione_intervallo"], calibrazione["dispersione"],
                trasferta),
        })

    return {
        "schema_version": SCHEMA,
        "model_id": artefatto["model_id"],
        "target": artefatto["target"],
        "artefatto": os.path.basename(percorso_artefatto),
        "regola_del_centro": (
            "il valore atteso del totale e' la somma dei due attesi, senza nessuna stima"
        ),
        "regola_delle_linee": (
            "centro all'atteso arrotondato meno mezzo, cinque passi, probabilita' dalla "
            "funzione di ripartizione senza la correzione del livello nominale"
        ),
        "tolleranze": {"relativa": 1e-9, "assoluta": 1e-9},
        "prove": prove,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", help="un solo bersaglio, invece di tutti")
    argomenti = parser.parse_args()

    scritti = 0
    for percorso in sorted(glob.glob(os.path.join(OUT_DIR, "*__*.json"))):
        if percorso.endswith("-riscontro.json"):
            continue
        documento = costruisci(percorso)
        if documento is None:
            continue
        if argomenti.target and documento["target"] != argomenti.target:
            continue
        uscita = percorso[:-5] + "-riscontro-totale.json"
        with open(uscita, "w", encoding="utf-8") as handle:
            json.dump(documento, handle, ensure_ascii=False, indent=2)
        scritti += 1
        print("%-34s %d coppie -> %s" % (
            documento["model_id"], len(documento["prove"]), os.path.basename(uscita)))
    print("scritti: " + str(scritti))
    return 0


if __name__ == "__main__":
    sys.exit(main())
