"""Ricognizione dei due blocchi raccolti per ultimi: dettaglio gara e statistiche
per giocatore.

Legge i payload gia' su disco in scripts/projection/harvest/data/match-detail/ e
.../player-stats/ e misura che cosa la fonte restituisce davvero: campi presenti,
copertura, tipi, distribuzione, e quanto storico ha ciascun arbitro e ciascun
allenatore. Serve a decidere quali feature pre-partita sono costruibili, prima di
scrivere il costruttore.

Nessuna richiesta di rete. Sola lettura.

Uso:
    .venv/Scripts/python.exe scripts/projection/discovery/scan_prematch.py
    .venv/Scripts/python.exe scripts/projection/discovery/scan_prematch.py --limit 300
    .venv/Scripts/python.exe scripts/projection/discovery/scan_prematch.py --solo dettaglio
"""

import argparse
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scan_archive import Campo, tipo_di  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DETTAGLIO_DIR = os.path.join(ROOT, "scripts", "projection", "harvest", "data", "match-detail")
GIOCATORI_DIR = os.path.join(ROOT, "scripts", "projection", "harvest", "data", "player-stats")
OUT = os.path.join(os.path.dirname(__file__), "output", "inventario-prematch.json")

# Blocchi annidati del dettaglio gara che si espandono di un livello. Le liste di
# gare recenti e i momenti salienti non sono campi: sono elenchi, e si contano a parte.
BLOCCHI_ANNIDATI = ("weather", "head_to_head")
NON_ESPANDERE = ("recent_matches", "highlights")


def elenca_file(base, limite=None):
    """Percorre le cartelle numeriche e restituisce i percorsi dei payload."""
    percorsi = []
    if not os.path.isdir(base):
        return percorsi
    for cartella in sorted(os.listdir(base), key=lambda nome: (len(nome), nome)):
        dentro = os.path.join(base, cartella)
        if not os.path.isdir(dentro):
            continue
        for nome in sorted(os.listdir(dentro), key=lambda nome: (len(nome), nome)):
            if nome.endswith(".json"):
                percorsi.append(os.path.join(dentro, nome))
                if limite and len(percorsi) >= limite:
                    return percorsi
    return percorsi


def leggi(percorso):
    with open(percorso, "r", encoding="utf-8") as handle:
        return json.load(handle)


def scansiona_dettaglio(limite=None):
    campi = defaultdict(Campo)
    gare = 0
    leghe = set()
    stagioni = set()
    arbitri = Counter()
    allenatori = Counter()
    stadi = Counter()
    gare_senza_arbitro = 0
    lunghezza_precedenti = Campo()
    stati = Counter()
    coperti_per_lega = defaultdict(lambda: defaultdict(int))
    gare_per_lega = Counter()

    for percorso in elenca_file(DETTAGLIO_DIR, limite):
        try:
            payload = leggi(percorso)
        except (ValueError, OSError):
            continue
        if not isinstance(payload, dict):
            continue
        gare += 1
        lega = payload.get("league_id")
        leghe.add(lega)
        stagioni.add(payload.get("season_id"))
        stati[payload.get("status")] += 1
        gare_per_lega[lega] += 1

        for chiave, valore in payload.items():
            if chiave in NON_ESPANDERE:
                continue
            if chiave in BLOCCHI_ANNIDATI and isinstance(valore, dict):
                for dentro_chiave, dentro_valore in valore.items():
                    if dentro_chiave in NON_ESPANDERE:
                        continue
                    percorso_campo = chiave + "." + dentro_chiave
                    campi[percorso_campo].aggiungi(dentro_valore, lega)
                    if dentro_valore is not None:
                        coperti_per_lega[percorso_campo][lega] += 1
                continue
            campi[chiave].aggiungi(valore, lega)
            if valore is not None:
                coperti_per_lega[chiave][lega] += 1

        precedenti = (payload.get("head_to_head") or {}).get("recent_matches")
        lunghezza_precedenti.aggiungi(len(precedenti) if isinstance(precedenti, list) else None, lega)

        arbitro = payload.get("referee_id")
        if arbitro is None:
            gare_senza_arbitro += 1
        else:
            arbitri[arbitro] += 1
        for lato in ("home_coach_id", "away_coach_id"):
            valore = payload.get(lato)
            if valore is not None:
                allenatori[valore] += 1
        stadio = payload.get("venue_id")
        if stadio is not None:
            stadi[stadio] += 1

    riassunto_campi = {}
    for nome in sorted(campi):
        voce = campi[nome].riassunto(gare)
        leghe_piene = coperti_per_lega.get(nome, {})
        voce["leghe_con_almeno_un_valore"] = len(leghe_piene)
        voce["leghe_totali"] = len(gare_per_lega)
        riassunto_campi[nome] = voce

    return {
        "gare_lette": gare,
        "leghe": len([lega for lega in leghe if lega is not None]),
        "stagioni": len([stagione for stagione in stagioni if stagione is not None]),
        "stati": dict(stati.most_common()),
        "campi": riassunto_campi,
        "precedenti_per_gara": lunghezza_precedenti.riassunto(gare),
        "arbitri": profilo_conteggi(arbitri, gare_senza_arbitro),
        "allenatori": profilo_conteggi(allenatori, 0),
        "stadi": profilo_conteggi(stadi, 0),
    }


