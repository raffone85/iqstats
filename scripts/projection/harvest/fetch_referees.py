"""Raccoglie l'anagrafica degli arbitri: nome e paese, niente altro.

**Perche' esiste.** Le osservazioni squadra-gara portano `referee_id` da mesi, ma la
tavola `football.referees` ha 681 righe tutte chiamate «Arbitro NNNN (segnaposto
locale)»: `export_reference_local.py` scrive quel segnaposto di proposito, perche' al
motore di proiezione il nome non serve. All'area Arbitri serve, e una classifica di
«Arbitro 2433» non e' una pagina.

**Che cosa fa e che cosa non fa.** Scarica l'elenco degli arbitri dalla fonte, pagina per
pagina, e scrive un CSV con `source_id`, `name`, `country_name`. Non tocca il database:
l'aggiornamento e' un passo separato e dichiarato, perche' scrivere in produzione non e'
un effetto collaterale di una lettura.

**Le medie della fonte non si copiano.** L'elenco porta anche gialli e falli per gara
calcolati da loro: restano fuori. Le nostre medie si calcolano sulle nostre osservazioni,
con il nostro campione dichiarato, altrimenti la pagina mostrerebbe numeri che nessuno di
noi puo' spiegare.

Uso:
    python scripts/projection/harvest/fetch_referees.py
    python scripts/projection/harvest/fetch_referees.py --limite 200
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fetch_blocks import ROOT, acquisisci, leggi_configurazione  # noqa: E402

PAGINA = 100
PAUSA = 0.2
DESTINAZIONE = os.path.join(ROOT, "scripts", "projection", "harvest", "data", "arbitri.csv")


def scarica(token: str, base: str, limite: int | None) -> list[dict]:
    """Tutte le pagine dell'elenco, o le prime `limite` righe."""
    raccolti: list[dict] = []
    offset = 0
    while True:
        url = f"{base.rstrip('/')}/referees/?limit={PAGINA}&offset={offset}"
        stato, corpo, motivo, _ = acquisisci(url, token)
        if stato != "ok" or corpo is None:
            print(f"interrotto a offset {offset}: {stato} {motivo or ''}".strip(), file=sys.stderr)
            break
        blocco = json.loads(corpo)
        righe = blocco.get("results") or []
        if not righe:
            break
        raccolti.extend(righe)
        print(f"  offset {offset}: {len(righe)} righe, totale {len(raccolti)}")
        if limite is not None and len(raccolti) >= limite:
            return raccolti[:limite]
        if not blocco.get("next"):
            break
        offset += PAGINA
        time.sleep(PAUSA)
    return raccolti


def main() -> int:
    argomenti = argparse.ArgumentParser(description=__doc__)
    argomenti.add_argument("--limite", type=int, default=None, help="ferma dopo N arbitri")
    opzioni = argomenti.parse_args()

    token, base = leggi_configurazione()
    if not token or not base:
        print("token o indirizzo della fonte non configurati", file=sys.stderr)
        return 2

    print("Raccolta anagrafica arbitri.")
    arbitri = scarica(token, base, opzioni.limite)
    if not arbitri:
        print("nessun arbitro raccolto", file=sys.stderr)
        return 1

    # Un arbitro senza identificativo o senza nome non entra: un'anagrafica a meta' e'
    # peggio di un segnaposto, perche' sembra un dato.
    utili = [
        r for r in arbitri
        if r.get("id") is not None and isinstance(r.get("name"), str) and r["name"].strip()
    ]

    os.makedirs(os.path.dirname(DESTINAZIONE), exist_ok=True)
    with open(DESTINAZIONE, "w", encoding="utf-8", newline="") as handle:
        scrittore = csv.writer(handle)
        scrittore.writerow(["source_id", "name", "country_name"])
        for r in sorted(utili, key=lambda x: x["id"]):
            paese = r.get("country")
            scrittore.writerow([r["id"], r["name"].strip(), (paese or "").strip()])

    scartati = len(arbitri) - len(utili)
    print(f"\nScritti {len(utili)} arbitri in {DESTINAZIONE}")
    if scartati:
        print(f"Scartati {scartati} senza identificativo o senza nome.")
    print("Il database non e' stato toccato: l'aggiornamento e' un passo separato.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
