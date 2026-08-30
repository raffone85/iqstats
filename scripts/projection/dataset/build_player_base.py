"""Frequenze di base del giallo e del gol, per giocatore e per campionato.

Per ogni giocatore-gara si guarda **solo alle gare precedenti** del giocatore dentro la
stessa stagione, si calcola il suo passo per novanta minuti, e si misura quanto spesso
chi sta in un certo gruppo prende poi il giallo o segna. Non e' una stima e non e' una
probabilita': e' una frequenza osservata con il suo campione accanto, che e' la cosa che
si puo' mostrare senza tararla.

**Il giallo si legge dagli episodi, non dalle righe per giocatore.** Misurato il 30 agosto
2026 sulle stesse 395 gare di Serie A: `/events/{id}/incidents/` attribuisce il giallo a
1.470 giocatori, il campo `yellow_card` delle righe per giocatore a 907. Le righe non ne
inventano mai — 906 dei 907 stanno anche negli episodi — ma **ne perdono il 38,4%**, e in
qualche gara li perdono tutti. Un'etichetta sbagliata due volte su cinque renderebbe
falsa ogni frequenza prodotta qui. I gol invece combaciano (938 contro 961, la differenza
sono gli autogol) e restano presi dalle righe.

Includere la gara da prevedere nella media del giocatore gonfierebbe ogni numero prodotto
qui, e il numero non varrebbe niente. Per la stessa ragione la media dell'arbitro si
calcola sulle sole gare che ha gia' diretto, e non si chiede alla fonte: e' un aggregato
che sappiamo fare noi.

I gruppi si tagliano per quantili sul valore osservato, non su soglie scelte a mano: una
soglia decisa a tavolino deciderebbe il risultato prima di misurarlo. Quando il valore ha
troppi pari merito per essere diviso — molti giocatori hanno zero gialli — i gruppi
prodotti sono meno di quelli chiesti, e lo si dichiara invece di fingere.

Nessuna richiesta di rete. Sola lettura.

Uso:
    .venv/Scripts/python.exe scripts/projection/dataset/build_player_base.py
    .venv/Scripts/python.exe scripts/projection/dataset/build_player_base.py --lega 4
"""

import argparse
import json
import math
import os
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
GIOCATORI_DIR = os.path.join(ROOT, "scripts", "projection", "harvest", "data", "player-stats")
GARE_DIR = os.path.join(ROOT, "scripts", "projection", "harvest", "data", "match-detail")
EPISODI_DIR = os.path.join(ROOT, "scripts", "projection", "harvest", "data", "incidents")
OUT_DIR = os.path.join(os.path.dirname(__file__), "output")

MIN_MINUTI = 90        # sotto novanta minuti alle spalle un per-novanta non e' un tasso
MIN_GARE_ARBITRO = 5   # sotto cinque gare dirette la media dell'arbitro e' rumore
GRUPPI = 5             # in quanti gruppi si divide ogni fattore
MIN_CASI_FATTORE = 200 # sotto questo il fattore non si divide affatto

# fattore -> (chiave del caso, bersaglio a cui serve)
FATTORI = (
    ("falli_per90", "giallo"),
    ("gialli_per90", "giallo"),
    ("contrasti_per90", "giallo"),
    ("arbitro_gialli_per_gara", "giallo"),
    ("xg_per90", "gol"),
    ("tiri_per90", "gol"),
    ("tiri_in_porta_per90", "gol"),
    ("gol_per90", "gol"),
)


def wilson(successi, prove, z=1.96):
    """Intervallo di Wilson al 95%. Regge a 0/n e n/n, dove il normale collassa a zero."""
    if prove == 0:
        return (0.0, 1.0)
    p = successi / prove
    d = 1 + z * z / prove
    centro = (p + z * z / (2 * prove)) / d
    raggio = z * math.sqrt(p * (1 - p) / prove + z * z / (4 * prove * prove)) / d
    return (max(0.0, centro - raggio), min(1.0, centro + raggio))


