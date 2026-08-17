"""Tavola delle osservazioni: una riga per squadra-gara, con la provenienza di ogni valore.

E' la base del dataset «al momento di». Qui non si calcola ancora nessuna feature:
si normalizza cio' che e' stato osservato a gara conclusa, applicando la politica di
provenienza PRIMA di qualunque media, come prescritto.

    A  osservato direttamente
    B  zero implicito verificato dalla struttura della fonte
    C  ricostruito deterministicamente da un'altra risorsa
    D  ambiguo
    E  mancante

La chiave di join (squadre, stagione, allenatori, arbitro, stadio, turno, derby e gol)
viene dallo snapshot di contesto e, quando disponibile, dal dettaglio gara raccolto: il
secondo ha la precedenza perche' e' la fonte diretta. Arbitro, stadio, turno e derby
esistono prima del calcio d'inizio; i gol no, e servono solo a ricostruire la classifica
«al momento di» da gare anteriori.

La disciplina non viene dal pannello ma da reconstruct_cards.py, che separa le quattro
nature del cartellino: i conteggi aggregati del pannello comprendono la stessa seconda
ammonizione due volte, una nei gialli e una nei rossi.

Nessuna richiesta di rete. Sola lettura.

Uso:
    .venv/Scripts/python.exe scripts/projection/dataset/build_observations.py
"""

import argparse
import csv
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
RAW_DIR = os.path.join(ROOT, "scripts", "calibration", "data", "raw")
CSV_PATH = os.path.join(ROOT, "scripts", "calibration", "data", "dataset.csv")
CONTEXT_DIR = os.path.join(ROOT, "scripts", "calibration", "context", "data")
DETTAGLIO_DIR = os.path.join(ROOT, "scripts", "projection", "harvest", "data", "match-detail")
REGISTRO = os.path.join(ROOT, "data", "registro-metriche.json")
OUT_DIR = os.path.join(os.path.dirname(__file__), "output")
CARTELLINI = os.path.join(OUT_DIR, "cartellini.csv")
SORGENTE_EPISODI = "/events/{id}/incidents/"

CHIAVI = [
    "event_id", "league_id", "season_id", "data", "calcio_dinizio",
    "lato", "team_id", "opponent_id", "coach_id", "opponent_coach_id",
    "referee_id", "venue_id", "round_number", "derby",
    "gol_fatti", "gol_subiti",
    "pannello", "origine_join",
]


def carica_registro():
    with open(REGISTRO, "r", encoding="utf-8") as handle:
        registro = json.load(handle)
    colonne = []
    for voce in registro["metriche"]:
        if voce["alias_di"] is not None:
            continue
        if voce["tipo"] == "composito":
            continue
        colonne.append({
            "fonte": voce["nome_fonte"],
            "interno": voce["nome_interno"],
            "classe": voce["provenienza"]["classe"],
            "da_episodi": voce["sorgente"].startswith(SORGENTE_EPISODI),
        })
    return registro, colonne


def carica_cartellini():
    """I quattro conteggi della disciplina, gia' ricostruiti episodio per episodio."""
    valori = {}
    if not os.path.isfile(CARTELLINI):
        return valori
    with open(CARTELLINI, "r", encoding="utf-8", newline="") as handle:
        for riga in csv.DictReader(handle):
            valori[(riga["event_id"], riga["lato"])] = riga
    return valori


def carica_anagrafica():
    anagrafica = {}
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as handle:
        for riga in csv.DictReader(handle):
            event_id = (riga.get("match_id") or "").strip()
            if event_id and event_id not in anagrafica:
                anagrafica[event_id] = {
                    "league_id": (riga.get("league_id") or "").strip(),
                    "data": (riga.get("date") or "").strip(),
                }
    return anagrafica


def carica_join_contesto():
    join = {}
    if not os.path.isdir(CONTEXT_DIR):
        return join
    cartelle = sorted(
        nome for nome in os.listdir(CONTEXT_DIR)
        if os.path.isdir(os.path.join(CONTEXT_DIR, nome))
    )
    if not cartelle:
        return join
    base = os.path.join(CONTEXT_DIR, cartelle[-1], "events")
    if not os.path.isdir(base):
        return join
    for lega in sorted(os.listdir(base)):
        cartella = os.path.join(base, lega)
        if not os.path.isdir(cartella):
            continue
        for nome in sorted(os.listdir(cartella)):
            if not nome.endswith(".json"):
                continue
            try:
                with open(os.path.join(cartella, nome), "r", encoding="utf-8") as handle:
                    blocco = json.load(handle)
            except (ValueError, OSError):
                continue
            for evento in blocco.get("events", []):
                event_id = str(evento.get("eventId"))
                if event_id in join:
                    continue
                join[event_id] = {
                    "season_id": evento.get("seasonId"),
                    "calcio_dinizio": evento.get("eventDate"),
                    "home_team_id": evento.get("homeTeamId"),
                    "away_team_id": evento.get("awayTeamId"),
                    "home_coach_id": evento.get("homeCoachId"),
                    "away_coach_id": evento.get("awayCoachId"),
                    "origine": "contesto",
                }
    return join


