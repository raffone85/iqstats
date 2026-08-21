"""La copertura dell'intervallo del totale: livello unico contro livello per fascia.

L'intervallo del totale promette l'80% e ne copre fra il 78,1% e il 79,9% su sei
bersagli su sette. E' uno scarto piccolo e con una direzione sola — ottimista — e
l'ipotesi da provare e' che venga dal calibrare un livello unico su fasce di maturita'
che hanno dispersioni diverse. Le marginali il livello lo calibrano gia' dentro la
fascia (§8bis): qui si prova a fare lo stesso sul totale.

**Non si cambia metodo.** Resta la calibrazione diretta scelta al §8quinquies: cambia
soltanto dove si stimano dispersione e livello nominale.

**Si stima sul treno e si misura sulla prova**, come sempre: un livello scelto guardando
l'origine su cui poi lo si giudica direbbe che l'intervallo copre meglio di quanto copra.

**Sotto il minimo di righe non si stima per fascia.** Una fascia con quaranta righe di
addestramento darebbe un livello che insegue il rumore; li' si ripiega sul livello unico,
e il rapporto dichiara quante volte e' successo.

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/total_coverage.py --tutti
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
SCHEMA = "copertura-del-totale/1"

# Sotto queste righe di addestramento una fascia non stima niente di proprio.
MINIMO_FASCIA = 300
FASCE = ("EARLY", "DEVELOPING", "MATURE")


def copertura(vero, basso, alto):
    dentro = (vero >= basso) & (vero <= alto)
    return float(np.mean(dentro)), float(np.mean(alto - basso))


def valuta(target, origini, quota_iniziale, densita_minima):
    nome_modello = total.modello_operativo(target)
    paia, _ = total.paia_di_gara(
        target, nome_modello, origini, quota_iniziale, densita_minima,
    )

    per_origine = []
    ripieghi = 0
    for indice in range(1, len(paia)):
        treno = paia[:indice]
        ora = paia[indice]
        vero_treno = np.concatenate([b["vero_casa"] + b["vero_via"] for b in treno])
        atteso_treno = np.concatenate([b["atteso_casa"] + b["atteso_via"] for b in treno])
        fascia_treno = np.concatenate([b["fascia"] for b in treno])
        if len(vero_treno) < total.MINIMO_TRENO or len(ora["event_id"]) < total.MINIMO_PROVA:
            continue

        vero = ora["vero_casa"] + ora["vero_via"]
        atteso = ora["atteso_casa"] + ora["atteso_via"]
        fascia = ora["fascia"]

        # A — come oggi: una dispersione e un livello per tutte le fasce.
        disp = total.dispersione_del_totale(vero_treno, atteso_treno)
        livello = total.livello_calibrato(vero_treno, atteso_treno, disp)
        basso_a, alto_a = total.intervallo_diretto(atteso, disp, livello)

        # B — dispersione e livello dentro la fascia, con ripiego dichiarato.
        basso_b = np.array(basso_a, dtype=float)
        alto_b = np.array(alto_a, dtype=float)
        dettaglio = {}
        for nome in FASCE:
            dentro_prova = fascia == nome
            if not dentro_prova.any():
                continue
            dentro_treno = fascia_treno == nome
            if dentro_treno.sum() < MINIMO_FASCIA:
                ripieghi += 1
                dettaglio[nome] = {"righe_treno": int(dentro_treno.sum()), "ripiego": True}
                continue
            disp_fascia = total.dispersione_del_totale(
                vero_treno[dentro_treno], atteso_treno[dentro_treno])
            livello_fascia = total.livello_calibrato(
                vero_treno[dentro_treno], atteso_treno[dentro_treno], disp_fascia)
            b_basso, b_alto = total.intervallo_diretto(
                atteso[dentro_prova], disp_fascia, livello_fascia)
            basso_b[dentro_prova] = b_basso
            alto_b[dentro_prova] = b_alto
            dettaglio[nome] = {
                "righe_treno": int(dentro_treno.sum()),
                "righe_prova": int(dentro_prova.sum()),
                "dispersione": round(float(disp_fascia), 4),
                "livello_nominale": round(float(livello_fascia), 3),
                "ripiego": False,
            }

        copertura_a, larghezza_a = copertura(vero, basso_a, alto_a)
        copertura_b, larghezza_b = copertura(vero, basso_b, alto_b)
        per_origine.append({
            "origine": ora["origine"],
            "gare": int(len(vero)),
            "livello_unico": round(float(livello), 3),
            "unico": {"copertura": round(copertura_a, 4), "larghezza": round(larghezza_a, 3)},
            "per_fascia": {"copertura": round(copertura_b, 4),
                           "larghezza": round(larghezza_b, 3)},
            "fasce": dettaglio,
        })

    if not per_origine:
        raise SystemExit("nessuna origine valutabile per " + target)

    def scostamento(chiave):
        return float(np.mean([
            abs(voce[chiave]["copertura"] - evaluate.LIVELLO_INTERVALLO)
            for voce in per_origine
        ]))

    scarto_unico = scostamento("unico")
    scarto_fascia = scostamento("per_fascia")
    vinte = sum(
        1 for voce in per_origine
        if abs(voce["per_fascia"]["copertura"] - evaluate.LIVELLO_INTERVALLO)
        < abs(voce["unico"]["copertura"] - evaluate.LIVELLO_INTERVALLO)
    )
    return {
        "schema": SCHEMA,
        "target": target,
        "modello": nome_modello,
        "obiettivo": evaluate.LIVELLO_INTERVALLO,
        "origini_valutate": len(per_origine),
        "ripieghi_per_campione_corto": ripieghi,
        "scostamento_medio": {
            "unico": round(scarto_unico, 4),
            "per_fascia": round(scarto_fascia, 4),
        },
        "copertura_media": {
            "unico": round(float(np.mean([v["unico"]["copertura"] for v in per_origine])), 4),
            "per_fascia": round(
                float(np.mean([v["per_fascia"]["copertura"] for v in per_origine])), 4),
        },
        "larghezza_media": {
            "unico": round(float(np.mean([v["unico"]["larghezza"] for v in per_origine])), 3),
            "per_fascia": round(
                float(np.mean([v["per_fascia"]["larghezza"] for v in per_origine])), 3),
        },
        "origini_vinte_dalla_fascia": vinte,
        "verdetto": "per_fascia" if scarto_fascia < scarto_unico else "unico",
        "per_origine": per_origine,
    }


def main():
    lettore = argparse.ArgumentParser(description="Copertura dell'intervallo del totale")
    lettore.add_argument("--target")
    lettore.add_argument("--tutti", action="store_true")
    lettore.add_argument("--origini", type=int, default=4)
    lettore.add_argument("--quota-iniziale", type=float, default=0.6)
    lettore.add_argument("--densita-minima", type=float, default=0.9)
    argomenti = lettore.parse_args()

    if argomenti.tutti:
        bersagli = sorted({
            nome.split("-totale.json")[0]
            for nome in os.listdir(OUT_DIR) if nome.endswith("-totale.json")
        })
    elif argomenti.target:
        bersagli = [argomenti.target]
    else:
        lettore.error("indicare --target oppure --tutti")

    for target in bersagli:
        rapporto = valuta(
            target, argomenti.origini, argomenti.quota_iniziale, argomenti.densita_minima,
        )
        percorso = os.path.join(OUT_DIR, target + "-totale-copertura.json")
        with open(percorso, "w", encoding="utf-8") as handle:
            json.dump(rapporto, handle, ensure_ascii=False, indent=2)
        print("%-18s unico %.4f · per fascia %.4f · vince %s (%d origini su %d) · ripieghi %d"
              % (target, rapporto["copertura_media"]["unico"],
                 rapporto["copertura_media"]["per_fascia"], rapporto["verdetto"],
                 rapporto["origini_vinte_dalla_fascia"], rapporto["origini_valutate"],
                 rapporto["ripieghi_per_campione_corto"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