def tagli_quantili(valori, quanti):
    ordinati = sorted(valori)
    return [ordinati[(i * len(ordinati)) // quanti] for i in range(1, quanti)]


def indice_gruppo(x, tagli):
    g = 0
    while g < len(tagli) and x >= tagli[g]:
        g += 1
    return g


def _autoverifica():
    """Se questa fallisce, ogni numero stampato sotto e' sbagliato."""
    basso, alto = wilson(20, 20)
    assert abs(basso - 0.8389) < 0.001, f"Wilson 20/20 estremo basso {basso}"
    assert alto == 1.0
    basso, alto = wilson(0, 20)
    assert basso == 0.0 and abs(alto - 0.1611) < 0.001, f"Wilson 0/20 estremo alto {alto}"
    tagli = tagli_quantili(list(range(1, 11)), 5)
    assert len(tagli) == 4
    assert indice_gruppo(1, tagli) == 0
    assert indice_gruppo(10, tagli) == 4
    assert 0 < indice_gruppo(5, tagli) < 4
    # con tutti pari merito i gruppi collassano: il codice deve accorgersene, non nasconderlo
    tagli_pari = tagli_quantili([0] * 10, 5)
    assert len({indice_gruppo(0, tagli_pari)}) == 1


def leggi_json(percorso):
    with open(percorso, "r", encoding="utf-8") as handle:
        return json.load(handle)


def casi_di_lega(lega):
    """Un caso per giocatore-gara, con i fattori calcolati sulle sole gare precedenti."""
    dir_gare = os.path.join(GARE_DIR, lega)
    dir_stat = os.path.join(GIOCATORI_DIR, lega)
    if not os.path.isdir(dir_gare):
        return [], {}

    dir_episodi = os.path.join(EPISODI_DIR, lega)
    gare = []
    senza_episodi = 0
    for nome in os.listdir(dir_stat):
        if not nome.endswith(".json"):
            continue
        percorso_gara = os.path.join(dir_gare, nome)
        if not os.path.exists(percorso_gara):
            continue
        # Senza episodi non c'e' etichetta del giallo: la gara si scarta e si dichiara.
        if not os.path.exists(os.path.join(dir_episodi, nome)):
            senza_episodi += 1
            continue
        dettaglio = leggi_json(percorso_gara)
        quando = dettaglio.get("event_date") or ""
        if not quando:
            continue
        gare.append((quando, nome, dettaglio))
    gare.sort()

    storia = defaultdict(lambda: {
        "minuti": 0.0, "falli": 0.0, "gialli": 0.0, "contrasti": 0.0,
        "tiri": 0.0, "in_porta": 0.0, "xg": 0.0, "gol": 0.0,
    })
    arbitri = defaultdict(lambda: {"gare": 0, "gialli": 0})
    casi = []
    saltate_senza_statistiche = 0
    gare_usate = 0
    # contatori in lista per essere aggiornati dentro il ciclo senza dichiararli globali
    righe_totali, righe_con_falli = [0], [0]
    gialli_totali, tardivi, minuti_noti = [0], [0], [0]

    for quando, nome, dettaglio in gare:
        stagione = dettaglio.get("season_id")
        arbitro = dettaglio.get("referee_id")
        derby = bool(dettaglio.get("is_local_derby"))
        payload = leggi_json(os.path.join(dir_stat, nome))
        righe = [r for r in (payload.get("player_stats") or []) if (r.get("minutes_played") or 0) > 0]
        if not righe:
            saltate_senza_statistiche += 1
            continue
        gare_usate += 1

        # L'etichetta del giallo viene dagli episodi. `yellowRed` e' il secondo giallo:
        # e' un'ammonizione, e contarlo fra i rossi perderebbe proprio i piu' fallosi.
        episodi = leggi_json(os.path.join(dir_episodi, nome)).get("incidents") or []
        ammoniti = set()
        minuti_giallo = []
        for e in episodi:
            if e.get("type") != "card" or e.get("card_type") not in ("yellow", "yellowRed"):
                continue
            if e.get("player_id") is not None:
                ammoniti.add(e["player_id"])
            if e.get("minute") is not None:
                minuti_giallo.append(e["minute"])

        chiave_arbitro = (stagione, arbitro)
        passato_arbitro = arbitri[chiave_arbitro] if arbitro is not None else None
        media_arbitro = None
        if passato_arbitro and passato_arbitro["gare"] >= MIN_GARE_ARBITRO:
            media_arbitro = passato_arbitro["gialli"] / passato_arbitro["gare"]

        for r in righe:
            chiave = (stagione, r.get("player_id"))
            p = storia.get(chiave)
            # Il caso si registra PRIMA di aggiornare la storia.
            if p is not None and p["minuti"] >= MIN_MINUTI:
                m = p["minuti"]
                casi.append({
                    "giallo": 1 if r.get("player_id") in ammoniti else 0,
                    "gol": 1 if (r.get("goals") or 0) > 0 else 0,
                    "falli_per90": 90 * p["falli"] / m,
                    "gialli_per90": 90 * p["gialli"] / m,
                    "contrasti_per90": 90 * p["contrasti"] / m,
                    "xg_per90": 90 * p["xg"] / m,
                    "tiri_per90": 90 * p["tiri"] / m,
                    "tiri_in_porta_per90": 90 * p["in_porta"] / m,
                    "gol_per90": 90 * p["gol"] / m,
                    "arbitro_gialli_per_gara": media_arbitro,
                    "derby": derby,
                })
            s = storia[chiave]
            s["minuti"] += r.get("minutes_played") or 0
            s["falli"] += r.get("fouls") or 0
            s["gialli"] += 1 if r.get("player_id") in ammoniti else 0
            s["contrasti"] += r.get("total_tackle") or 0
            s["tiri"] += r.get("total_shots") or 0
            s["in_porta"] += r.get("shots_on_target") or 0
            # xG e' nullo esattamente quando i tiri sono zero: li' vale zero, mai mancante.
            s["xg"] += r.get("expected_goals") or 0
            s["gol"] += r.get("goals") or 0
            righe_totali[0] += 1
            if (r.get("fouls") or 0) > 0:
                righe_con_falli[0] += 1
        gialli_gara = len(ammoniti)
        gialli_totali[0] += gialli_gara
        tardivi[0] += sum(1 for m in minuti_giallo if m > 60)
        minuti_noti[0] += len(minuti_giallo)

        if arbitro is not None:
            arbitri[chiave_arbitro]["gare"] += 1
            arbitri[chiave_arbitro]["gialli"] += gialli_gara

    # Un campo presente e sempre a zero non e' un campo coperto: e' un buco che sembra un
    # dato. Misurato: nella lega 82 `fouls` e' zero su tutte le righe.
    quota_falli = righe_con_falli[0] / max(1, righe_totali[0])
    return casi, {
        "gare_con_statistiche": gare_usate,
        "gare_senza_statistiche": saltate_senza_statistiche,
        "gare_senza_episodi": senza_episodi,
        "gare_in_archivio": len(gare),
        "gialli_dagli_episodi": gialli_totali[0],
        "gialli_per_gara": round(gialli_totali[0] / max(1, gare_usate), 3),
        "quota_righe_con_falli": round(quota_falli, 4),
        "falli_utilizzabili": quota_falli > 0.05,
        "quota_gialli_dopo_il_60": round(tardivi[0] / max(1, minuti_noti[0]), 4),
    }


def tabella(casi, fattore, bersaglio):
    validi = [c for c in casi if c.get(fattore) is not None]
    if len(validi) < MIN_CASI_FATTORE:
        return {"casi": len(validi), "sufficiente": False}
    tagli = tagli_quantili([c[fattore] for c in validi], GRUPPI)
    secchi = [{"n": 0, "colpi": 0, "somma": 0.0} for _ in range(GRUPPI)]
    for c in validi:
        s = secchi[indice_gruppo(c[fattore], tagli)]
        s["n"] += 1
        s["colpi"] += c[bersaglio]
        s["somma"] += c[fattore]
    pieni = [i for i, s in enumerate(secchi) if s["n"] > 0]
    gruppi = []
    for i in pieni:
        s = secchi[i]
        basso, alto = wilson(s["colpi"], s["n"])
        gruppi.append({
            "gruppo": i + 1,
            "valore_medio": round(s["somma"] / s["n"], 4),
            "casi": s["n"],
            "quota_campione": round(s["n"] / len(validi), 4),
            "colpi": s["colpi"],
            "frequenza": round(s["colpi"] / s["n"], 5),
            "ic95": [round(basso, 5), round(alto, 5)],
        })
    return {
        "casi": len(validi),
        "sufficiente": True,
        "tagli": [round(t, 5) for t in tagli],
        "gruppi_richiesti": GRUPPI,
        "gruppi_ottenuti": len(pieni),
        "pari_merito": len(pieni) < GRUPPI,
        "gruppi": gruppi,
    }


def main():
    _autoverifica()
    parser = argparse.ArgumentParser()
    parser.add_argument("--lega", help="una sola lega, per identificativo della fonte")
    argomenti = parser.parse_args()

    leghe = [argomenti.lega] if argomenti.lega else sorted(os.listdir(GIOCATORI_DIR))
    risultato = {}
    for lega in leghe:
        if not os.path.isdir(os.path.join(GIOCATORI_DIR, lega)):
            continue
        casi, conta = casi_di_lega(lega)
        if not casi:
            risultato[lega] = {"casi": 0, **conta}
            print(f"lega {lega}: nessun caso utile")
            continue
        voce = {**conta, "casi": len(casi)}
        for bersaglio in ("giallo", "gol"):
            colpi = sum(c[bersaglio] for c in casi)
            basso, alto = wilson(colpi, len(casi))
            voce[bersaglio] = {
                "base": round(colpi / len(casi), 5),
                "ic95": [round(basso, 5), round(alto, 5)],
                "colpi": colpi,
                "fattori": {f: tabella(casi, f, bersaglio) for f, b in FATTORI if b == bersaglio},
            }
        derby = [c for c in casi if c["derby"]]
        if derby:
            for bersaglio in ("giallo", "gol"):
                colpi = sum(c[bersaglio] for c in derby)
                b, a = wilson(colpi, len(derby))
                voce[bersaglio]["derby"] = {
                    "casi": len(derby), "colpi": colpi,
                    "frequenza": round(colpi / len(derby), 5), "ic95": [round(b, 5), round(a, 5)],
                }
        risultato[lega] = voce
        print(
            f"lega {lega}: {conta['gare_con_statistiche']} gare, {len(casi)} casi · "
            f"giallo {100 * voce['giallo']['base']:.1f}% · gol {100 * voce['gol']['base']:.1f}%"
        )

    os.makedirs(OUT_DIR, exist_ok=True)
    destinazione = os.path.join(OUT_DIR, "giocatori-base.json")
    with open(destinazione, "w", encoding="utf-8") as handle:
        json.dump({
            "generato_da": "scripts/projection/dataset/build_player_base.py",
            "sorgente": "harvest/data/player-stats + harvest/data/match-detail",
            "min_minuti_alle_spalle": MIN_MINUTI,
            "min_gare_arbitro": MIN_GARE_ARBITRO,
            "gruppi": GRUPPI,
            "nota": (
                "frequenze osservate, non probabilita': ogni fattore e' calcolato sulle sole "
                "gare precedenti del giocatore dentro la stessa stagione, e la media "
                "dell'arbitro sulle sole gare che aveva gia' diretto"
            ),
            "leghe": risultato,
        }, handle, ensure_ascii=False, indent=1)
    print(f"\nscritto {destinazione}")


if __name__ == "__main__":
    main()
