"""Le cinque linee: quanto valgono davvero le probabilita' Under/Over.

Il metodo chiede che le cinque soglie centrali portino probabilita' **dalla distribuzione
calibrata**, mai dalla sola distanza dal valore atteso. La distribuzione calibrata c'e' —
binomiale negativa con la dispersione stimata sui residui — ma nessuno ha mai misurato se
le probabilita' che ne escono siano oneste. Questo modulo le misura, sui due lati della
gara, fuori campione, come sono state misurate quelle del totale.

Due avvertenze che questo modulo non nasconde.

**Il livello nominale non entra nelle probabilita'.** Il livello nominale e' una correzione
dell'**intervallo**: su una distribuzione discreta chiedere l'ottanta per cento ne copre
spesso l'ottantasette, e si cerca il livello la cui copertura misurata e' quella voluta.
Quella correzione vale per gli estremi, non per la funzione di ripartizione: la probabilita'
di superare una soglia si legge dalla distribuzione cosi' com'e'.

**Una probabilita' mal calibrata e' peggio di nessuna probabilita'.** Se lo scarto fra
promessa e frequenza osservata e' grande, va dichiarato accanto al numero, oppure il numero
non si mostra. Qui si misura per poterlo dire.

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/lines.py --tutti
"""

import argparse
import json
import os
import sys

import numpy as np
from scipy import stats

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import evaluate  # noqa: E402
import reliability  # noqa: E402
import total  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "output")
SCHEMA = "cinque-linee/1"


def probabilita_over(soglie, mu, disp):
    """P(valore > soglia) dalla distribuzione calibrata, senza correzioni di intervallo."""
    mu = np.clip(np.asarray(mu, dtype=float), 1e-6, None)
    if disp <= evaluate.SOGLIA_POISSON:
        return 1.0 - stats.poisson.cdf(soglie, mu)
    p = 1.0 / disp
    r = mu / (disp - 1.0)
    return 1.0 - stats.nbinom.cdf(soglie, r, p)


