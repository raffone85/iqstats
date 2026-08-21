"""La composizione vince davvero, o vince perche' produce un intervallo piu' largo?

Sulle parate la composizione copre meglio della calibrazione diretta — 0,7904 contro
0,7821 — con un intervallo piu' largo dell'un virgola cinque per cento. Sono due fatti
diversi e vanno separati: un intervallo piu' largo copre di piu' per definizione, e se
bastasse allargare la diretta dello stesso tanto per ottenere la stessa copertura, allora
la composizione non porterebbe niente e la produzione potrebbe restare in forma chiusa.

La domanda non e' accademica: la composizione a runtime vuol dire simulare, e simulare
vuol dire portare un generatore di numeri casuali dentro il predittore e riprodurne il
risultato in TypeScript cifra per cifra. Si paga solo se serve.

Il confronto e' **a larghezza pari**: per ogni origine si cerca il livello nominale che
rende la larghezza media della diretta uguale a quella della composizione, e si guarda la
copertura che ne esce.

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/total_equal_width.py --target goalkeeper_saves
"""

import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import evaluate  # noqa: E402
import total  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "output")


def livello_per_larghezza(atteso, disp, larghezza_voluta):
    """Il livello nominale la cui larghezza media si avvicina di piu' a quella voluta."""
    migliore, scarto_migliore = None, None
    for livello in np.arange(0.50, 0.99, 0.005):
        basso, alto = evaluate.intervallo(atteso, disp, float(livello))
        larghezza = float(np.mean(alto - basso))
        scarto = abs(larghezza - larghezza_voluta)
        if scarto_migliore is None or scarto < scarto_migliore:
            migliore, scarto_migliore = float(livello), scarto
    return migliore


