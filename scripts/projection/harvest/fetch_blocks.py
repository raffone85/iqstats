"""Raccolta dei tre blocchi che l'archivio storico non contiene.

Blocchi, nell'ordine deciso:

    incidents      episodi della gara, per ricostruire i cartellini per natura
    player-stats   statistiche per giocatore, per il blocco giocatori
    match-detail   contorno della gara: arbitro, stadio, meteo, terreno, contesto

La raccolta e' riprendibile, idempotente e resistente alle interruzioni: ogni esito
finisce subito in un giornale ad aggiunta, e un rilancio salta cio' che e' gia' stato
acquisito e validato.

Una risposta fallita non e' mai un dato mancante e non e' mai uno zero: resta un esito
con il suo stato e il suo motivo.

Le credenziali si leggono da .env.local e non compaiono mai in output, giornale o log.

Uso:
    .venv/Scripts/python.exe scripts/projection/harvest/fetch_blocks.py --block incidents
    .venv/Scripts/python.exe scripts/projection/harvest/fetch_blocks.py --block all
    .venv/Scripts/python.exe scripts/projection/harvest/fetch_blocks.py --block incidents --limit 5
"""

import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
CSV_PATH = os.path.join(ROOT, "scripts", "calibration", "data", "dataset.csv")
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
RUNTIME_TS = os.path.join(ROOT, "apps", "web", "src", "server", "iqstats", "runtime.ts")

BLOCCHI = {
    "incidents": "/api/v2/events/{id}/incidents/",
    "player-stats": "/api/v2/events/{id}/player-stats/",
    "match-detail": "/api/v2/events/{id}/",
}
ORDINE = ["incidents", "player-stats", "match-detail"]

RICHIESTE_AL_SECONDO = 2.0
TENTATIVI_MASSIMI = 5
ATTESA_INIZIALE = 1.0
TIMEOUT = 20


def leggi_env_local():
    """Legge le chiavi di .env.local senza stamparne mai i valori."""
    valori = {}
    for percorso in (
        os.path.join(ROOT, "apps", "web", ".env.local"),
        os.path.join(ROOT, ".env.local"),
    ):
        if not os.path.isfile(percorso):
            continue
        with open(percorso, "r", encoding="utf-8") as handle:
            for riga in handle:
                riga = riga.strip()
                if not riga or riga.startswith("#") or "=" not in riga:
                    continue
                chiave, _, valore = riga.partition("=")
                valori.setdefault(chiave.strip(), valore.strip().strip('"').strip("'"))
    return valori


def leggi_configurazione():
    ambiente = leggi_env_local()
    token = (
        os.environ.get("IQSTATS_PROVIDER_TOKEN")
        or ambiente.get("IQSTATS_PROVIDER_TOKEN")
        or ambiente.get("BSD_API_TOKEN")
    )
    base = (
        os.environ.get("IQSTATS_PROVIDER_BASE_URL")
        or ambiente.get("IQSTATS_PROVIDER_BASE_URL")
        or ambiente.get("BSD_API_BASE_URL")
    )
    if not base and os.path.isfile(RUNTIME_TS):
        # L'indirizzo predefinito vive gia' nel livello di integrazione: si legge
        # da li' invece di riscriverlo in un file nuovo.
        with open(RUNTIME_TS, "r", encoding="utf-8") as handle:
            trovato = re.search(r'"(https?://[^"]+/api/v2/)"', handle.read())
        if trovato:
            base = trovato.group(1)
    return token, base


def elenco_gare():
    """(event_id, league_id) in ordine, dal CSV gia' prodotto dalla calibrazione."""
    viste = {}
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as handle:
        for riga in csv.DictReader(handle):
            event_id = (riga.get("match_id") or "").strip()
            league_id = (riga.get("league_id") or "").strip()
            if event_id and event_id not in viste:
                viste[event_id] = league_id
    return sorted(viste.items(), key=lambda coppia: int(coppia[0]))


def percorso_giornale(blocco):
    return os.path.join(DATA_DIR, blocco, "journal.jsonl")


def percorso_manifest(blocco):
    return os.path.join(DATA_DIR, blocco, "manifest.json")


def percorso_payload(blocco, league_id, event_id):
    return os.path.join(DATA_DIR, blocco, league_id or "0", event_id + ".json")


def carica_giornale(blocco):
    """event_id -> ultimo esito registrato. Le righe rotte si ignorano."""
    esiti = {}
    percorso = percorso_giornale(blocco)
    if not os.path.isfile(percorso):
        return esiti
    with open(percorso, "r", encoding="utf-8") as handle:
        for riga in handle:
            riga = riga.strip()
            if not riga:
                continue
            try:
                voce = json.loads(riga)
            except ValueError:
                continue
            if "event_id" in voce:
                esiti[str(voce["event_id"])] = voce
    return esiti


def gia_acquisito(blocco, esiti, event_id, league_id):
    voce = esiti.get(event_id)
    if voce is None:
        return False
    if voce.get("stato") not in ("ok", "vuoto", "non_trovato"):
        return False
    if voce.get("stato") == "ok":
        return os.path.isfile(percorso_payload(blocco, league_id, event_id))
    return True


def scrivi_giornale(handle, voce):
    handle.write(json.dumps(voce, ensure_ascii=False) + "\n")
    handle.flush()
    os.fsync(handle.fileno())


def chiedi(url, token):
    richiesta = urllib.request.Request(url, method="GET")
    richiesta.add_header("Authorization", "Token " + token)
    richiesta.add_header("Accept", "application/json")
    with urllib.request.urlopen(richiesta, timeout=TIMEOUT) as risposta:
        return risposta.read()


