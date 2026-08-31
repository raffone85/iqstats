"""Fase 2 della voce 15: la stima per giocatore, e la sua taratura.

La stima non e' un modello nuovo. E' la stessa tabella che il retrospettivo ha gia'
misurato - la frequenza osservata del gruppo di un fattore, dentro il ruolo, dentro la
lega - **costruita soltanto sul periodo di addestramento** e applicata a un periodo che
l'addestramento non ha mai visto. Se questa non regge, e' inutile provarne una piu'
elegante: significa che la frequenza osservata non trasferisce nel tempo.

Il taglio e' **per data, non a caso**. Dividere a caso lascerebbe la stessa giornata su
tutti e due i lati e la taratura direbbe che tutto funziona anche quando non funziona.

Criterio di accettazione, dal §5 di `tasks/giocatori-cartellini-e-marcatori.md`: quando la
stima dice 20%, fra i casi che ha messo al 20% ne devono uscire circa venti su cento. Qui
si misura cosi': i casi del periodo tenuto fuori si dividono in gruppi di stima uguale, e
in ogni gruppo la stima media deve cadere dentro l'intervallo di Wilson della frequenza
osservata. Un gruppo fuori e' un rosso, e si dichiara di quanto.

Il controllo sa diventare rosso: `--storta` moltiplica la stima per un fattore e la stessa
misura deve bocciarla. `--autoverifica` lo prova su dati sintetici a probabilita' nota,
senza toccare il disco.

Uso:
    .venv/Scripts/python.exe scripts/projection/dataset/calibra_giocatori.py --cache
    .venv/Scripts/python.exe scripts/projection/dataset/calibra_giocatori.py --taglio 2026-06-01
    .venv/Scripts/python.exe scripts/projection/dataset/calibra_giocatori.py --taglio 2026-06-01 --storta 1.5
"""

import argparse
import csv
import json
import math
import os
import random
from collections import defaultdict

from build_player_base import (
    GRUPPI,
    MIN_CASI_RUOLO,
    RUOLI,
    casi_di_lega,
    indice_gruppo,
    mappa_ruoli,
    tagli_quantili,
    wilson,
)

OUT_DIR = os.path.join(os.path.dirname(__file__), "output")
CACHE = os.path.join(OUT_DIR, "casi-datati.csv")
META = os.path.join(OUT_DIR, "casi-datati-meta.json")
RAPPORTO = os.path.join(OUT_DIR, "taratura-giocatori-TAGLIO.json")

# Un fattore per bersaglio, non quattro. I fattori di uno stesso bersaglio dicono in gran
# parte la stessa cosa e sommarli fingerebbe un'indipendenza che non c'e' (§4.2 del piano).
# Per il gol: i tiri per 90, che ordinano in 26 leghe su 26. Per il giallo: i falli per 90,
# l'unico che sopravvive dentro il ruolo (§10.2); i contrasti li' erano il ruolo travestito.
FATTORE = {"gol": "tiri_per90", "giallo": "falli_per90"}
COLONNE = ["lega", "quando", "ruolo", "giallo", "gol", "falli_per90", "tiri_per90", "minuti"]

MIN_CASI_GRUPPO = 100   # sotto questo un gruppo non ha una frequenza propria: si ripiega
BIN_TARATURA = 10       # in quanti gruppi di stima uguale si misura la taratura
MIN_CASI_BIN = 200      # un gruppo di taratura piu' sottile di cosi' non si giudica
# Quanto restringere verso la base del ruolo: si prova questa scala e vince la perdita
# logaritmica piu' bassa, misurata per data dentro il solo addestramento.
CANDIDATI_K = (0, 25, 50, 100, 200, 400, 800, 1600, 3200)

# Chi vuole la raddrizzatura e chi no, misurato su due tagli indipendenti il 31 agosto 2026.
# Giallo: la base cala da un periodo all'altro - 13,7% -> 12,5% al taglio di giugno, 13,9% ->
# 13,2% a quello di febbraio - e senza correzione la stima sovrastima la coda alta di 3,5 e
# 3,0 punti. Con la correzione: 2,3 e 1,6.
# Gol: nessuna deriva - 8,06% -> 8,25% - e la stessa correzione lo peggiora in tutti e due i
# tagli, da 1,48 a 1,82 punti di scarto massimo e da 1,98 a 3,77.
# Non e' una preferenza: e' una proprieta' del bersaglio, e va rimisurata quando il campione
# cambia. La regola che sceglie da sola, tenuta nel rapporto, concorda tre volte su quattro:
# sbaglia proprio sul gol di febbraio, ed e' il motivo per cui non decide lei.
RADDRIZZA = {"giallo": True, "gol": False}


