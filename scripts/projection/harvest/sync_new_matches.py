"""Sincronizzazione incrementale delle gare nuove.

L'archivio si ferma a una certa data. Questo script scopre quali gare concluse la fonte
ha in piu' nelle competizioni gia' seguite, e ne raccoglie i quattro payload che la
normalizzazione consuma. **Non normalizza e non scrive nel database**: quelli restano i
passi gia' esistenti, che sono validati e non si riscrivono in un secondo linguaggio.

    calibration/data/raw/{lega}/{id}.json       pannello e mappa dei tiri
    harvest/data/match-detail/{lega}/{id}.json  contorno, e il join della gara
    harvest/data/incidents/{lega}/{id}.json     episodi, per la disciplina
    harvest/data/player-stats/{lega}/{id}.json  statistiche per giocatore

Quattro richieste per gara: il pannello e la mappa dei tiri arrivano insieme.

Le tre proprieta' richieste sono ereditate da `fetch_blocks.py`, di cui questo script
riusa rete, ritmo e giornale:

- **incrementale**: si guardano solo le gare che l'archivio non ha, dalla data
  dell'ultima gia' osservata in quella stagione;
- **idempotente**: un payload gia' acquisito e valido non si richiede, e rilanciare non
  produce duplicati;
- **riprendibile**: ogni esito finisce subito nel giornale del suo blocco, e
  un'interruzione riparte da li'.

**Il tetto di richieste e' obbligatorio e non ha un valore predefinito.** Una raccolta
senza tetto e' una decisione che questo script non prende.

Sui filtri si usa il vocabolario delle risposte, non quello della documentazione:
`status=finished`. `upcoming` e `live` non filtrano niente e restituiscono la lista
intera con un `200` che non lo dice.

Uso:
    .venv/Scripts/python.exe scripts/projection/harvest/sync_new_matches.py \
        --scopri --max-richieste 60
    .venv/Scripts/python.exe scripts/projection/harvest/sync_new_matches.py \
        --raccogli --max-richieste 400
"""

import argparse
import csv
import json
import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fetch_blocks as blocchi

ROOT = blocchi.ROOT
OSSERVAZIONI = os.path.join(
    ROOT, "scripts", "projection", "dataset", "output", "osservazioni.csv"
)
RAW_DIR = os.path.join(ROOT, "scripts", "calibration", "data", "raw")
NUOVE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "gare-nuove.json")
# Il rendiconto della raccolta su file, non solo a video: chi pianifica deve poterlo
# leggere senza rileggere lo standard output di un processo gia' finito.
RACCOLTA = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "raccolta-ultima.json"
)

# Il quarto deposito non e' un blocco di `fetch_blocks`: il pannello e la mappa dei tiri
# vivono dove la normalizzazione li cerca gia', e cambiarle di posto vorrebbe dire
# toccare due script validati per una ragione di ordine.
RISORSA_PANNELLO = "/api/v2/events/{id}/stats/"


def stagioni_e_gare():
    """Per ogni (lega, stagione) l'ultimo calcio d'inizio osservato, e le gare gia' viste."""
    ultime = {}
    viste = set()
    with open(OSSERVAZIONI, "r", encoding="utf-8", newline="") as handle:
        for riga in csv.DictReader(handle):
            event_id = (riga.get("event_id") or "").strip()
            lega = (riga.get("league_id") or "").strip()
            stagione = (riga.get("season_id") or "").strip()
            quando = (riga.get("calcio_dinizio") or "").strip()
            if event_id:
                viste.add(event_id)
            if not lega or not stagione or not quando:
                continue
            chiave = (lega, stagione)
            if chiave not in ultime or quando > ultime[chiave]:
                ultime[chiave] = quando
    return ultime, viste


class Tetto:
    """Il conto delle richieste, che si ferma dove l'utente ha detto."""

    def __init__(self, massimo):
        self.massimo = massimo
        self.fatte = 0

    def consuma(self):
        if self.fatte >= self.massimo:
            return False
        self.fatte += 1
        return True

    def esaurito(self):
        return self.fatte >= self.massimo