def valuta(target, origini, quota_iniziale, densita_minima):
    nome_modello = total.modello_operativo(target)
    if nome_modello is None:
        raise SystemExit("nessun rapporto di maturita' per " + target)
    raccolta, _ = total.paia_di_gara(
        target, nome_modello, origini, quota_iniziale, densita_minima)
    if len(raccolta) < 2:
        return {"target": target, "schema": SCHEMA, "origini_valutabili": 0,
                "perche": "servono almeno due origini"}

    voci = []
    for indice in range(1, len(raccolta)):
        prima = raccolta[:indice]
        ora = raccolta[indice]
        # I due lati si misurano insieme: sono la stessa marginale, vista da due parti.
        atteso_treno = np.concatenate(
            [np.concatenate([v["atteso_casa"], v["atteso_via"]]) for v in prima])
        vero_treno = np.concatenate(
            [np.concatenate([v["vero_casa"], v["vero_via"]]) for v in prima])
        if len(vero_treno) < total.MINIMO_TRENO:
            continue
        atteso = np.concatenate([ora["atteso_casa"], ora["atteso_via"]])
        vero = np.concatenate([ora["vero_casa"], ora["vero_via"]])
        if len(vero) < total.MINIMO_PROVA:
            continue

        disp = evaluate.dispersione_residua(vero_treno, atteso_treno)
        linee = total.linee_di_gara(atteso)
        over = probabilita_over(linee, atteso[:, None], disp)
        misura = total.calibrazione_delle_linee(vero, linee, over)

        # Il termine di paragone: la frequenza storica di superare quella distanza dal
        # valore atteso, stimata sul treno. Se la distribuzione non la batte, le sue
        # probabilita' non stanno dicendo niente di piu' di una tabella.
        linee_treno = total.linee_di_gara(atteso_treno)
        distanza_treno = linee_treno - atteso_treno[:, None]
        superato_treno = (vero_treno[:, None] > linee_treno).astype(float)
        quote = {}
        for colonna in range(linee_treno.shape[1]):
            quote[colonna] = float(np.mean(superato_treno[:, colonna]))
        banale = np.column_stack([
            np.full(len(atteso), quote[colonna]) for colonna in range(linee.shape[1])])
        misura_banale = total.calibrazione_delle_linee(vero, linee, banale)

        voci.append({
            "origine": ora["origine"],
            "righe_di_prova": int(len(vero)),
            "dispersione": round(float(disp), 4),
            "distribuzione_calibrata": misura,
            "quota_storica_per_posizione": misura_banale,
            "passi_delle_linee": list(total.PASSI_DELLE_LINEE),
            "distanza_media_dalle_soglie": round(float(np.mean(np.abs(distanza_treno))), 4),
        })

    if not voci:
        return {"target": target, "schema": SCHEMA, "origini_valutabili": 0,
                "perche": "nessuna origine con campione bastante"}

    def medio(chiave, misura):
        return float(np.mean([v[chiave][misura] for v in voci if v[chiave][misura] is not None]))

    vinte = sum(1 for v in voci
                if v["distribuzione_calibrata"]["brier"] < v["quota_storica_per_posizione"]["brier"])
    return {
        "target": target,
        "modello": nome_modello,
        "schema": SCHEMA,
        "origini_valutabili": len(voci),
        "confronto_per_origine": voci,
        "esito": {
            "scarto_medio_di_calibrazione": round(medio("distribuzione_calibrata",
                                                        "scarto_medio_di_calibrazione"), 4),
            "brier": round(medio("distribuzione_calibrata", "brier"), 5),
            "brier_della_quota_storica": round(medio("quota_storica_per_posizione", "brier"), 5),
            "origini_in_cui_la_distribuzione_batte_la_quota_storica":
                str(vinte) + "/" + str(len(voci)),
            "perche": (
                "la quota storica per posizione e' la tabella che il metodo vieta: "
                "se la distribuzione non la batte, le sue probabilita' non aggiungono niente"
            ),
        },
        "come_e_stato_misurato": (
            "previsioni fuori campione del modello validato con la miscela congelata, "
            "dispersione stimata sulle sole origini precedenti, probabilita' lette dalla "
            "distribuzione senza la correzione del livello nominale, che vale per "
            "l'intervallo e non per la funzione di ripartizione"
        ),
    }


def main():
    parser = argparse.ArgumentParser(description="Calibrazione delle cinque linee sui due lati")
    parser.add_argument("--target")
    parser.add_argument("--tutti", action="store_true")
    parser.add_argument("--origini", type=int, default=5)
    parser.add_argument("--quota-iniziale", type=float, default=0.45)
    parser.add_argument("--densita-minima", type=float, default=0.80)
    argomenti = parser.parse_args()

    if not argomenti.tutti and not argomenti.target:
        raise SystemExit("indicare --target oppure --tutti")

    with open(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data",
                           "manifesto-feature.json"), "r", encoding="utf-8") as handle:
        bersagli = sorted(json.load(handle)["target"].keys())
    if not argomenti.tutti:
        bersagli = [argomenti.target]

    os.makedirs(OUT_DIR, exist_ok=True)
    for bersaglio in bersagli:
        rapporto = valuta(bersaglio, argomenti.origini, argomenti.quota_iniziale,
                          argomenti.densita_minima)
        percorso = os.path.join(OUT_DIR, bersaglio + "-linee.json")
        with open(percorso, "w", encoding="utf-8") as handle:
            json.dump(rapporto, handle, ensure_ascii=False, indent=2)
        esito = rapporto.get("esito")
        if esito is None:
            print(bersaglio + ": " + str(rapporto.get("perche")))
            continue
        print("%-18s scarto di calibrazione %.4f | Brier %.5f contro %.5f della quota "
              "storica | batte %s" % (
                  bersaglio, esito["scarto_medio_di_calibrazione"], esito["brier"],
                  esito["brier_della_quota_storica"],
                  esito["origini_in_cui_la_distribuzione_batte_la_quota_storica"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
