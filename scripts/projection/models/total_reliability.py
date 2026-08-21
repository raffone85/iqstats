"""L'affidabilita' del totale di gara: misurata sul totale, non dedotta dai due lati.

La definizione e' la stessa del §8quater, applicata a un'altra grandezza: **la
probabilita', misurata fuori campione, che lo scarto fra totale previsto e totale
osservato resti entro una soglia assoluta dichiarata**. Quattro scelte, e nessuna e'
negoziabile.

**Si misura direttamente su `|totale osservato − totale previsto|`.** Mai la media delle
due affidabilita' di lato, mai il minimo: sono numeri che rispondono a un'altra domanda.
Due lati che sbagliano in direzioni opposte danno un totale giusto, e nessuna
combinazione dei due punteggi lo sa.

**La soglia viene dalla migliore baseline DEL TOTALE.** Non dall'errore del modello — che
renderebbe la soglia una funzione di cio' che si sta misurando — e non dalla soglia
marginale del bersaglio, che vale per un lato solo. Le baseline si sommano lato per lato,
come si somma l'atteso, e vince quella con l'errore assoluto medio piu' basso. La regola
di arrotondamento e' quella gia' scritta in `export_model.soglia_assoluta`.

**La curva empirica e' propria del totale.** Quella delle marginali misura un'altra
distanza su un'altra scala, e il totale ha una dispersione piu' grande: leggere il totale
sulla curva del lato direbbe che il motore azzecca meno di quanto azzecchi.

**Il punteggio si legge dentro la fascia**, che per una gara e' la piu' povera dei due
lati — la storia piu' corta governa l'incertezza — e porta con se' l'incertezza binomiale.

Le previsioni non si riaddestrano: si riusano quelle fuori campione gia' prodotte da
`total.paia_di_gara`, con la miscela congelata dell'artefatto.

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/total_reliability.py --target offsides
    .venv/Scripts/python.exe scripts/projection/models/total_reliability.py --tutti
"""

import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import export_model  # noqa: E402
import total  # noqa: E402
import validate_maturity  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "output")
SCHEMA = "affidabilita-del-totale/1"

# Quante righe servono perche' una quota abbia senso. Sotto queste non si dichiara.
MINIMO_RIGHE = 30


