"""Ricostruisce dagli episodi i quattro conteggi separati della disciplina.

Nel pannello statistico la disciplina arriva aggregata e, come misurato da
verify_cards.py, il conteggio dei gialli comprende gia' la seconda ammonizione, che il
conteggio dei rossi comprende a sua volta. Sommarli tornerebbe a contare due volte lo
stesso episodio.

Gli episodi permettono di separare le quattro nature, che restano distinte per sempre:

    yellow_cards        ammonizione semplice, panchina esclusa
    second_yellow_red   espulsione per seconda ammonizione
    red_cards_direct    espulsione diretta, panchina esclusa
    bench_cards         cartellino a panchina o staff, fuori dai conteggi di squadra

Una quinta colonna dichiara i cartellini che la fonte non attribuisce a nessun giocatore
(giocatore ignoto, minuto convenzionale): non entrano in nessuno dei quattro conteggi,
perche' il conteggio aggregato del pannello non li comprende, ma restano visibili invece
di sparire in silenzio.

La provenienza e' C: ricostruzione deterministica da un'altra risorsa. Una gara i cui
episodi non sono stati acquisiti, o la cui lista e' vuota, resta di classe E: nessun
conteggio diventa zero per assenza di dati.

Nessuna richiesta di rete. Sola lettura.

Uso:
    .venv/Scripts/python.exe scripts/projection/dataset/reconstruct_cards.py
"""

import argparse
import csv
import json
import math
import os
import sys
from collections import Counter, defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
EPISODI_DIR = os.path.join(ROOT, "scripts", "projection", "harvest", "data", "incidents")
CSV_PATH = os.path.join(ROOT, "scripts", "calibration", "data", "dataset.csv")
OUT_DIR = os.path.join(os.path.dirname(__file__), "output")

CONTEGGI = ["yellow_cards", "second_yellow_red", "red_cards_direct", "bench_cards"]
COLONNE = ["event_id", "league_id", "lato"] + CONTEGGI + ["unattributed_cards", "provenienza"]


def conteggi_vuoti():
    return {nome: 0 for nome in CONTEGGI + ["unattributed_cards"]}


def scomponi(payload):
    """Separa i cartellini di una gara nelle quattro nature, per lato.

    Restituisce None se la gara non ha episodi utilizzabili: in quel caso non si sa
    nulla, e non sapere non e' zero.
    """
    episodi = payload.get("incidents")
    if not episodi:
        return None, 0

    conteggi = {"home": conteggi_vuoti(), "away": conteggi_vuoti()}
    senza_lato = 0
    for episodio in episodi:
        if episodio.get("type") != "card":
            continue
        # Un cartellino annullato dopo revisione resta nella cronologia della fonte ma e'
        # escluso dai suoi conteggi. Nell'archivio raccolto il campo non compare mai —
        # 8.022 cartellini su 1.962 gare, zero occorrenze — quindi qui non cambia una
        # riga; serve perche' una raccolta nuova non conti cose diverse da quelle vecchie.
        if episodio.get("rescinded") is True:
            continue
        if episodio.get("is_home") is None:
            senza_lato += 1
            continue
        voce = conteggi["home" if episodio.get("is_home") else "away"]
        if episodio.get("is_manager"):
            voce["bench_cards"] += 1
        elif episodio.get("player_id") is None:
            voce["unattributed_cards"] += 1
        else:
            natura = episodio.get("card_type")
            if natura == "yellow":
                voce["yellow_cards"] += 1
            elif natura == "yellowRed":
                voce["second_yellow_red"] += 1
            elif natura == "red":
                voce["red_cards_direct"] += 1
    return conteggi, senza_lato


class Distribuzione:
    """Riassunto di un conteggio, nella stessa forma usata dal registro delle metriche."""

    def __init__(self):
        self.n = 0
        self.somma = 0.0
        self.somma_quadrati = 0.0
        self.zeri = 0
        self.minimo = None
        self.massimo = None

    def aggiungi(self, valore):
        self.n += 1
        self.somma += valore
        self.somma_quadrati += valore * valore
        if valore == 0:
            self.zeri += 1
        if self.minimo is None or valore < self.minimo:
            self.minimo = valore
        if self.massimo is None or valore > self.massimo:
            self.massimo = valore

    def riassunto(self):
        if not self.n:
            return None
        media = self.somma / self.n
        varianza = max(self.somma_quadrati / self.n - media * media, 0.0)
        sd = math.sqrt(varianza)
        return {
            "media": round(media, 6),
            "sd": round(sd, 6),
            "dispersione": round(varianza / media, 6) if media > 0 else None,
            "min": self.minimo,
            "max": self.massimo,
            "quota_zeri": round(self.zeri / self.n, 6),
            "osservazioni": self.n,
        }


def leghe_dell_archivio():
    """Le leghe attese, dal registro anagrafico gia' usato dagli altri script."""
    per_gara = {}
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as handle:
        for riga in csv.DictReader(handle):
            event_id = (riga.get("match_id") or "").strip()
            if event_id and event_id not in per_gara:
                per_gara[event_id] = (riga.get("league_id") or "").strip()
    return per_gara