def carica_join_dettaglio():
    """Il dettaglio gara raccolto ha la precedenza: e' la fonte diretta."""
    join = {}
    if not os.path.isdir(DETTAGLIO_DIR):
        return join
    for lega in sorted(os.listdir(DETTAGLIO_DIR)):
        cartella = os.path.join(DETTAGLIO_DIR, lega)
        if not os.path.isdir(cartella):
            continue
        for nome in sorted(os.listdir(cartella)):
            if not nome.endswith(".json"):
                continue
            try:
                with open(os.path.join(cartella, nome), "r", encoding="utf-8") as handle:
                    evento = json.load(handle)
            except (ValueError, OSError):
                continue
            event_id = str(evento.get("id") or nome[:-5])
            join[event_id] = {
                "season_id": evento.get("season_id"),
                "calcio_dinizio": evento.get("event_date"),
                "home_team_id": evento.get("home_team_id"),
                "away_team_id": evento.get("away_team_id"),
                "home_coach_id": evento.get("home_coach_id"),
                "away_coach_id": evento.get("away_coach_id"),
                "referee_id": evento.get("referee_id"),
                "venue_id": evento.get("venue_id"),
                "round_number": evento.get("round_number"),
                "derby": 1 if evento.get("is_local_derby") else 0,
                # Osservati a gara conclusa: entrano nelle feature solo tramite storia
                # anteriore, come ogni altra metrica. Servono alla classifica «al momento di».
                "home_score": evento.get("home_score"),
                "away_score": evento.get("away_score"),
                "origine": "dettaglio",
            }
    return join


def valore_ricostruito(riga, voce):
    """La disciplina non viene dal pannello: viene dagli episodi, gia' separati per natura."""
    if riga is None or riga.get("provenienza") != "C":
        return None, "E"
    grezzo = riga.get(voce["interno"])
    if grezzo is None or grezzo == "":
        return None, "E"
    return int(grezzo), "C"


def valore_e_provenienza(blocco, voce, pannello):
    """Applica la politica di provenienza a un singolo campo."""
    if not pannello:
        return None, "E"

    fonte = voce["fonte"]
    if "." in fonte:
        radice, sotto = fonte.split(".", 1)
        contenitore = blocco.get(radice)
        if isinstance(contenitore, dict):
            if sotto in contenitore:
                return contenitore[sotto], "A"
        elif radice in blocco:
            return None, "D"
    elif fonte in blocco:
        return blocco[fonte], "A"

    # La riga non c'e': il significato dipende dalla classe misurata.
    if voce["classe"] == "B":
        return 0, "B"
    if voce["classe"] == "A":
        return None, "E"
    return None, "D"


