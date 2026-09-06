"""Quanto reggono i mercati dei gol, e quelli dei due tempi.

I sette bersagli del motore hanno la loro curva di affidabilita' misurata; i mercati dei
gol no, e in pagina l'affidabilita' resta dichiarata assente. Questo script risponde alla
domanda che nessuno aveva ancora posto: **quelle probabilita' reggono?**

Il metodo e' lo stesso di `calibra_giocatori.py`, e per le stesse ragioni: le forze di una
gara si calcolano **solo sulle gare precedenti** della stessa stagione, la taratura si
misura su un periodo tenuto fuori e tagliato **per data**, e la verifica sa diventare rossa
su una stima volutamente storta.

Quattro mercati, tutti dal punteggio: Over 0,5 e Over 1,5 del primo tempo, Over 2,5 della
gara, e gol di entrambe. I primi due poggiano su `home_score_ht` e `away_score_ht`, coperti
sul 100% delle gare finite campionate.

**Che cosa questa misura dice, e che cosa non dice.** Misurato il 2 settembre 2026 su
1.383 gare con almeno sei gare alle spalle per entrambe le squadre:

    mercato            Brier     ECE      scarto massimo   gruppi fuori
    Over 0,5 1T        0,231     0,131    39,2 punti       5 su 8
    Over 1,5 1T        0,263     0,138    28,0 punti       5 su 8
    Over 2,5 gara      0,271     0,142    30,7 punti       7 su 8
    Gol/Gol            0,276     0,147    37,5 punti       7 su 8

**Questa variante non e' calibrata, e non di poco**: dove dichiara il 34,7% succede il
73,8%, e dove dichiara l'89,9% succede il 69,4%. La stima e' quasi piatta rispetto alla
realta', e nel gruppo piu' alto si ribalta.

**Ma la variante misurata qui non e' quella del prodotto.** In produzione gli attesi
escono da `mediaXg`, cioe' dai **gol attesi** osservati per lato; qui escono dai **gol
segnati**, perche' l'archivio locale porta i punteggi e non gli xG per gara - quelli
stanno nelle osservazioni, cioe' nel livello dati. Quindi il risultato non condanna il
mercato di produzione: dice che la stessa famiglia di formule, alimentata dal segnale piu'
povero, non regge. E dice che **non si puo' presumere** che quella con gli xG regga senza
misurarla allo stesso modo, con le osservazioni sotto mano.

Finche' quella misura non c'e', l'affidabilita' dei mercati dei gol resta dichiarata
assente in pagina. Non alta, non media: assente.

Uso:
    .venv/Scripts/python.exe scripts/projection/dataset/calibra_gol.py --taglio 2026-05-01
"""

import argparse
import json
import math
import os
import random
from collections import defaultdict

from build_player_base import wilson

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
GARE_DIR = os.path.join(ROOT, "scripts", "projection", "harvest", "data", "match-detail")
OUT_DIR = os.path.join(os.path.dirname(__file__), "output")

# Sotto queste gare alle spalle una forza non e' una forza: e' l'ultima serata.
MIN_GARE = 6
# In quanti gruppi di probabilita' uguale si misura la taratura, e quanto deve essere
# grosso un gruppo per essere giudicato.
#
# **Misurato il 2 settembre 2026: il campione qui e' molto piu' corto di quello dei
# giocatori.** Delle 4.441 gare finite in archivio solo 1.383 hanno sei gare alle spalle per
# entrambe le squadre nella stessa stagione, perche' l'archivio copre cinquanta stagioni e
# le prime giornate di ognuna non hanno storia. Dieci gruppi da duecento non si riempiono:
# otto da sessanta si', e l'intervallo di Wilson si allarga di conseguenza. Il numero che
# regge meglio con questo campione e' il Brier, che non dipende da come si divide.
BIN = 8
MIN_CASI_BIN = 60
MAX_GOL = 8


def poisson(media):
    """La distribuzione da 0 a MAX_GOL, rinormalizzata come nel prodotto."""
    p = [math.exp(-media)]
    for k in range(1, MAX_GOL + 1):
        p.append(p[k - 1] * media / k)
    massa = sum(p)
    return [v / massa for v in p]


def sopra(media, soglia):
    """La probabilita' di superare una soglia mezza, dalla distribuzione dei totali."""
    p = poisson(media)
    return sum(p[k] for k in range(len(p)) if k > soglia)


def probabilita(attesi_casa, attesi_trasferta):
    """I quattro mercati, dalle due medie. Stessa aritmetica del prodotto."""
    totale = attesi_casa + attesi_trasferta
    pc = poisson(attesi_casa)
    pt = poisson(attesi_trasferta)
    entrambe = (1 - pc[0]) * (1 - pt[0])
    return {
        "over05": sopra(totale, 0.5),
        "over15": sopra(totale, 1.5),
        "over25": sopra(totale, 2.5),
        "btts": entrambe,
    }