def chiedi_json(url, token, tetto, ritmo, ultimo):
    """Una richiesta, col ritmo dichiarato. Ritorna (stato, documento, ultimo)."""
    if not tetto.consuma():
        return "tetto", None, ultimo
    intervallo = 1.0 / ritmo if ritmo > 0 else 0.0
    passato = time.monotonic() - ultimo
    if passato < intervallo:
        time.sleep(intervallo - passato)
    ultimo = time.monotonic()
    stato, corpo, motivo, _ = blocchi.acquisisci(url, token)
    if stato != "ok":
        return stato if motivo is None else stato + ":" + motivo, None, ultimo
    try:
        return "ok", json.loads(corpo.decode("utf-8")), ultimo
    except ValueError:
        return "illeggibile", None, ultimo


def scopri(token, base, tetto, ritmo):
    """Le gare concluse che l'archivio non ha, competizione per competizione."""
    ultime, viste = stagioni_e_gare()
    radice = base.rstrip("/").replace("/api/v2", "")
    nuove = []
    interrotto = False
    per_lega = {}
    for (lega, stagione), quando in sorted(ultime.items()):
        per_lega.setdefault(lega, []).append((stagione, quando))

    for lega in sorted(per_lega, key=int):
        da = min(quando for _, quando in per_lega[lega])[:10]
        offset = 0
        while True:
            parametri = urllib.parse.urlencode({
                "league_id": lega,
                "status": "finished",
                "date_from": da,
                "limit": 200,
                "offset": offset,
            })
            stato, documento, ultimo = chiedi_json(
                radice + "/api/v2/events/?" + parametri, token, tetto, ritmo,
                getattr(scopri, "_ultimo", 0.0),
            )
            scopri._ultimo = ultimo
            if stato == "tetto":
                interrotto = True
                break
            if stato != "ok":
                print("lega " + lega + ": " + stato)
                break
            risultati = documento.get("results") or []
            for gara in risultati:
                event_id = str(gara.get("id") or "")
                if not event_id or event_id in viste:
                    continue
                stagione = str(gara.get("season_id") or "")
                chiave = (lega, stagione)
                if chiave in ultime and str(gara.get("event_date") or "") <= ultime[chiave]:
                    continue
                nuove.append({
                    "event_id": event_id,
                    "league_id": lega,
                    "season_id": stagione,
                    "kickoff_at": gara.get("event_date"),
                    "status": gara.get("status"),
                })
                viste.add(event_id)
            if len(risultati) < 200 or documento.get("next") is None:
                break
            offset += 200
        if interrotto:
            break

    nuove.sort(key=lambda voce: int(voce["event_id"]))
    os.makedirs(os.path.dirname(NUOVE), exist_ok=True)
    with open(NUOVE, "w", encoding="utf-8") as handle:
        json.dump({
            "scoperte_il": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "richieste_usate": tetto.fatte,
            "tetto_raggiunto": interrotto,
            "competizioni_esaminate": len(per_lega),
            "gare": nuove,
        }, handle, ensure_ascii=False, indent=2)

    print("gare nuove: " + str(len(nuove)) + " · richieste: " + str(tetto.fatte)
          + (" · TETTO RAGGIUNTO, la scoperta non e' completa" if interrotto else ""))
    return 0


def percorso_pannello(lega, event_id):
    return os.path.join(RAW_DIR, lega or "0", event_id + ".json")