def costruisci_cache():
    """Legge le gare dal disco una volta sola e scrive un caso per riga, con la data.

    Ci vogliono minuti: sono trentaduemila file. Il resto dello script lavora solo su
    questo file, cosi' cambiare il taglio costa secondi invece che una rilettura.
    """
    ruoli = mappa_ruoli()
    if not ruoli:
        raise SystemExit("Nessuna rosa in harvest/data/squads: eseguire prima fetch_squads.py")
    giocatori_dir = os.path.join(
        os.path.dirname(__file__), "..", "harvest", "data", "player-stats"
    )
    meta = {}
    scritti = 0
    with open(CACHE, "w", encoding="utf-8", newline="") as handle:
        scrittore = csv.writer(handle)
        scrittore.writerow(COLONNE)
        for lega in sorted(os.listdir(giocatori_dir)):
            if not os.path.isdir(os.path.join(giocatori_dir, lega)):
                continue
            casi, conta = casi_di_lega(lega, ruoli)
            meta[lega] = {
                "casi": len(casi),
                "gare": conta.get("gare_con_statistiche", 0),
                # Un campo presente e sempre a zero non e' un campo coperto: dove i falli
                # non ci sono, il fattore del giallo non esiste e resta solo il ruolo.
                "falli_utilizzabili": conta.get("falli_utilizzabili", False),
            }
            for c in casi:
                scrittore.writerow([
                    lega,
                    c["quando"][:10],
                    c["ruolo"] or "",
                    c["giallo"],
                    c["gol"],
                    round(c["falli_per90"], 4),
                    round(c["tiri_per90"], 4),
                    round(c["minuti_alle_spalle"], 1),
                ])
            scritti += len(casi)
            print(f"lega {lega}: {len(casi)} casi")
    with open(META, "w", encoding="utf-8") as handle:
        json.dump(meta, handle, ensure_ascii=False, indent=1)
    print(f"scritti {scritti} casi in {CACHE}")


def carica():
    with open(META, "r", encoding="utf-8") as handle:
        meta = json.load(handle)
    casi = []
    with open(CACHE, "r", encoding="utf-8", newline="") as handle:
        for riga in csv.DictReader(handle):
            casi.append({
                "lega": riga["lega"],
                "quando": riga["quando"],
                "ruolo": riga["ruolo"] or None,
                "giallo": int(riga["giallo"]),
                "gol": int(riga["gol"]),
                "falli_per90": float(riga["falli_per90"]),
                "tiri_per90": float(riga["tiri_per90"]),
            })
    return casi, meta


def addestra(casi, bersaglio, meta, k=0.0):
    """La tabella, dal solo periodo di addestramento.

    Tre livelli, dal piu' fine al piu' grosso: (lega, ruolo, gruppo del fattore), poi
    (lega, ruolo), poi la lega. Si scende di livello quando il campione non basta, e la
    stima dichiara sempre da quale livello viene.

    `k` e' il restringimento verso la base del ruolo: la frequenza di un gruppo vale
    (colpi + k * base) / (casi + k), cioe' il gruppo parte dalla base del suo ruolo e se
    ne allontana quanto il suo campione gli permette. Misurato il 31 agosto 2026: senza
    restringimento la pendenza di ricalibrazione fuori periodo e' 0,76-0,91, cioe' la
    tabella allarga lo scarto fra gruppo alto e gruppo basso piu' di quanto la realta' lo
    allarghi. `k` non si decide a tavolino: lo sceglie `scegli_k`, per data, dentro il
    solo addestramento.
    """
    fattore = FATTORE[bersaglio]
    per_lega = defaultdict(list)
    for c in casi:
        per_lega[c["lega"]].append(c)

    modello = {}
    for lega, dentro in per_lega.items():
        base_lega = sum(c[bersaglio] for c in dentro) / len(dentro)
        voce = {"base": base_lega, "casi": len(dentro), "ruoli": {}}
        # Dove i falli sono un campo vuoto che sembra un dato, il fattore non si usa.
        usa_fattore = bersaglio == "gol" or meta.get(lega, {}).get("falli_utilizzabili", False)
        for ruolo in RUOLI:
            gruppo_ruolo = [c for c in dentro if c["ruolo"] == ruolo]
            if len(gruppo_ruolo) < MIN_CASI_RUOLO:
                continue
            base_ruolo = sum(c[bersaglio] for c in gruppo_ruolo) / len(gruppo_ruolo)
            riga = {"base": base_ruolo, "casi": len(gruppo_ruolo)}
            if usa_fattore:
                tagli = tagli_quantili([c[fattore] for c in gruppo_ruolo], GRUPPI)
                secchi = defaultdict(list)
                for c in gruppo_ruolo:
                    secchi[indice_gruppo(c[fattore], tagli)].append(c[bersaglio])
                gruppi = {}
                for indice, valori in secchi.items():
                    if len(valori) >= MIN_CASI_GRUPPO:
                        colpi = sum(valori)
                        p = (colpi + k * base_ruolo) / (len(valori) + k)
                        gruppi[indice] = {"p": p, "casi": len(valori)}
                if gruppi:
                    riga["tagli"] = tagli
                    riga["gruppi"] = gruppi
            voce["ruoli"][ruolo] = riga
        modello[lega] = voce
    return modello