def ricostruisci(limite=None):
    anagrafica = leghe_dell_archivio()

    percorsi = []
    if os.path.isdir(EPISODI_DIR):
        for lega in sorted(os.listdir(EPISODI_DIR), key=lambda nome: int(nome) if nome.isdigit() else 0):
            cartella = os.path.join(EPISODI_DIR, lega)
            if not os.path.isdir(cartella):
                continue
            for nome in sorted(os.listdir(cartella)):
                if nome.endswith(".json"):
                    percorsi.append((nome[:-5], lega, os.path.join(cartella, nome)))
    if limite:
        percorsi = percorsi[:limite]

    distribuzioni = {nome: Distribuzione() for nome in CONTEGGI + ["unattributed_cards"]}
    leghe = set()
    gare_utili = 0
    gare_senza_episodi = 0
    episodi_senza_lato = 0
    gare_con_non_attribuiti = 0
    non_attribuiti_totali = 0
    righe = 0

    os.makedirs(OUT_DIR, exist_ok=True)
    uscita = os.path.join(OUT_DIR, "cartellini.csv")
    with open(uscita, "w", encoding="utf-8", newline="") as handle:
        scrittore = csv.writer(handle)
        scrittore.writerow(COLONNE)

        for event_id, lega, percorso in percorsi:
            with open(percorso, "r", encoding="utf-8") as sorgente:
                payload = json.load(sorgente)
            conteggi, senza_lato = scomponi(payload)
            episodi_senza_lato += senza_lato
            league_id = anagrafica.get(event_id) or lega

            if conteggi is None:
                gare_senza_episodi += 1
                for lato in ("home", "away"):
                    scrittore.writerow(
                        [event_id, league_id, lato] + [""] * (len(CONTEGGI) + 1) + ["E"])
                    righe += 1
                continue

            gare_utili += 1
            leghe.add(league_id)
            non_attribuiti_gara = (
                conteggi["home"]["unattributed_cards"] + conteggi["away"]["unattributed_cards"])
            if non_attribuiti_gara:
                gare_con_non_attribuiti += 1
                non_attribuiti_totali += non_attribuiti_gara

            for lato in ("home", "away"):
                voce = conteggi[lato]
                for nome in distribuzioni:
                    distribuzioni[nome].aggiungi(voce[nome])
                scrittore.writerow(
                    [event_id, league_id, lato]
                    + [voce[nome] for nome in CONTEGGI]
                    + [voce["unattributed_cards"], "C"]
                )
                righe += 1

    rapporto = {
        "generato_da": "scripts/projection/dataset/reconstruct_cards.py",
        "sorgente": "/events/{id}/incidents/",
        "gare_con_episodi_acquisiti": len(percorsi),
        "gare_ricostruite": gare_utili,
        "gare_con_lista_episodi_vuota": gare_senza_episodi,
        "righe_squadra_gara": righe,
        "leghe_coperte": len(leghe),
        "episodi_senza_lato": episodi_senza_lato,
        "cartellini_non_attribuiti": {
            "totale": non_attribuiti_totali,
            "gare_interessate": gare_con_non_attribuiti,
            "trattamento": (
                "fuori dai quattro conteggi, perche' il conteggio aggregato del pannello "
                "non li comprende; dichiarati in colonna propria"
            ),
        },
        "distribuzioni": {nome: distribuzioni[nome].riassunto() for nome in distribuzioni},
        "provenienza": "C",
    }
    with open(os.path.join(OUT_DIR, "cartellini-rapporto.json"), "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=2)
    return rapporto, uscita


def main():
    parser = argparse.ArgumentParser(description="Ricostruzione dei cartellini dagli episodi")
    parser.add_argument("--limit", type=int, default=None)
    argomenti = parser.parse_args()

    if not os.path.isdir(EPISODI_DIR):
        print("episodi non raccolti: " + EPISODI_DIR)
        return 1

    rapporto, uscita = ricostruisci(argomenti.limit)
    print("gare con episodi acquisiti: " + str(rapporto["gare_con_episodi_acquisiti"]))
    print("gare ricostruite: " + str(rapporto["gare_ricostruite"]))
    print("gare con lista vuota: " + str(rapporto["gare_con_lista_episodi_vuota"]))
    print("leghe coperte: " + str(rapporto["leghe_coperte"]))
    print("cartellini non attribuiti: "
          + str(rapporto["cartellini_non_attribuiti"]["totale"]))
    for nome in CONTEGGI + ["unattributed_cards"]:
        riassunto = rapporto["distribuzioni"][nome]
        if riassunto is None:
            print("  " + nome + ": nessuna osservazione")
            continue
        print("  " + nome + ": media " + str(riassunto["media"])
              + "  sd " + str(riassunto["sd"])
              + "  zeri " + str(riassunto["quota_zeri"])
              + "  max " + str(riassunto["max"]))
    print("scritto: " + uscita)
    return 0


if __name__ == "__main__":
    sys.exit(main())