def raccogli(token, base, tetto, ritmo):
    """I quattro payload di ogni gara nuova, saltando cio' che c'e' gia'."""
    if not os.path.isfile(NUOVE):
        print("nessun elenco di gare nuove: eseguire prima --scopri")
        return 2
    with open(NUOVE, "r", encoding="utf-8") as handle:
        elenco = json.load(handle)["gare"]

    radice = base.rstrip("/").replace("/api/v2", "")
    giornali = {nome: blocchi.carica_giornale(nome) for nome in blocchi.ORDINE}
    for nome in blocchi.ORDINE:
        os.makedirs(os.path.join(blocchi.DATA_DIR, nome), exist_ok=True)

    conteggio = {"pannello": 0, "saltate": 0, "errori": 0}
    for nome in blocchi.ORDINE:
        conteggio[nome] = 0
    ultimo = 0.0
    aperti = {
        nome: open(blocchi.percorso_giornale(nome), "a", encoding="utf-8")
        for nome in blocchi.ORDINE
    }
    try:
        for voce in elenco:
            event_id = voce["event_id"]
            lega = voce["league_id"]
            if tetto.esaurito():
                break

            # Il pannello e la mappa dei tiri, dove la normalizzazione li cerca.
            destinazione = percorso_pannello(lega, event_id)
            if os.path.isfile(destinazione):
                conteggio["saltate"] += 1
            else:
                stato, documento, ultimo = chiedi_json(
                    radice + RISORSA_PANNELLO.replace("{id}", event_id),
                    token, tetto, ritmo, ultimo,
                )
                if stato == "tetto":
                    break
                if stato == "ok" and documento is not None:
                    if "event_id" not in documento:
                        documento = dict({"event_id": int(event_id)}, **documento)
                    os.makedirs(os.path.dirname(destinazione), exist_ok=True)
                    with open(destinazione, "w", encoding="utf-8") as handle:
                        json.dump(documento, handle, ensure_ascii=False)
                    conteggio["pannello"] += 1
                else:
                    conteggio["errori"] += 1
                    print("pannello " + event_id + ": " + stato)

            # Gli altri tre, con il giornale di `fetch_blocks`.
            for nome in blocchi.ORDINE:
                if blocchi.gia_acquisito(nome, giornali[nome], event_id, lega):
                    conteggio["saltate"] += 1
                    continue
                if tetto.esaurito():
                    break
                url = radice + blocchi.BLOCCHI[nome].replace("{id}", event_id)
                stato, documento, ultimo = chiedi_json(url, token, tetto, ritmo, ultimo)
                if stato == "tetto":
                    break
                registrazione = {
                    "event_id": event_id,
                    "league_id": lega,
                    "risorsa": blocchi.BLOCCHI[nome],
                    "stato": "ok" if stato == "ok" else "errore",
                    "acquisito_il": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    "tentativi": 1,
                    "errore": None if stato == "ok" else stato,
                    "checksum": None,
                    "byte": None,
                }
                if stato == "ok" and documento is not None:
                    percorso = blocchi.percorso_payload(nome, lega, event_id)
                    os.makedirs(os.path.dirname(percorso), exist_ok=True)
                    corpo = json.dumps(documento, ensure_ascii=False)
                    with open(percorso, "w", encoding="utf-8") as handle:
                        handle.write(corpo)
                    registrazione["byte"] = len(corpo.encode("utf-8"))
                    conteggio[nome] += 1
                else:
                    conteggio["errori"] += 1
                blocchi.scrivi_giornale(aperti[nome], registrazione)
    finally:
        for handle in aperti.values():
            handle.close()

    rendiconto = {
        "richieste_usate": tetto.fatte,
        "tetto_raggiunto": tetto.esaurito(),
        "acquisiti": conteggio,
    }
    with open(RACCOLTA, "w", encoding="utf-8") as handle:
        json.dump(rendiconto, handle, ensure_ascii=False, indent=2)
    print(json.dumps(rendiconto, ensure_ascii=False, indent=2))
    print(
        "la normalizzazione e il caricamento restano passi separati: build_shots.py, "
        "reconstruct_cards.py, build_players.py, build_observations.py, "
        "export_observations_batch.py, poi private.apply_projection_observations"
    )
    return 0


def main():
    lettore = argparse.ArgumentParser(description="Sincronizzazione incrementale delle gare nuove")
    lettore.add_argument("--scopri", action="store_true", help="solo scoperta delle gare nuove")
    lettore.add_argument("--raccogli", action="store_true", help="raccolta dei payload")
    lettore.add_argument(
        "--max-richieste", type=int, required=True,
        help="tetto di richieste per questa esecuzione, obbligatorio",
    )
    lettore.add_argument("--ritmo", type=float, default=blocchi.RICHIESTE_AL_SECONDO)
    argomenti = lettore.parse_args()

    if argomenti.scopri == argomenti.raccogli:
        lettore.error("scegliere --scopri oppure --raccogli")
    if argomenti.max_richieste <= 0:
        lettore.error("il tetto dev'essere positivo")

    ambiente = blocchi.leggi_env_local()
    token, base = blocchi.leggi_configurazione(ambiente) \
        if blocchi.leggi_configurazione.__code__.co_argcount == 1 \
        else blocchi.leggi_configurazione()
    tetto = Tetto(argomenti.max_richieste)
    if argomenti.scopri:
        return scopri(token, base, tetto, argomenti.ritmo)
    return raccogli(token, base, tetto, argomenti.ritmo)


if __name__ == "__main__":
    raise SystemExit(main())