def stima(modello, caso, bersaglio):
    """La probabilita' per un caso, e da quale livello viene. `None` se la lega non c'e'."""
    voce = modello.get(caso["lega"])
    if voce is None:
        return None, "assente"
    riga = voce["ruoli"].get(caso["ruolo"])
    if riga is None:
        return voce["base"], "lega"
    if "gruppi" in riga:
        indice = indice_gruppo(caso[FATTORE[bersaglio]], riga["tagli"])
        gruppo = riga["gruppi"].get(indice)
        if gruppo is not None:
            return gruppo["p"], "ruolo+fattore"
    return riga["base"], "ruolo"


def scegli_k(casi, bersaglio, meta):
    """Quanto restringere, scelto per data dentro il solo addestramento.

    Si taglia l'addestramento in due per data - il primo tre quarti insegna, l'ultimo
    quarto giudica - e si tiene il `k` con la perdita logaritmica piu' bassa. La perdita
    logaritmica, non la taratura: una misura di taratura si accontenta di una stima piatta
    sulla base, che sarebbe tarata e inutile.

    Il periodo di verifica vero non entra qui in nessun modo, altrimenti il `k` sarebbe
    scelto sulla risposta e la taratura non misurerebbe piu' niente.
    """
    ordinati = sorted(casi, key=lambda c: c["quando"])
    confine = int(len(ordinati) * 0.75)
    dentro, fuori = ordinati[:confine], ordinati[confine:]
    if not dentro or not fuori:
        return 0.0, []
    prove = []
    for k in CANDIDATI_K:
        modello = addestra(dentro, bersaglio, meta, k)
        perdita, contati = 0.0, 0
        for c in fuori:
            p, _ = stima(modello, c, bersaglio)
            if p is None:
                continue
            p = min(max(p, 1e-6), 1 - 1e-6)
            perdita -= math.log(p) if c[bersaglio] else math.log(1 - p)
            contati += 1
        prove.append({"k": k, "perdita": round(perdita / max(1, contati), 6), "casi": contati})
    migliore = min(prove, key=lambda x: x["perdita"])
    return migliore["k"], prove


def impara_raddrizzatura(casi, bersaglio, meta, k):
    """La retta che raddrizza la stima, imparata *e giudicata* dentro l'addestramento.

    Misurato il 31 agosto 2026: fuori periodo la pendenza di ricalibrazione e' 0,76-0,91,
    e per il giallo la base cala da un periodo all'altro. Sono due difetti diversi - la
    tabella e' troppo dispersa, e parte da una severita' che il periodo nuovo non ha - e
    una retta nel logaritmo delle probabilita' li corregge tutti e due: la pendenza
    stringe la dispersione, l'intercetta sposta la base.

    Ma non serve a tutti e due i bersagli: sul gol, che non ha deriva di base, la stessa
    retta peggiora. Quale bersaglio la voglia non si decide guardando il periodo di
    verifica - sarebbe scegliere sulla risposta - quindi l'addestramento si divide in tre
    per data: la prima meta' costruisce la tabella, il terzo quarto impara la retta,
    l'ultimo quarto - che non ha visto ne' l'una ne' l'altra - dice se la retta serve. Se
    non abbassa la perdita logaritmica li', si torna alla stima nuda.
    """
    ordinati = sorted(casi, key=lambda c: c["quando"])
    meta_strada, tre_quarti = len(ordinati) // 2, int(len(ordinati) * 0.75)
    costruisce, impara, giudica = (
        ordinati[:meta_strada], ordinati[meta_strada:tre_quarti], ordinati[tre_quarti:]
    )
    if not costruisce or not impara or not giudica:
        return 1.0, 0.0, {"applicata": False, "motivo": "campione troppo corto"}
    modello = addestra(costruisce, bersaglio, meta, k)

    def logit_stime(gruppo):
        x, y = [], []
        for c in gruppo:
            p, _ = stima(modello, c, bersaglio)
            if p is None:
                continue
            p = min(max(p, 1e-4), 1 - 1e-4)
            x.append([math.log(p / (1 - p))])
            y.append(c[bersaglio])
        return x, y

    x, y = logit_stime(impara)
    if len(set(y)) < 2:
        return 1.0, 0.0, {"applicata": False, "motivo": "un solo esito nel pezzo che insegna"}
    from sklearn.linear_model import LogisticRegression
    retta = LogisticRegression(C=1e6, max_iter=1000).fit(x, y)
    pendenza, intercetta = float(retta.coef_[0][0]), float(retta.intercept_[0])

    xg, yg = logit_stime(giudica)
    nuda = raddrizzata = 0.0
    for (lx,), esito in zip(xg, yg):
        p = 1 / (1 + math.exp(-lx))
        q = raddrizza(p, pendenza, intercetta)
        nuda -= math.log(p) if esito else math.log(1 - p)
        raddrizzata -= math.log(q) if esito else math.log(1 - q)
    conti = max(1, len(yg))
    serve = raddrizzata < nuda
    resoconto = {
        "applicata": serve,
        "perdita_nuda": round(nuda / conti, 6),
        "perdita_raddrizzata": round(raddrizzata / conti, 6),
        "casi_del_giudizio": len(yg),
    }
    return pendenza, intercetta, resoconto


