"""Raccolta delle rose, per avere il ruolo in campo di ogni giocatore.

**Perche' esiste.** Il ruolo non sta da nessuna parte di quello che abbiamo gia': non
nelle settantacinque colonne delle righe per giocatore sul disco, non nelle quattordici
della tavola del motore. Sta sul profilo del giocatore e sulla rosa della squadra, e
fra i due si sceglie la rosa: **591 chiamate invece di 21.346**, una per squadra invece
di una per giocatore, per lo stesso campo.

**Il limite, dichiarato.** La rosa e' quella di oggi. Un giocatore che ha cambiato
squadra o ha smesso non compare piu', e per lui il ruolo resta ignoto: non si indovina
dai numeri e non si mette una classe «varie» che poi verrebbe letta come un ruolo. La
copertura effettiva la misura chi legge i dati, non questo script.

Riprendibile e idempotente come i suoi fratelli: ogni esito finisce in un giornale ad
aggiunta e un rilancio salta cio' che e' gia' stato acquisito. Una risposta fallita
resta un esito con il suo motivo, mai un dato mancante e mai uno zero.

Le credenziali si leggono da .env.local e non compaiono mai in output, giornale o log.

Uso:
    .venv/Scripts/python.exe scripts/projection/harvest/fetch_squads.py
    .venv/Scripts/python.exe scripts/projection/harvest/fetch_squads.py --limit 5 --prova
"""

import argparse
import json
import os
import sys
import time

from fetch_blocks import acquisisci, leggi_configurazione

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
ROSE_DIR = os.path.join(DATA_DIR, "squads")
GIORNALE = os.path.join(ROSE_DIR, "journal.jsonl")
MANIFEST = os.path.join(ROSE_DIR, "manifest.json")
RISORSA = "/api/v2/teams/{id}/squad/"
RITMO = 2.0


def squadre_dal_disco():
    """Gli identificativi di squadra visti nelle righe per giocatore gia' raccolte."""
    base = os.path.join(DATA_DIR, "player-stats")
    viste = set()
    for lega in sorted(os.listdir(base)):
        cartella = os.path.join(base, lega)
        if not os.path.isdir(cartella):
            continue
        for nome in os.listdir(cartella):
            if not nome.endswith(".json"):
                continue
            try:
                with open(os.path.join(cartella, nome), "r", encoding="utf-8") as handle:
                    dati = json.load(handle)
            except (OSError, ValueError):
                continue
            for riga in dati.get("player_stats", []):
                if riga.get("team_id") is not None:
                    viste.add(int(riga["team_id"]))
    return sorted(viste)


def carica_giornale():
    esiti = {}
    if not os.path.isfile(GIORNALE):
        return esiti
    with open(GIORNALE, "r", encoding="utf-8") as handle:
        for riga in handle:
            riga = riga.strip()
            if not riga:
                continue
            try:
                voce = json.loads(riga)
            except ValueError:
                continue
            esiti[int(voce["team_id"])] = voce
    return esiti


def raccogli(token, base, squadre, limite, prova):
    os.makedirs(ROSE_DIR, exist_ok=True)
    esiti = carica_giornale()
    conteggio = {"da_acquisire": 0, "eseguite": 0, "ok": 0, "vuoto": 0, "non_trovato": 0, "errore": 0}

    da_fare = [
        s
        for s in squadre
        if not (
            esiti.get(s, {}).get("stato") == "ok"
            and os.path.isfile(os.path.join(ROSE_DIR, f"{s}.json"))
        )
    ]
    if limite:
        da_fare = da_fare[:limite]
    conteggio["da_acquisire"] = len(da_fare)
    if prova:
        print(json.dumps({"risorsa": RISORSA, "da_acquisire": len(da_fare)}, ensure_ascii=False))
        return conteggio

    with open(GIORNALE, "a", encoding="utf-8") as giornale:
        for indice, squadra in enumerate(da_fare, start=1):
            # Stessa composizione dei fratelli: la base gia' finisce in /api/v2/, quindi
            # si toglie dal modello invece di raddoppiarlo.
            url = base.rstrip("/").replace("/api/v2", "") + RISORSA.replace("{id}", str(squadra))
            stato, corpo, motivo, tentativi = acquisisci(url, token)
            conteggio["eseguite"] += 1
            giocatori = 0
            if stato == "ok":
                try:
                    dati = json.loads(corpo.decode("utf-8"))
                except ValueError:
                    stato, motivo = "errore", "json non valido"
                    dati = None
                if dati is not None:
                    giocatori = len(dati.get("players", []))
                    # Una rosa vuota non e' un errore e non e' una rosa: si distingue,
                    # perche' un conteggio a zero letto come «raccolta» falsa la copertura.
                    stato = "ok" if giocatori > 0 else "vuoto"
                    with open(os.path.join(ROSE_DIR, f"{squadra}.json"), "w", encoding="utf-8") as uscita:
                        json.dump(dati, uscita, ensure_ascii=False)
            conteggio[stato if stato in conteggio else "errore"] += 1
            giornale.write(
                json.dumps(
                    {
                        "team_id": squadra,
                        "stato": stato,
                        "motivo": motivo,
                        "tentativi": tentativi,
                        "giocatori": giocatori,
                        "quando": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            giornale.flush()
            if indice % 50 == 0:
                print(f"{indice}/{len(da_fare)}", file=sys.stderr, flush=True)
            time.sleep(1.0 / RITMO)
    return conteggio


def main():
    parser = argparse.ArgumentParser(description="Raccolta delle rose per il ruolo in campo")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--prova", action="store_true", help="conta e non chiede niente")
    argomenti = parser.parse_args()

    token, base = leggi_configurazione()
    if not token or not base:
        raise SystemExit("Configurazione della fonte mancante")

    squadre = squadre_dal_disco()
    conteggio = raccogli(token, base, squadre, argomenti.limit, argomenti.prova)
    if not argomenti.prova:
        with open(MANIFEST, "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "blocco": "squads",
                    "risorsa": RISORSA,
                    "aggiornato_il": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    "squadre_totali": len(squadre),
                    "riepilogo_ultima_esecuzione": conteggio,
                    "nota": "il giornale journal.jsonl e' la fonte di verita', questo file e' un riassunto",
                },
                handle,
                ensure_ascii=False,
                indent=2,
            )
    print(json.dumps({"squadre": len(squadre), **conteggio}, ensure_ascii=False))


if __name__ == "__main__":
    main()