def casi_di_lega(lega):
    """Un caso per gara, con le forze calcolate sulle sole gare precedenti."""
    dir_lega = os.path.join(GARE_DIR, lega)
    if not os.path.isdir(dir_lega):
        return []
    gare = []
    for nome in os.listdir(dir_lega):
        if not nome.endswith(".json"):
            continue
        try:
            with open(os.path.join(dir_lega, nome), "r", encoding="utf-8") as handle:
                d = json.load(handle)
        except (OSError, ValueError):
            continue
        if d.get("period") != "FT":
            continue
        quando = d.get("event_date") or ""
        casa, ospite = d.get("home_team_id"), d.get("away_team_id")
        gc, gt = d.get("home_score"), d.get("away_score")
        hc, ht = d.get("home_score_ht"), d.get("away_score_ht")
        if not quando or casa is None or ospite is None:
            continue
        if None in (gc, gt, hc, ht):
            continue
        gare.append({
            "quando": quando, "stagione": d.get("season_id"),
            "casa": casa, "ospite": ospite,
            "gc": gc, "gt": gt, "hc": hc, "ht": ht,
        })
    gare.sort(key=lambda g: (g["quando"], g["casa"]))

    # Storia per (stagione, squadra, lato): segnati e subiti, primo tempo e gara intera.
    storia = defaultdict(lambda: {"gare": 0, "seg_pt": 0, "sub_pt": 0, "seg": 0, "sub": 0})
    lega_storia = defaultdict(lambda: {"gare": 0, "pt": 0, "tot": 0})
    casi = []

    for g in gare:
        st = g["stagione"]
        chiave_casa = (st, g["casa"], "home")
        chiave_ospite = (st, g["ospite"], "away")
        c, o = storia[chiave_casa], storia[chiave_ospite]
        l = lega_storia[st]

        if c["gare"] >= MIN_GARE and o["gare"] >= MIN_GARE and l["gare"] >= MIN_GARE * 4:
            media_pt = l["pt"] / l["gare"] / 2
            media_tot = l["tot"] / l["gare"] / 2
            if media_pt > 0 and media_tot > 0:
                # Lo stesso schema di forza del prodotto: attacco per difesa, sul metro
                # della lega, calcolato per il tempo e per la gara intera.
                att_c_pt = (c["seg_pt"] / c["gare"]) / media_pt
                dif_o_pt = (o["sub_pt"] / o["gare"]) / media_pt
                att_o_pt = (o["seg_pt"] / o["gare"]) / media_pt
                dif_c_pt = (c["sub_pt"] / c["gare"]) / media_pt
                att_c = (c["seg"] / c["gare"]) / media_tot
                dif_o = (o["sub"] / o["gare"]) / media_tot
                att_o = (o["seg"] / o["gare"]) / media_tot
                dif_c = (c["sub"] / c["gare"]) / media_tot
                pt = probabilita(att_c_pt * dif_o_pt * media_pt, att_o_pt * dif_c_pt * media_pt)
                intera = probabilita(att_c * dif_o * media_tot, att_o * dif_c * media_tot)
                gol_pt = g["hc"] + g["ht"]
                gol_tot = g["gc"] + g["gt"]
                casi.append({
                    "quando": quando_di(g), "lega": lega,
                    "pt_over05": (pt["over05"], 1 if gol_pt > 0 else 0),
                    "pt_over15": (pt["over15"], 1 if gol_pt > 1 else 0),
                    "over25": (intera["over25"], 1 if gol_tot > 2 else 0),
                    "btts": (intera["btts"], 1 if g["gc"] > 0 and g["gt"] > 0 else 0),
                })

        # La storia si aggiorna DOPO aver registrato il caso.
        for chiave, seg_pt, sub_pt, seg, sub in (
            (chiave_casa, g["hc"], g["ht"], g["gc"], g["gt"]),
            (chiave_ospite, g["ht"], g["hc"], g["gt"], g["gc"]),
        ):
            s = storia[chiave]
            s["gare"] += 1
            s["seg_pt"] += seg_pt
            s["sub_pt"] += sub_pt
            s["seg"] += seg
            s["sub"] += sub
        l["gare"] += 1
        l["pt"] += g["hc"] + g["ht"]
        l["tot"] += g["gc"] + g["gt"]

    return casi


def quando_di(g):
    return (g["quando"] or "")[:10]


def brier(coppie):
    return round(sum((p - e) ** 2 for p, e in coppie) / max(1, len(coppie)), 5)