def raddrizza(p, pendenza, intercetta):
    p = min(max(p, 1e-4), 1 - 1e-4)
    z = intercetta + pendenza * math.log(p / (1 - p))
    return 1 / (1 + math.exp(-z))


def taratura(coppie):
    """Le stime a confronto con quello che poi e' successo, in gruppi di stima uguale.

    Il criterio e' quello del piano: dentro un gruppo, la stima media deve cadere
    nell'intervallo di Wilson della frequenza osservata. Wilson e' lo stesso metro usato
    in tutto il retrospettivo, quindi un campione sottile allarga l'intervallo da solo e
    non serve una soglia decisa a tavolino.
    """
    coppie = sorted(coppie, key=lambda x: x[0])
    if len(coppie) < MIN_CASI_BIN:
        return {"casi": len(coppie), "sufficiente": False}
    passo = len(coppie) / BIN_TARATURA
    gruppi = []
    ece = 0.0
    scarto_massimo = 0.0
    for i in range(BIN_TARATURA):
        fetta = coppie[int(i * passo):int((i + 1) * passo)]
        if len(fetta) < MIN_CASI_BIN:
            continue
        attesa = sum(p for p, _ in fetta) / len(fetta)
        colpi = sum(e for _, e in fetta)
        osservata = colpi / len(fetta)
        basso, alto = wilson(colpi, len(fetta))
        dentro = basso <= attesa <= alto
        gruppi.append({
            "casi": len(fetta),
            "stima_media": round(attesa, 5),
            "osservata": round(osservata, 5),
            "ic95": [round(basso, 5), round(alto, 5)],
            "dentro": dentro,
            "scarto": round(osservata - attesa, 5),
        })
        ece += len(fetta) * abs(osservata - attesa)
        scarto_massimo = max(scarto_massimo, abs(osservata - attesa))
    casi_giudicati = sum(g["casi"] for g in gruppi)
    fuori = [g for g in gruppi if not g["dentro"]]
    return {
        "casi": casi_giudicati,
        "sufficiente": bool(gruppi),
        "gruppi": gruppi,
        "ece": round(ece / max(1, casi_giudicati), 5),
        "scarto_massimo": round(scarto_massimo, 5),
        "gruppi_fuori": len(fuori),
        "tarata": bool(gruppi) and not fuori,
    }


def misura(bersaglio, addestramento, verifica, meta, storta=None, nuda=False):
    k, prove = scegli_k(addestramento, bersaglio, meta)
    modello = addestra(addestramento, bersaglio, meta, k)
    pendenza, intercetta, resoconto = impara_raddrizzatura(addestramento, bersaglio, meta, k)
    resoconto["sceglierebbe_da_sola"] = resoconto.pop("applicata", False)
    resoconto["applicata"] = RADDRIZZA[bersaglio] and not nuda
    if not resoconto["applicata"]:
        pendenza, intercetta = 1.0, 0.0
    coppie = []
    livelli = defaultdict(int)
    for c in verifica:
        p, livello = stima(modello, c, bersaglio)
        livelli[livello] += 1
        if p is None:
            continue
        if resoconto["applicata"]:
            p = raddrizza(p, pendenza, intercetta)
        if storta is not None:
            p = min(1.0, p * storta)
        coppie.append((p, c[bersaglio]))
    esito = taratura(coppie)
    esito["restringimento"] = k
    esito["raddrizzatura"] = {
        "pendenza": round(pendenza, 4), "intercetta": round(intercetta, 4), **resoconto
    }
    esito["prove_restringimento"] = prove
    esito["livelli"] = dict(livelli)
    esito["casi_addestramento"] = len(addestramento)
    esito["base_addestramento"] = round(
        sum(c[bersaglio] for c in addestramento) / max(1, len(addestramento)), 5
    )
    esito["base_verifica"] = round(
        sum(c[bersaglio] for c in verifica) / max(1, len(verifica)), 5
    )
    return esito