def costruisci(limite=None):
    registro, colonne = carica_registro()
    anagrafica = carica_anagrafica()
    cartellini = carica_cartellini()
    join = carica_join_contesto()
    join.update(carica_join_dettaglio())

    percorsi = []
    for lega in sorted(os.listdir(RAW_DIR), key=int):
        cartella = os.path.join(RAW_DIR, lega)
        if not os.path.isdir(cartella):
            continue
        for nome in sorted(os.listdir(cartella)):
            if nome.endswith(".json"):
                percorsi.append((lega, nome[:-5], os.path.join(cartella, nome)))
    if limite:
        percorsi = percorsi[:limite]

    intestazione = list(CHIAVI)
    for voce in colonne:
        intestazione.append(voce["interno"])
    for voce in colonne:
        intestazione.append(voce["interno"] + "__p")

    os.makedirs(OUT_DIR, exist_ok=True)
    uscita = os.path.join(OUT_DIR, "osservazioni.csv")

    conteggio_classi = {"A": 0, "B": 0, "C": 0, "D": 0, "E": 0}
    righe = 0
    gare = 0
    senza_pannello = 0
    senza_join = 0
    senza_data = 0

    with open(uscita, "w", encoding="utf-8", newline="") as handle:
        scrittore = csv.writer(handle)
        scrittore.writerow(intestazione)

        for lega, event_id, percorso in percorsi:
            with open(percorso, "r", encoding="utf-8") as sorgente:
                payload = json.load(sorgente)

            stats = payload.get("stats") or {}
            casa = stats.get("home") or {}
            ospite = stats.get("away") or {}
            pannello = "total_shots" in casa and "total_shots" in ospite
            gare += 1
            if not pannello:
                senza_pannello += 1

            meta = anagrafica.get(event_id, {})
            chiave = join.get(event_id)
            if chiave is None:
                senza_join += 1
                chiave = {
                    "season_id": None, "calcio_dinizio": None,
                    "home_team_id": None, "away_team_id": None,
                    "home_coach_id": None, "away_coach_id": None,
                    "origine": "assente",
                }
            if not meta.get("data") and not chiave.get("calcio_dinizio"):
                senza_data += 1

            for lato, blocco in (("home", casa), ("away", ospite)):
                altro = "away" if lato == "home" else "home"
                riga = [
                    event_id,
                    meta.get("league_id") or lega,
                    chiave.get("season_id"),
                    meta.get("data"),
                    chiave.get("calcio_dinizio"),
                    lato,
                    chiave.get(lato + "_team_id"),
                    chiave.get(altro + "_team_id"),
                    chiave.get(lato + "_coach_id"),
                    chiave.get(altro + "_coach_id"),
                    chiave.get("referee_id"),
                    chiave.get("venue_id"),
                    chiave.get("round_number"),
                    chiave.get("derby"),
                    chiave.get(lato + "_score"),
                    chiave.get(altro + "_score"),
                    "1" if pannello else "0",
                    chiave.get("origine"),
                ]
                dalla_disciplina = cartellini.get((event_id, lato))
                valori = []
                provenienze = []
                for voce in colonne:
                    if voce["da_episodi"]:
                        valore, classe = valore_ricostruito(dalla_disciplina, voce)
                    else:
                        valore, classe = valore_e_provenienza(blocco, voce, pannello)
                    valori.append("" if valore is None else valore)
                    provenienze.append(classe)
                    conteggio_classi[classe] += 1
                scrittore.writerow(riga + valori + provenienze)
                righe += 1

    rapporto = {
        "generato_da": "scripts/projection/dataset/build_observations.py",
        "politica_provenienza": registro["politica_provenienza"]["versione"],
        "gare": gare,
        "righe_squadra_gara": righe,
        "colonne_metrica": len(colonne),
        "gare_senza_pannello": senza_pannello,
        "righe_con_disciplina_ricostruita": len(cartellini),
        "gare_senza_chiave_di_join": senza_join,
        "gare_senza_data": senza_data,
        "valori_per_classe": conteggio_classi,
        "quota_per_classe": {
            classe: round(n / max(sum(conteggio_classi.values()), 1), 6)
            for classe, n in conteggio_classi.items()
        },
        "nota_join": (
            "il dettaglio gara ha la precedenza sullo snapshot di contesto; le gare senza "
            "chiave restano senza identificativi di squadra e non entrano nelle feature"
        ),
    }
    with open(os.path.join(OUT_DIR, "osservazioni-rapporto.json"), "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=2)
    return rapporto, uscita


def main():
    parser = argparse.ArgumentParser(description="Tavola delle osservazioni squadra-gara")
    parser.add_argument("--limit", type=int, default=None)
    argomenti = parser.parse_args()

    rapporto, uscita = costruisci(argomenti.limit)
    print("gare: " + str(rapporto["gare"]))
    print("righe squadra-gara: " + str(rapporto["righe_squadra_gara"]))
    print("colonne metrica: " + str(rapporto["colonne_metrica"]))
    print("senza pannello: " + str(rapporto["gare_senza_pannello"]))
    print("senza chiave di join: " + str(rapporto["gare_senza_chiave_di_join"]))
    for classe in ("A", "B", "C", "D", "E"):
        quota = rapporto["quota_per_classe"][classe]
        print("  classe " + classe + ": " + str(rapporto["valori_per_classe"][classe])
              + " (" + str(round(quota * 100, 2)) + "%)")
    print("scritto: " + uscita)
    return 0


if __name__ == "__main__":
    sys.exit(main())