def taratura(coppie):
    """Gruppi di probabilita' uguale: la stima media deve stare nell'intervallo di Wilson."""
    coppie = sorted(coppie, key=lambda x: x[0])
    if len(coppie) < MIN_CASI_BIN:
        return {"casi": len(coppie), "sufficiente": False}
    passo = len(coppie) / BIN
    gruppi, ece, massimo = [], 0.0, 0.0
    for i in range(BIN):
        fetta = coppie[int(i * passo):int((i + 1) * passo)]
        if len(fetta) < MIN_CASI_BIN:
            continue
        attesa = sum(p for p, _ in fetta) / len(fetta)
        colpi = sum(e for _, e in fetta)
        osservata = colpi / len(fetta)
        basso, alto = wilson(colpi, len(fetta))
        gruppi.append({
            "casi": len(fetta), "stima_media": round(attesa, 5),
            "osservata": round(osservata, 5), "ic95": [round(basso, 5), round(alto, 5)],
            "dentro": basso <= attesa <= alto,
        })
        ece += len(fetta) * abs(osservata - attesa)
        massimo = max(massimo, abs(osservata - attesa))
    giudicati = sum(g["casi"] for g in gruppi)
    fuori = [g for g in gruppi if not g["dentro"]]
    return {
        "casi": giudicati, "sufficiente": bool(gruppi), "gruppi": gruppi,
        "ece": round(ece / max(1, giudicati), 5),
        "scarto_massimo": round(massimo, 5),
        "gruppi_fuori": len(fuori),
        "brier": brier(coppie),
    }


def _autoverifica():
    """La misura promuove una stima onesta e boccia una storta, su dati finti.

    **Zero gruppi fuori non e' il criterio giusto, ed e' un errore che questa prova ha
    scoperto da sola il 2 settembre 2026.** Con dieci gruppi giudicati al 95%, mezzo gruppo
    fuori e' il valore atteso anche quando la stima e' perfetta: pretendere zero avrebbe
    bocciato una misura onesta quattro volte su dieci. Il criterio e' che una stima onesta
    ne abbia pochi e una storta molti di piu'.
    """
    caso = random.Random(20260902)
    coppie = [(p, 1 if caso.random() < p else 0)
              for p in (caso.choice([0.35, 0.5, 0.65, 0.8, 0.9]) for _ in range(20000))]
    onesta = taratura(coppie)
    assert onesta["gruppi_fuori"] <= 2, onesta["gruppi"]
    storta = taratura([(min(0.999, p * 1.25), e) for p, e in coppie])
    assert storta["gruppi_fuori"] >= 3, storta["gruppi_fuori"]
    assert storta["brier"] > onesta["brier"]
    print(f"autoverifica: onesta brier={onesta['brier']} ece={onesta['ece']}, "
          f"storta brier={storta['brier']} {storta['gruppi_fuori']} gruppi fuori")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--taglio", required=True, help="data del taglio, anno-mese-giorno")
    argomenti = parser.parse_args()
    _autoverifica()

    casi = []
    for lega in sorted(os.listdir(GARE_DIR)):
        if os.path.isdir(os.path.join(GARE_DIR, lega)):
            casi.extend(casi_di_lega(lega))
    print(f"casi costruiti: {len(casi)}")

    fuori = [c for c in casi if c["quando"] >= argomenti.taglio]
    dentro = [c for c in casi if c["quando"] < argomenti.taglio]
    print(f"addestramento implicito: {len(dentro)}, tenuti fuori: {len(fuori)}")

    rapporto = {"taglio": argomenti.taglio, "casi": len(casi), "fuori": len(fuori),
                "mercati": {}}
    for mercato in ("pt_over05", "pt_over15", "over25", "btts"):
        coppie = [c[mercato] for c in fuori]
        esito = taratura(coppie)
        rapporto["mercati"][mercato] = esito
        if esito.get("sufficiente"):
            print(f"\n{mercato}: {esito['casi']} casi, brier {esito['brier']}, "
                  f"ece {esito['ece']}, scarto massimo {esito['scarto_massimo']}, "
                  f"{esito['gruppi_fuori']} gruppi su {len(esito['gruppi'])} fuori")
            for g in esito["gruppi"]:
                segno = " " if g["dentro"] else "!"
                print(f"  {segno} stima {g['stima_media']:.4f}  osservata {g['osservata']:.4f}"
                      f"  ic95 [{g['ic95'][0]:.4f}, {g['ic95'][1]:.4f}]  su {g['casi']}")
        else:
            print(f"\n{mercato}: campione insufficiente ({esito['casi']} casi)")

    destinazione = os.path.join(OUT_DIR, f"taratura-gol-{argomenti.taglio}.json")
    with open(destinazione, "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=1)
    print(f"\nscritto {destinazione}")


if __name__ == "__main__":
    main()