def confronta(target, origini, quota_iniziale, densita_minima, estrazioni):
    nome_modello = total.modello_operativo(target)
    if nome_modello is None:
        raise SystemExit("nessun rapporto di maturita' per " + target)
    raccolta, _ = total.paia_di_gara(
        target, nome_modello, origini, quota_iniziale, densita_minima)

    voci = []
    for indice in range(1, len(raccolta)):
        prima = raccolta[:indice]
        ora = raccolta[indice]
        atteso_treno = np.concatenate([v["atteso_casa"] + v["atteso_via"] for v in prima])
        vero_treno = np.concatenate([v["vero_casa"] + v["vero_via"] for v in prima])
        atteso_casa_treno = np.concatenate([v["atteso_casa"] for v in prima])
        vero_casa_treno = np.concatenate([v["vero_casa"] for v in prima])
        atteso_via_treno = np.concatenate([v["atteso_via"] for v in prima])
        vero_via_treno = np.concatenate([v["vero_via"] for v in prima])
        residuo_casa = np.concatenate([v["vero_casa"] - v["atteso_casa"] for v in prima])
        residuo_via = np.concatenate([v["vero_via"] - v["atteso_via"] for v in prima])
        if len(vero_treno) < total.MINIMO_TRENO or len(ora["event_id"]) < total.MINIMO_PROVA:
            continue

        atteso = ora["atteso_casa"] + ora["atteso_via"]
        vero = ora["vero_casa"] + ora["vero_via"]

        disp_totale = evaluate.dispersione_residua(vero_treno, atteso_treno)
        livello_a = total.livello_calibrato(vero_treno, atteso_treno, disp_totale)
        basso_a, alto_a = evaluate.intervallo(atteso, disp_totale, livello_a)

        disp_casa = evaluate.dispersione_residua(vero_casa_treno, atteso_casa_treno)
        disp_via = evaluate.dispersione_residua(vero_via_treno, atteso_via_treno)
        _, rango = total.correlazione(residuo_casa, residuo_via)
        livello_b = total.livello_della_composizione(
            atteso_casa_treno, disp_casa, atteso_via_treno, disp_via, rango, vero_treno,
            estrazioni, seme=2000 + ora["origine"])
        campione = total.simula_composizione(
            ora["atteso_casa"], disp_casa, ora["atteso_via"], disp_via, rango,
            estrazioni, seme=1000 + ora["origine"])
        coda = (1.0 - livello_b) / 2.0
        basso_b = np.quantile(campione, coda, axis=1)
        alto_b = np.quantile(campione, 1.0 - coda, axis=1)

        larghezza_b = float(np.mean(alto_b - basso_b))
        # Il livello che pareggia la larghezza si cerca **sul treno**, non sulla prova:
        # cercarlo sulla prova sarebbe scegliere guardando la risposta.
        basso_treno_b, alto_treno_b = None, None
        campione_treno = total.simula_composizione(
            atteso_casa_treno[:3000], disp_casa, atteso_via_treno[:3000], disp_via, rango,
            estrazioni, seme=3000 + ora["origine"])
        basso_treno_b = np.quantile(campione_treno, coda, axis=1)
        alto_treno_b = np.quantile(campione_treno, 1.0 - coda, axis=1)
        larghezza_treno_b = float(np.mean(alto_treno_b - basso_treno_b))
        livello_pari = livello_per_larghezza(
            atteso_treno[:3000], disp_totale, larghezza_treno_b)
        basso_pari, alto_pari = evaluate.intervallo(atteso, disp_totale, livello_pari)

        voci.append({
            "origine": ora["origine"],
            "gare_di_prova": int(len(vero)),
            "diretta": {
                "livello_nominale": round(livello_a, 3),
                "copertura": round(float(np.mean((vero >= basso_a) & (vero <= alto_a))), 4),
                "larghezza": round(float(np.mean(alto_a - basso_a)), 4),
            },
            "composizione": {
                "livello_nominale": round(livello_b, 3),
                "copertura": round(float(np.mean((vero >= basso_b) & (vero <= alto_b))), 4),
                "larghezza": round(larghezza_b, 4),
            },
            "diretta_a_larghezza_pari": {
                "livello_nominale": round(livello_pari, 3),
                "copertura": round(
                    float(np.mean((vero >= basso_pari) & (vero <= alto_pari))), 4),
                "larghezza": round(float(np.mean(alto_pari - basso_pari)), 4),
            },
        })

    return {
        "target": target,
        "modello": nome_modello,
        "schema": "totale-larghezza-pari/1",
        "domanda": (
            "la composizione copre meglio perche' descrive la dipendenza, o soltanto "
            "perche' produce un intervallo piu' largo?"
        ),
        "come_e_stato_misurato": (
            "il livello nominale che pareggia la larghezza si cerca sul periodo di "
            "addestramento e si applica alla prova: cercarlo sulla prova sarebbe "
            "sceglierlo guardando la risposta"
        ),
        "confronto_per_origine": voci,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", required=True)
    parser.add_argument("--origini", type=int, default=5)
    parser.add_argument("--quota-iniziale", type=float, default=0.45)
    parser.add_argument("--densita-minima", type=float, default=0.80)
    parser.add_argument("--estrazioni", type=int, default=total.ESTRAZIONI)
    argomenti = parser.parse_args()

    rapporto = confronta(argomenti.target, argomenti.origini, argomenti.quota_iniziale,
                         argomenti.densita_minima, argomenti.estrazioni)
    percorso = os.path.join(OUT_DIR, argomenti.target + "-totale-larghezza-pari.json")
    with open(percorso, "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=2)

    print(argomenti.target + " | modello " + str(rapporto["modello"]))
    for voce in rapporto["confronto_per_origine"]:
        print("  origine %d | diretta %.4f (larg %.2f) | composizione %.4f (larg %.2f) "
              "| diretta pari %.4f (larg %.2f)" % (
                  voce["origine"],
                  voce["diretta"]["copertura"], voce["diretta"]["larghezza"],
                  voce["composizione"]["copertura"], voce["composizione"]["larghezza"],
                  voce["diretta_a_larghezza_pari"]["copertura"],
                  voce["diretta_a_larghezza_pari"]["larghezza"]))
    print("scritto: " + percorso)
    return 0


if __name__ == "__main__":
    sys.exit(main())
