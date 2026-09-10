"""Le quote di Fastbet per i mercati che la fonte non porta.

**Perche' esiste.** La fonte copre solo i mercati sui gol - 1x2, over/under 0,5-3,5,
btts, doppia chance, draw no bet, handicap. Corner, tiri, cartellini, falli, fuorigioco,
parate, marcatori e giocatori non ci sono, e sono esattamente le sette famiglie che il
motore proietta: senza un prezzo di mercato accanto, la nostra probabilita' non si puo'
confrontare con niente.

**Da dove.** Fastbet monta il palinsesto di Altenar (`sb2frontend-1-altenar2.biahosted.com`,
integrazione `fastbet2`): API JSON pubblica, senza autenticazione e senza sfida anti-bot.
Il `robots.txt` di www.fastbet.it e' `Disallow:` vuoto, cioe' consente la scansione. Si
chiama l'API con una pausa fra le richieste; non si aggira nessuna protezione.

**Che cosa scrive.** Una riga NDJSON per evento, gzippata, gia' normalizzata nel contratto
IQstatS: niente payload grezzi in archivio. Il file si riprende, perche' gli script pesanti
di questo progetto sono gia' stati uccisi dal sistema per memoria esaurita.

Uso:
  python scripts/quote/fastbet-quote.py [--giorni 3] [--eventi N] [--pausa 1.0]
"""
import argparse
import gzip
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from scrapling.fetchers import FetcherSession

BASE = "https://sb2frontend-1-altenar2.biahosted.com/api/widget"
COMUNI = {
    "culture": "it-IT",
    "timezoneOffset": "-120",
    "integration": "fastbet2",
    "deviceType": "1",
    "numFormat": "en-GB",
    "countryCode": "IT",
}
CALCIO = 66
USCITA = Path(__file__).parent / "output"

# Le sette famiglie del motore, per marcare le righe confrontabili con le nostre letture.
# Il resto si raccoglie lo stesso: marcatori e giocatori il motore non li proietta ancora,
# e quelle quote restano in archivio senza pagina finche' non avranno un contratto dati.
FAMIGLIE = {
    "shots_on_target": re.compile(r"tiri in porta", re.I),
    "total_shots": re.compile(r"tiri (totali|dall)", re.I),
    "corner_kicks": re.compile(r"corner|angolo", re.I),
    "yellow_cards": re.compile(r"cartellin|ammonizion", re.I),
    "fouls": re.compile(r"\bfall[oi]\b", re.I),
    "offsides": re.compile(r"fuorigioco", re.I),
    "goalkeeper_saves": re.compile(r"\bparat[ae]\b", re.I),
}


def famiglia(nome):
    """La famiglia del motore a cui il mercato corrisponde, `None` se non e' nessuna.

    L'ordine conta: "tiri in porta" va provato prima di "tiri totali", altrimenti il
    mercato piu' specifico finirebbe nella famiglia sbagliata.
    """
    for chiave, rx in FAMIGLIE.items():
        if rx.search(nome):
            return chiave
    return None


def linea_e_giocatore(sv):
    """`sv` porta la linea e, sui mercati giocatore, il riferimento del giocatore.

    Esempio: `"0.5|ws:player:2484|1"`. Dove non c'e' linea si scrive `None`, mai `0`.
    """
    if not sv:
        return None, None
    pezzi = sv.split("|")
    try:
        linea = float(pezzi[0])
    except (ValueError, IndexError):
        linea = None
    giocatore = next((p for p in pezzi if p.startswith("ws:player:")), None)
    return linea, giocatore