def misura(target, origini, quota_iniziale, densita_minima):
    nome_modello = total.modello_operativo(target)
    paia, soglia_marginale = total.paia_di_gara(
        target, nome_modello, origini, quota_iniziale, densita_minima,
    )
    if not paia:
        raise SystemExit("nessuna origine utilizzabile per " + target)

    vero = np.concatenate([blocco["vero_casa"] + blocco["vero_via"] for blocco in paia])
    atteso = np.concatenate([blocco["atteso_casa"] + blocco["atteso_via"] for blocco in paia])
    fascia = np.concatenate([blocco["fascia"] for blocco in paia])

    # Le baseline del totale, sommate lato per lato come l'atteso.
    nomi = sorted(set.intersection(*[set(blocco["baseline"]) for blocco in paia]))
    baseline = {}
    for nome in nomi:
        valori = np.concatenate([blocco["baseline"][nome] for blocco in paia])
        valido = np.isfinite(valori) & np.isfinite(vero)
        if valido.sum() < MINIMO_RIGHE:
            continue
        baseline[nome] = {
            "mae": float(np.mean(np.abs(valori[valido] - vero[valido]))),
            "righe": int(valido.sum()),
        }
    if not baseline:
        raise SystemExit("nessuna baseline del totale utilizzabile per " + target)

    migliore = min(baseline, key=lambda nome: baseline[nome]["mae"])
    soglia = export_model.soglia_assoluta({"mae_migliore_baseline": baseline[migliore]["mae"]})
    if soglia is None:
        raise SystemExit("soglia del totale non determinabile per " + target)

    # La griglia delle marginali si ferma a otto: il totale ha una scala piu' grande e la
    # sua soglia puo' cadere oltre. Si estende fino a comprenderla, perche' il punto letto
    # sia misurato e non interpolato.
    soglie = tuple(sorted(set(validate_maturity.SOGLIE_DI_ERRORE)
                          | {float(k) for k in range(9, int(soglia) + 3)}
                          | {float(soglia)}))
    curva = validate_maturity.curva_di_accuratezza(vero, atteso, soglie)
    punto = export_model.punto_della_curva(curva, soglia)

    per_fascia = {}
    for nome in ("EARLY", "DEVELOPING", "MATURE"):
        dentro = fascia == nome
        if dentro.sum() < MINIMO_RIGHE:
            continue
        curva_fascia = validate_maturity.curva_di_accuratezza(vero[dentro], atteso[dentro], soglie)
        punto_fascia = export_model.punto_della_curva(curva_fascia, soglia)
        per_fascia[nome] = {
            "righe": int(dentro.sum()),
            # Lo stesso arrotondamento dell'artefatto, non uno suo: round() di Python
            # arrotonda al pari e su una quota di 0,525 esatti darebbe 52 dove
            # punteggio_da da' 53. Un punto di differenza fra rapporto e artefatto
            # sarebbe la quarta verita' scritta in due posti.
            "punteggio": None if punto_fascia is None
            else export_model.punteggio_da(punto_fascia)["punteggio"],
            "punto": punto_fascia,
            "curva_di_accuratezza": curva_fascia,
        }

    # Il termine di paragone che la specifica vieta di usare come risultato, riportato
    # perche' si veda quanto sarebbe stato diverso: la media e il minimo delle due
    # affidabilita' di lato non sono l'affidabilita' del totale.
    scarto_casa = np.concatenate([
        np.abs(blocco["atteso_casa"] - blocco["vero_casa"]) for blocco in paia])
    scarto_via = np.concatenate([
        np.abs(blocco["atteso_via"] - blocco["vero_via"]) for blocco in paia])
    dentro_casa = scarto_casa <= soglia_marginale if soglia_marginale else None
    dentro_via = scarto_via <= soglia_marginale if soglia_marginale else None

    return {
        "schema": SCHEMA,
        "target": target,
        "modello": nome_modello,
        "origini_valutate": len(paia),
        "gare": int(len(vero)),
        "soglia_assoluta": soglia,
        "soglia_dalla_baseline": migliore,
        "mae_baseline_del_totale": {nome: voce["mae"] for nome, voce in baseline.items()},
        "mae_del_modello": float(np.mean(np.abs(atteso - vero))),
        "punteggio": None if punto is None else export_model.punteggio_da(punto)["punteggio"],
        "punto": punto,
        "curva_di_accuratezza": curva,
        "per_fascia": per_fascia,
        "confronto_vietato": None if soglia_marginale is None else {
            "soglia_marginale": soglia_marginale,
            "quota_media_dei_due_lati": float(
                np.mean((dentro_casa.astype(float) + dentro_via.astype(float)) / 2.0)),
            "quota_minimo_dei_due_lati": float(
                np.mean((dentro_casa & dentro_via).astype(float))),
            "nota": "riportate come termine di paragone, non come affidabilita' del totale",
        },
    }


def main():
    lettore = argparse.ArgumentParser(description="Affidabilita' del totale di gara")
    lettore.add_argument("--target")
    lettore.add_argument("--tutti", action="store_true")
    lettore.add_argument("--origini", type=int, default=4)
    lettore.add_argument("--quota-iniziale", type=float, default=0.6)
    lettore.add_argument("--densita-minima", type=float, default=0.9)
    argomenti = lettore.parse_args()

    if argomenti.tutti:
        bersagli = total.bersagli_promossi() if hasattr(total, "bersagli_promossi") else []
        if not bersagli:
            bersagli = sorted({
                nome.split("-totale.json")[0]
                for nome in os.listdir(OUT_DIR) if nome.endswith("-totale.json")
            })
    elif argomenti.target:
        bersagli = [argomenti.target]
    else:
        lettore.error("indicare --target oppure --tutti")

    for target in bersagli:
        rapporto = misura(
            target, argomenti.origini, argomenti.quota_iniziale, argomenti.densita_minima,
        )
        percorso = os.path.join(OUT_DIR, target + "-totale-affidabilita.json")
        with open(percorso, "w", encoding="utf-8") as handle:
            json.dump(rapporto, handle, ensure_ascii=False, indent=2)
        print("%-18s soglia %g (da %s) · punteggio %s · gare %d" % (
            target, rapporto["soglia_assoluta"], rapporto["soglia_dalla_baseline"],
            rapporto["punteggio"], rapporto["gare"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