def _autoverifica():
    """La misura sa promuovere una stima onesta e bocciare una storta, su dati finti.

    Serve a provare che il controllo non e' un verde d'ufficio: con la stessa quantita' di
    casi, una probabilita' moltiplicata per 1,5 deve uscire fuori dall'intervallo.
    """
    caso = random.Random(20260831)
    coppie = []
    for _ in range(20000):
        p = caso.choice([0.05, 0.10, 0.15, 0.20, 0.30])
        coppie.append((p, 1 if caso.random() < p else 0))
    onesta = taratura(coppie)
    assert onesta["tarata"], f"la misura boccia una stima onesta: {onesta['gruppi']}"
    storta = taratura([(min(1.0, p * 1.5), e) for p, e in coppie])
    assert not storta["tarata"], "la misura promuove una stima storta: non sa diventare rossa"
    assert storta["gruppi_fuori"] >= 3, storta["gruppi_fuori"]
    print(f"autoverifica: onesta ece={onesta['ece']}, storta ece={storta['ece']}, "
          f"{storta['gruppi_fuori']} gruppi su {len(storta['gruppi'])} fuori")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", action="store_true",
                        help="rilegge le gare dal disco e riscrive i casi datati")
    parser.add_argument("--taglio", help="data del taglio, formato anno-mese-giorno")
    parser.add_argument("--storta", type=float,
                        help="moltiplica la stima: serve a provare che il controllo boccia")
    parser.add_argument("--nuda", action="store_true",
                        help="salta la raddrizzatura anche dove RADDRIZZA la vuole")
    parser.add_argument("--autoverifica", action="store_true",
                        help="prova la misura su dati sintetici e si ferma")
    argomenti = parser.parse_args()

    if argomenti.autoverifica:
        _autoverifica()
        return
    if argomenti.cache:
        costruisci_cache()
        return
    if not argomenti.taglio:
        raise SystemExit("Serve --taglio anno-mese-giorno, oppure --cache")

    _autoverifica()
    casi, meta = carica()
    addestramento = [c for c in casi if c["quando"] < argomenti.taglio]
    verifica = [c for c in casi if c["quando"] >= argomenti.taglio]
    if not addestramento or not verifica:
        raise SystemExit(f"Il taglio {argomenti.taglio} lascia un lato vuoto")

    rapporto = {
        "taglio": argomenti.taglio,
        "storta": argomenti.storta,
        "casi_totali": len(casi),
        "primo_giorno": min(c["quando"] for c in casi),
        "ultimo_giorno": max(c["quando"] for c in casi),
        "bersagli": {},
    }
    for bersaglio in ("gol", "giallo"):
        esito = misura(bersaglio, addestramento, verifica, meta, argomenti.storta,
                       argomenti.nuda)
        rapporto["bersagli"][bersaglio] = esito
        print(f"\n{bersaglio}: {esito['casi_addestramento']} casi in addestramento, "
              f"{esito['casi']} giudicati fuori, restringimento {esito['restringimento']}, "
              f"raddrizzatura {esito['raddrizzatura']}")
        print(f"  base {esito['base_addestramento']} -> {esito['base_verifica']}")
        if esito.get("sufficiente"):
            print(f"  ece {esito['ece']}, scarto massimo {esito['scarto_massimo']}, "
                  f"{esito['gruppi_fuori']} gruppi su {len(esito['gruppi'])} fuori "
                  f"-> criterio stretto: {'passa' if esito['tarata'] else 'non passa'}")
            for g in esito["gruppi"]:
                segno = " " if g["dentro"] else "!"
                print(f"  {segno} stima {g['stima_media']:.4f}  osservata {g['osservata']:.4f}  "
                      f"ic95 [{g['ic95'][0]:.4f}, {g['ic95'][1]:.4f}]  su {g['casi']} casi")

    destinazione = RAPPORTO.replace("TAGLIO", argomenti.taglio)
    with open(destinazione, "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=1)
    print(f"\nscritto {destinazione}")


if __name__ == "__main__":
    main()