def normalizza(dettaglio):
    prezzi = {o["id"]: o for o in dettaglio.get("odds", [])}
    squadre = {c["id"]: c.get("name") for c in dettaglio.get("competitors", [])}
    mercati = []
    for m in list(dettaglio.get("markets", [])) + list(dettaglio.get("childMarkets", [])):
        ids = [i for gruppo in (m.get("desktopOddIds") or []) for i in gruppo]
        esiti = []
        for i in ids:
            o = prezzi.get(i)
            # Un esito senza prezzo non si converte in zero: si salta, e il mercato senza
            # nessun prezzo non entra affatto.
            if o is None or o.get("price") is None:
                continue
            esiti.append({
                "nome": o.get("name"),
                "quota": o["price"],
                "stato": o.get("oddStatus"),
                "squadra": squadre.get(o.get("competitorId")),
            })
        if not esiti:
            continue
        linea, giocatore = linea_e_giocatore(m.get("sv"))
        nome = m.get("name") or ""
        mercati.append({
            "id": m.get("id"),
            "tipo": m.get("typeId"),
            "nome": nome,
            "famiglia": famiglia(nome),
            "linea": linea,
            "giocatore": m.get("childName") or None,
            "giocatore_ref": giocatore,
            "esiti": esiti,
        })
    comp = dettaglio.get("competitors", [])
    # **Le "Maggiorate" non sono gare.** Il palinsesto mescola agli eventi veri delle
    # multiple a quota fissa - «Malen D. - Douvikas A. - Olise M. (Tutti Segnano 10/9)» -
    # che hanno un solo mercato e un solo competitor. Non hanno una squadra di casa, non
    # hanno un campionato, e non si possono confrontare con nessuna nostra lettura.
    if len(comp) != 2:
        return None
    return {
        "fonte": "fastbet",
        "piattaforma": "altenar/fastbet2",
        "raccolto_il": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "evento": dettaglio.get("id"),
        "evento_feed": dettaglio.get("feedEventId"),
        "inizio": dettaglio.get("startDate"),
        "campionato": (dettaglio.get("champ") or {}).get("name"),
        "categoria": (dettaglio.get("category") or {}).get("name"),
        "casa": comp[0].get("name") if len(comp) > 0 else None,
        "fuori": comp[1].get("name") if len(comp) > 1 else None,
        "mercati": mercati,
    }


def elenco(sessione, giorni):
    ora = datetime.now(timezone.utc)
    p = dict(
        COMUNI,
        sportId=str(CALCIO),
        dateFrom=ora.strftime("%Y-%m-%dT%H:%M:%SZ"),
        dateTo=(ora + timedelta(days=giorni)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        marketTypeIds="1",
    )
    r = sessione.get(BASE + "/GetEvents", params=p, timeout=60)
    return json.loads(r.body)["events"]


def gia_raccolti(percorso):
    if not percorso.exists():
        return set()
    fatti = set()
    with gzip.open(percorso, "rt", encoding="utf-8") as f:
        for riga in f:
            try:
                fatti.add(json.loads(riga)["evento"])
            except (ValueError, KeyError):
                continue
    return fatti


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--giorni", type=int, default=3)
    a.add_argument("--eventi", type=int, default=0, help="0 = tutti")
    a.add_argument("--pausa", type=float, default=1.0, help="secondi fra due richieste")
    o = a.parse_args()

    USCITA.mkdir(parents=True, exist_ok=True)
    percorso = USCITA / ("fastbet-" + datetime.now().strftime("%Y-%m-%d") + ".ndjson.gz")
    fatti = gia_raccolti(percorso)

    scritti = mercati_tot = esiti_tot = saltati = 0
    inizio = time.time()
    with FetcherSession(impersonate="chrome", stealthy_headers=True) as s:
        eventi = elenco(s, o.giorni)
        if o.eventi:
            eventi = eventi[:o.eventi]
        print(str(len(eventi)) + " eventi in finestra, " + str(len(fatti)) + " gia' raccolti",
              flush=True)

        with gzip.open(percorso, "at", encoding="utf-8") as f:
            for e in eventi:
                if e["id"] in fatti:
                    continue
                try:
                    r = s.get(BASE + "/GetEventDetails",
                              params=dict(COMUNI, eventId=str(e["id"])), timeout=60)
                    riga = normalizza(json.loads(r.body))
                except Exception as errore:
                    saltati += 1
                    print("  evento " + str(e["id"]) + ": "
                          + type(errore).__name__ + " " + str(errore), flush=True)
                    continue
                if riga is None:
                    saltati += 1
                    time.sleep(o.pausa)
                    continue
                f.write(json.dumps(riga, ensure_ascii=False) + "\n")
                scritti += 1
                mercati_tot += len(riga["mercati"])
                esiti_tot += sum(len(m["esiti"]) for m in riga["mercati"])
                if scritti % 25 == 0:
                    print("  " + str(scritti) + " eventi · " + str(mercati_tot) + " mercati · "
                          + str(esiti_tot) + " quote · "
                          + format(time.time() - inizio, ".0f") + "s", flush=True)
                time.sleep(o.pausa)

    mb = percorso.stat().st_size / 1024 / 1024
    print(str(scritti) + " eventi · " + str(mercati_tot) + " mercati · " + str(esiti_tot)
          + " quote · " + str(saltati) + " saltati · " + format(mb, ".1f") + " MB · "
          + format(time.time() - inizio, ".0f") + "s")
    print(percorso)
    return 0


if __name__ == "__main__":
    sys.exit(main())