def profilo_conteggi(conteggi, senza):
    """Quanto storico ha ciascuna entita': serve a sapere se una media e' stimabile."""
    valori = sorted(conteggi.values(), reverse=True)
    totale = sum(valori)
    return {
        "distinti": len(valori),
        "assegnazioni": totale,
        "gare_senza": senza,
        "con_almeno_5": len([v for v in valori if v >= 5]),
        "con_almeno_10": len([v for v in valori if v >= 10]),
        "con_almeno_20": len([v for v in valori if v >= 20]),
        "mediana": valori[len(valori) // 2] if valori else None,
        "massimo": valori[0] if valori else None,
        "quota_assegnazioni_da_entita_con_almeno_10": (
            round(sum(v for v in valori if v >= 10) / totale, 6) if totale else None
        ),
    }


def scansiona_giocatori(limite=None):
    campi = defaultdict(Campo)
    gare = 0
    gare_vuote = 0
    righe = 0
    righe_per_gara = Campo()
    minuti = Campo()
    giocatori = set()
    righe_per_squadra = Campo()
    squadre_per_gara = Campo()
    con_minuti_zero = 0

    for percorso in elenca_file(GIOCATORI_DIR, limite):
        try:
            payload = leggi(percorso)
        except (ValueError, OSError):
            continue
        if not isinstance(payload, dict):
            continue
        gare += 1
        elenco = payload.get("player_stats") or []
        if not elenco:
            gare_vuote += 1
        righe += len(elenco)
        righe_per_gara.aggiungi(len(elenco), None)

        per_squadra = Counter()
        for riga in elenco:
            if not isinstance(riga, dict):
                continue
            for chiave, valore in riga.items():
                campi[chiave].aggiungi(valore, None)
            if riga.get("player_id") is not None:
                giocatori.add(riga.get("player_id"))
            per_squadra[riga.get("team_id")] += 1
            valore_minuti = riga.get("minutes_played")
            minuti.aggiungi(valore_minuti, None)
            if valore_minuti == 0:
                con_minuti_zero += 1
        squadre_per_gara.aggiungi(len(per_squadra), None)
        for conteggio in per_squadra.values():
            righe_per_squadra.aggiungi(conteggio, None)

    return {
        "gare_lette": gare,
        "gare_senza_righe": gare_vuote,
        "righe": righe,
        "giocatori_distinti": len(giocatori),
        "righe_con_minuti_zero": con_minuti_zero,
        "righe_per_gara": righe_per_gara.riassunto(gare),
        "righe_per_squadra_gara": righe_per_squadra.riassunto(max(righe_per_squadra.osservazioni, 1)),
        "squadre_per_gara": squadre_per_gara.riassunto(gare),
        "minuti": minuti.riassunto(max(righe, 1)),
        "campi": {nome: campi[nome].riassunto(max(righe, 1)) for nome in sorted(campi)},
    }


def stampa_campi(titolo, campi, soglia=0.0):
    print("")
    print(titolo)
    for nome in sorted(campi, key=lambda chiave: -(campi[chiave].get("tasso_presenza") or 0)):
        voce = campi[nome]
        tasso = voce.get("tasso_presenza")
        if tasso is None or tasso < soglia:
            continue
        riga = "  " + nome.ljust(30) + str(round(tasso * 100, 1)).rjust(6) + "%"
        numerico = voce.get("numerico")
        if numerico:
            riga += "   media " + str(numerico["media"]) + "   min " + str(numerico["min"]) + "   max " + str(numerico["max"])
        elif voce.get("esempi"):
            riga += "   es. " + ", ".join(str(esempio) for esempio in voce["esempi"])
        print(riga)


def main():
    parser = argparse.ArgumentParser(description="Ricognizione di dettaglio gara e statistiche per giocatore")
    parser.add_argument("--limit", type=int, default=None, help="numero massimo di file per blocco")
    parser.add_argument("--solo", choices=("dettaglio", "giocatori", "entrambi"), default="entrambi")
    args = parser.parse_args()

    risultato = {
        "generato_da": "scripts/projection/discovery/scan_prematch.py",
        "sorgente": "payload gia' su disco, nessuna richiesta di rete",
        "limite": args.limit,
    }

    if args.solo in ("dettaglio", "entrambi"):
        risultato["dettaglio_gara"] = scansiona_dettaglio(args.limit)
    if args.solo in ("giocatori", "entrambi"):
        risultato["statistiche_giocatore"] = scansiona_giocatori(args.limit)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(risultato, handle, ensure_ascii=False, indent=2)

    dettaglio = risultato.get("dettaglio_gara")
    if dettaglio:
        print("dettaglio gara: " + str(dettaglio["gare_lette"]) + " gare, "
              + str(dettaglio["leghe"]) + " leghe, " + str(dettaglio["stagioni"]) + " stagioni")
        stampa_campi("campi del dettaglio gara (copertura sul totale delle gare lette):", dettaglio["campi"])
        for nome in ("arbitri", "allenatori", "stadi"):
            profilo = dettaglio[nome]
            print("")
            print(nome + ": " + str(profilo["distinti"]) + " distinti, "
                  + str(profilo["assegnazioni"]) + " assegnazioni, "
                  + "mediana " + str(profilo["mediana"]) + " gare, "
                  + str(profilo["con_almeno_10"]) + " con almeno 10 gare, "
                  + "quota da chi ne ha almeno 10: " + str(profilo["quota_assegnazioni_da_entita_con_almeno_10"]))
            if profilo["gare_senza"]:
                print("  gare senza: " + str(profilo["gare_senza"]))

    giocatori = risultato.get("statistiche_giocatore")
    if giocatori:
        print("")
        print("statistiche per giocatore: " + str(giocatori["gare_lette"]) + " gare, "
              + str(giocatori["righe"]) + " righe, "
              + str(giocatori["giocatori_distinti"]) + " giocatori distinti, "
              + str(giocatori["gare_senza_righe"]) + " gare senza righe")
        print("  righe per gara: media " + str((giocatori["righe_per_gara"].get("numerico") or {}).get("media")))
        print("  minuti: media " + str((giocatori["minuti"].get("numerico") or {}).get("media"))
              + ", righe a zero minuti " + str(giocatori["righe_con_minuti_zero"]))
        stampa_campi("campi per giocatore-gara (copertura sulle righe):", giocatori["campi"])

    print("")
    print("scritto: " + OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