def acquisisci(url, token):
    """Ritorna (stato, corpo, motivo, tentativi). Nessun errore diventa un dato."""
    attesa = ATTESA_INIZIALE
    for tentativo in range(1, TENTATIVI_MASSIMI + 1):
        try:
            corpo = chiedi(url, token)
            return "ok", corpo, None, tentativo
        except urllib.error.HTTPError as errore:
            codice = errore.code
            if codice == 404:
                return "non_trovato", None, "404", tentativo
            if codice == 402:
                return "a_pagamento", None, "402", tentativo
            if codice in (401, 403):
                return "non_autorizzato", None, str(codice), tentativo
            if codice == 429 or codice >= 500:
                if tentativo == TENTATIVI_MASSIMI:
                    return "errore", None, str(codice), tentativo
                time.sleep(attesa)
                attesa *= 2
                continue
            return "errore", None, str(codice), tentativo
        except (urllib.error.URLError, TimeoutError, OSError) as errore:
            if tentativo == TENTATIVI_MASSIMI:
                return "errore", None, type(errore).__name__, tentativo
            time.sleep(attesa)
            attesa *= 2
    return "errore", None, "tentativi esauriti", TENTATIVI_MASSIMI


def raccogli(blocco, token, base, gare, limite, ritmo, prova):
    modello = BLOCCHI[blocco]
    esiti = carica_giornale(blocco)
    os.makedirs(os.path.join(DATA_DIR, blocco), exist_ok=True)

    residue = [
        (event_id, league_id)
        for event_id, league_id in gare
        if not gia_acquisito(blocco, esiti, event_id, league_id)
    ]
    gia = len(gare) - len(residue)
    da_fare = residue[:limite] if limite else residue

    print("blocco " + blocco + ": " + str(len(gare)) + " gare, "
          + str(gia) + " gia' acquisite, " + str(len(residue)) + " residue, "
          + str(len(da_fare)) + " in questa esecuzione")
    if prova or not da_fare:
        return {"blocco": blocco, "da_acquisire": len(da_fare), "eseguite": 0}

    intervallo = 1.0 / ritmo if ritmo > 0 else 0.0
    conteggio = {"ok": 0, "vuoto": 0, "non_trovato": 0, "errore": 0}
    ultimo = 0.0

    with open(percorso_giornale(blocco), "a", encoding="utf-8") as giornale:
        for indice, (event_id, league_id) in enumerate(da_fare, start=1):
            passato = time.monotonic() - ultimo
            if passato < intervallo:
                time.sleep(intervallo - passato)
            ultimo = time.monotonic()

            url = base.rstrip("/").replace("/api/v2", "") + modello.replace("{id}", event_id)
            stato, corpo, motivo, tentativi = acquisisci(url, token)

            voce = {
                "event_id": event_id,
                "league_id": league_id,
                "risorsa": modello,
                "stato": stato,
                "acquisito_il": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "tentativi": tentativi,
                "errore": motivo,
                "checksum": None,
                "byte": None,
            }

            if stato == "ok" and corpo is not None:
                destinazione = percorso_payload(blocco, league_id, event_id)
                os.makedirs(os.path.dirname(destinazione), exist_ok=True)
                with open(destinazione, "wb") as uscita:
                    uscita.write(corpo)
                voce["checksum"] = hashlib.sha256(corpo).hexdigest()
                voce["byte"] = len(corpo)

            if stato in ("non_autorizzato", "a_pagamento"):
                scrivi_giornale(giornale, voce)
                print("interrotto: la fonte ha risposto " + str(motivo))
                break

            scrivi_giornale(giornale, voce)
            conteggio[stato if stato in conteggio else "errore"] += 1

            if indice % 200 == 0:
                print("  " + str(indice) + "/" + str(len(da_fare))
                      + " ok=" + str(conteggio["ok"])
                      + " non trovate=" + str(conteggio["non_trovato"])
                      + " errori=" + str(conteggio["errore"]))

    riepilogo = {"blocco": blocco, "da_acquisire": len(da_fare), "eseguite": sum(conteggio.values())}
    riepilogo.update(conteggio)
    with open(percorso_manifest(blocco), "w", encoding="utf-8") as handle:
        json.dump({
            "blocco": blocco,
            "risorsa": modello,
            "aggiornato_il": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "gare_totali": len(gare),
            "riepilogo_ultima_esecuzione": riepilogo,
            "nota": "il giornale journal.jsonl e' la fonte di verita', questo file e' un riassunto",
        }, handle, ensure_ascii=False, indent=2)
    return riepilogo


def main():
    parser = argparse.ArgumentParser(description="Raccolta dei blocchi mancanti")
    parser.add_argument("--block", default="all", choices=ORDINE + ["all"])
    parser.add_argument("--limit", type=int, default=None, help="acquisisci solo N gare")
    parser.add_argument("--rate", type=float, default=RICHIESTE_AL_SECONDO)
    parser.add_argument("--dry-run", action="store_true", help="conta soltanto, non chiede nulla")
    argomenti = parser.parse_args()

    token, base = leggi_configurazione()
    if not argomenti.dry_run and not token:
        print("credenziali non configurate: impostare IQSTATS_PROVIDER_TOKEN")
        return 1
    if not argomenti.dry_run and not base:
        print("indirizzo della fonte non configurato: impostare IQSTATS_PROVIDER_BASE_URL")
        return 1

    gare = elenco_gare()
    blocchi = ORDINE if argomenti.block == "all" else [argomenti.block]

    for blocco in blocchi:
        riepilogo = raccogli(blocco, token, base, gare, argomenti.limit,
                             argomenti.rate, argomenti.dry_run)
        print("riepilogo " + blocco + ": " + json.dumps(riepilogo, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
