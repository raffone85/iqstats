"""Costruisce il registro delle metriche e il registro dei target.

Entrambi derivano dalle misure prodotte da scan_archive.py, scan_entities.py e, per la
disciplina, da dataset/reconstruct_cards.py e dataset/verify_cards.py: nessun campo,
nessuna copertura e nessun campione sono scritti a mano.

Applica la politica di provenienza decisa dall'utente il 16 agosto 2026:

    A  osservato direttamente
    B  zero implicito verificato dalla struttura della fonte
    C  ricostruito deterministicamente da un'altra risorsa
    D  ambiguo
    E  mancante

Solo A, B e C entrano nei dataset validati.

Nessuna richiesta di rete. Sola lettura degli inventari.

Uso:
    .venv/Scripts/python.exe scripts/projection/discovery/build_registries.py
"""

import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
INV_CAMPI = os.path.join(os.path.dirname(__file__), "output", "inventario-campi.json")
INV_ENTITA = os.path.join(os.path.dirname(__file__), "output", "inventario-entita.json")
DATASET_OUT = os.path.join(ROOT, "scripts", "projection", "dataset", "output")
RAPPORTO_CARTELLINI = os.path.join(DATASET_OUT, "cartellini-rapporto.json")
VERIFICA_CARTELLINI = os.path.join(DATASET_OUT, "verifica-cartellini.json")
OUT_METRICHE = os.path.join(ROOT, "data", "registro-metriche.json")
OUT_TARGET = os.path.join(ROOT, "data", "registro-target.json")

VERSIONE_POLITICA = "2026-08-16.1"
MIN_PREVIOUS_MATCHES = 3

# Coppie verificate identiche su 2.685 confronti: si conserva il primo nome.
ALIAS = {
    "total_tackles": "tackles",
    "total_saves": "goalkeeper_saves",
}

# Campi ambigui: l'assenza esiste ma esistono anche gare con entrambe a zero,
# quindi l'assenza non e' leggibile come zero senza una ricostruzione.
# Per ognuno si dichiara da dove il valore puo' essere ricostruito, se possibile.
RICOSTRUZIONE = {
    "red_cards": "/events/{id}/incidents/ (card_type red e yellowRed, is_manager) "
                 "e /events/{id}/player-stats/ (red_card per giocatore)",
    "yellow_cards": "/events/{id}/incidents/ (card_type yellow, is_manager) "
                    "e /events/{id}/player-stats/ (yellow_card per giocatore)",
    "goalkeeper_saves": "/events/{id}/player-stats/ (saves per giocatore)",
    "offsides": "/events/{id}/player-stats/ (total_offside per giocatore)",
    "fouls": "/events/{id}/player-stats/ (fouls per giocatore)",
    "tackles": "/events/{id}/player-stats/ (total_tackle per giocatore)",
    "through_balls": None,
    "goals_prevented": "/events/{id}/player-stats/ (goals_prevented per giocatore)",
    "hit_woodwork": "/events/{id}/player-stats/ (hit_woodwork per giocatore)",
    "shots_inside_box": "/events/{id}/stats/ shotmap: i tiri entro 16,5 metri dalla porta",
    "shots_outside_box": "/events/{id}/stats/ shotmap: i tiri oltre 16,5 metri dalla porta",
}

# Metriche osservate solo durante la diretta: non sono statistiche di fine gara.
SOLO_LIVE = ("attack", "attack_pct", "ball_safe", "ball_safe_pct",
             "dangerous_attack", "dangerous_attack_pct")

# La disciplina non si legge piu' dal pannello ma dagli episodi, uno per uno.
# Le quattro nature restano separate per sempre: un rosso non diventa mai due gialli.
# I valori arrivano da scripts/projection/dataset/reconstruct_cards.py.
RICOSTRUITE = [
    {
        "nome_interno": "yellow_cards",
        "sorgente": "/events/{id}/incidents/ con card_type yellow, panchina esclusa",
        "descrizione": "ammonizione semplice, esclusa la seconda ammonizione",
        "natura": "conteggio",
    },
    {
        "nome_interno": "second_yellow_red",
        "sorgente": "/events/{id}/incidents/ con card_type yellowRed",
        "descrizione": "espulsione per seconda ammonizione, distinta dal rosso diretto",
        "natura": "conteggio",
    },
    {
        "nome_interno": "red_cards_direct",
        "sorgente": "/events/{id}/incidents/ con card_type red e is_manager falso",
        "descrizione": "espulsione diretta, esclusi i cartellini alla panchina",
        "natura": "conteggio",
    },
    {
        "nome_interno": "bench_cards",
        "sorgente": "/events/{id}/incidents/ con is_manager vero",
        "descrizione": "cartellini a panchina e staff, tenuti fuori dai conteggi di squadra",
        "natura": "conteggio",
    },
]

# I due conteggi aggregati del pannello escono dal registro: verify_cards.py ha misurato
# che comprendono entrambi la stessa seconda ammonizione, quindi sommarli conterebbe due
# volte lo stesso episodio. Al loro posto entrano le quattro nature separate.
SUPERATE = {
    "yellow_cards": (
        "il conteggio aggregato comprende anche la seconda ammonizione: sostituito dalla "
        "ammonizione semplice ricostruita dagli episodi"
    ),
    "red_cards": (
        "il conteggio aggregato comprende sia l'espulsione diretta sia la seconda "
        "ammonizione: sostituito da red_cards_direct e second_yellow_red"
    ),
}

# Un conteggio quasi sempre nullo non e' un bersaglio: senza abbastanza osservazioni
# diverse da zero non c'e' niente da prevedere.
OSSERVAZIONI_NON_NULLE_MINIME = 200

# Metrica derivata per il solo livello mercato. Non sostituisce e non modifica
# nessuna metrica osservata.
DERIVATE = [
    {
        "nome_interno": "card_points",
        "livello": "mercato",
        "definizione": "somma pesata dei cartellini di una squadra in una gara",
        "pesi_predefiniti": {
            "yellow_cards": 1,
            "second_yellow_red": 2,
            "red_cards_direct": 2,
            "bench_cards": 0,
        },
        "configurabile": True,
        "motivo_configurabilita": (
            "il conteggio di seconda ammonizione, rosso diretto e cartellini alla "
            "panchina cambia da un mercato all'altro"
        ),
        "vincolo": (
            "vive accanto alle metriche osservate e non le riscrive: gialli e rossi "
            "restano separati nel dataset statistico"
        ),
        "verifica_eseguita": (
            "misurato da scripts/projection/dataset/verify_cards.py: il conteggio "
            "aggregato del pannello comprende gia' la seconda ammonizione, e cosi' fa "
            "anche il conteggio aggregato dei rossi. I pesi qui sopra si applicano "
            "percio' alle quattro nature separate ricostruite dagli episodi, mai ai "
            "conteggi aggregati"
        ),
    },
]

# Soglie di ammissione a target, dichiarate qui e non sparse nel codice.
COPERTURA_MINIMA_TARGET = 0.60
LEGHE_MINIME_TARGET = 10


def carica(percorso):
    with open(percorso, "r", encoding="utf-8") as handle:
        return json.load(handle)


def riassunto_verifica():
    """L'esito del test del doppio conteggio, riportato con il campione su cui e' misurato."""
    if not os.path.isfile(VERIFICA_CARTELLINI):
        return {"eseguita": False}
    rapporto = carica(VERIFICA_CARTELLINI)
    riassunto = {
        "eseguita": True,
        "misurata_da": rapporto["generato_da"],
        "domanda": (
            "il conteggio aggregato del pannello comprende gia' la seconda ammonizione?"
        ),
    }
    for conteggio in ("gialli", "rossi"):
        blocco = rapporto[conteggio]
        asse = blocco["assi"]["seconda"]
        riassunto[conteggio] = {
            "lati_di_controllo": blocco["controllo"]["lati"],
            "accordo_di_controllo": blocco["controllo"]["accordo"],
            "lati_con_seconda_ammonizione": asse["lati"],
            "accordo_se_esclusa": asse["accordo_escluso"],
            "accordo_se_inclusa": asse["accordo_incluso"],
            "esito": asse["verdetto"],
        }
    return riassunto


def nome_normalizzato(nome):
    if nome in ALIAS:
        return ALIAS[nome]
    if nome.endswith(".actual"):
        return nome[: -len(".actual")]
    return nome.replace(".", "_")


def classifica_tipo(nome, riassunto):
    numerico = riassunto.get("numerico")
    if numerico is None:
        return "composito"
    if nome.endswith("_pct") or nome.endswith(".pct") or nome == "ball_possession":
        return "percentuale"
    tipi = riassunto.get("tipi") or {}
    principale = next(iter(tipi), "null")
    if principale == "float":
        return "continuo"
    return "conteggio"


def unita_di(nome, tipo):
    if tipo == "percentuale":
        return "percentuale 0-100"
    if nome.startswith("xg") or nome in ("expected_goals", "goals_prevented"):
        return "gol attesi"
    if tipo == "conteggio":
        return "eventi per squadra a gara"
    return None


def classe_provenienza(nome, assenza):
    if nome in ALIAS:
        return "A", "alias verificato di " + ALIAS[nome] + ", nessuna differenza su 2.685 confronti"
    if nome in SOLO_LIVE:
        return "D", "presente solo nelle gare con pannello in diretta"
    if assenza is None:
        return "A", "campo non soggetto all'omissione di riga"
    if assenza["riga_assente"] == 0:
        return "A", "riga sempre presente nel pannello completo"
    if assenza["assenza_significa_zero"]:
        return "B", "nessuna gara con entrambe a zero su " + str(assenza["riga_presente"]) + " righe presenti"
    if RICOSTRUZIONE.get(nome):
        return "C", "assenza ambigua, valore ricostruibile"
    return "D", "assenza ambigua e nessuna via di ricostruzione individuata"


def voci_ricostruite(cartellini, gare_pannello, gare_totali):
    """Le quattro nature della disciplina, con la copertura davvero misurata."""
    if not cartellini:
        return []

    distribuzioni = cartellini["distribuzioni"]
    gare_utili = cartellini["gare_ricostruite"]
    voci = []
    for definizione in RICOSTRUITE:
        nome = definizione["nome_interno"]
        distribuzione = dict(distribuzioni.get(nome) or {})
        osservazioni = distribuzione.pop("osservazioni", 0)
        non_nulle = round(osservazioni * (1 - (distribuzione.get("quota_zeri") or 0)))
        voci.append({
            "nome_fonte": None,
            "nome_interno": nome,
            "alias_di": None,
            "sorgente": definizione["sorgente"],
            "entita": "squadra-gara",
            "livello": "home e away, sempre simmetrico",
            "tipo": definizione["natura"],
            "unita": "eventi per squadra a gara",
            "provenienza": {
                "classe": "C",
                "motivo": "ricostruito episodio per episodio da " + definizione["sorgente"],
                "politica": VERSIONE_POLITICA,
                "ricostruzione": definizione["sorgente"],
            },
            "copertura": {
                "gare_con_pannello": gare_pannello,
                "gare_scansionate": gare_totali,
                "righe_presenti": gare_utili,
                "righe_assenti": gare_totali - gare_utili,
                "quota_assente": round((gare_totali - gare_utili) / gare_totali, 6),
                "gare_utili_dopo_politica": gare_utili,
                "leghe_coperte": cartellini["leghe_coperte"],
                "presenze_asimmetriche": 0,
            },
            "distribuzione": distribuzione or None,
            "disponibilita": {
                "storica": True,
                "pre_match": False,
                "post_match": True,
                "nota": "osservata a gara conclusa: entra nelle feature solo da gare precedenti",
            },
            "uso": {
                "come_feature": True,
                "come_target": (
                    cartellini["leghe_coperte"] >= LEGHE_MINIME_TARGET
                    and non_nulle >= OSSERVAZIONI_NON_NULLE_MINIME
                ),
                "subordinato_a_ricostruzione": False,
            },
            "descrizione": definizione["descrizione"],
            "osservazioni_non_nulle": non_nulle,
            "rischio_leakage": (
                "alto se letta sulla gara da prevedere; nullo se letta solo da gare "
                "con data anteriore al calcio d'inizio"
            ),
        })
    return voci


def costruisci_metriche(campi, entita, cartellini, verifica):
    inventario = campi["statistiche_squadra"]
    assenze = campi["analisi_assenze"]
    gare_pannello = campi["gare_con_pannello_completo"]
    gare_totali = campi["gare_scansionate"]
    intervallo = campi["intervallo_date"]

    voci = []
    for nome in sorted(inventario):
        if nome in SUPERATE:
            continue
        riassunto = inventario[nome]
        radice = nome.split(".")[0]
        assenza = assenze.get(radice if "." in nome else nome)
        tipo = classifica_tipo(nome, riassunto)
        classe, motivo = classe_provenienza(radice if "." in nome else nome, assenza)
        numerico = riassunto.get("numerico") or {}

        gare_utili = assenza["riga_presente"] if assenza else gare_pannello
        if classe == "B":
            gare_utili = gare_pannello

        voci.append({
            "nome_fonte": nome,
            "nome_interno": nome_normalizzato(nome),
            "alias_di": ALIAS.get(nome),
            "sorgente": "/events/{id}/stats/",
            "entita": "squadra-gara",
            "livello": "home e away, sempre simmetrico",
            "tipo": tipo,
            "unita": unita_di(nome, tipo),
            "provenienza": {
                "classe": classe,
                "motivo": motivo,
                "politica": VERSIONE_POLITICA,
                "ricostruzione": RICOSTRUZIONE.get(radice if "." in nome else nome),
            },
            "copertura": {
                "gare_con_pannello": gare_pannello,
                "gare_scansionate": gare_totali,
                "righe_presenti": assenza["riga_presente"] if assenza else None,
                "righe_assenti": assenza["riga_assente"] if assenza else None,
                "quota_assente": assenza["quota_assente"] if assenza else None,
                "gare_utili_dopo_politica": gare_utili,
                "leghe_coperte": riassunto["leghe_coperte"],
                "presenze_asimmetriche": assenza["presenze_asimmetriche"] if assenza else 0,
            },
            "distribuzione": {
                "media": numerico.get("media"),
                "sd": numerico.get("sd"),
                "dispersione": numerico.get("dispersione"),
                "min": numerico.get("min"),
                "max": numerico.get("max"),
                "quota_zeri": numerico.get("quota_zeri"),
            } if numerico else None,
            "disponibilita": {
                "storica": True,
                "pre_match": False,
                "post_match": True,
                "nota": "osservata a gara conclusa: entra nelle feature solo da gare precedenti",
            },
            "uso": {
                "come_feature": classe in ("A", "B", "C") and nome not in ALIAS,
                "come_target": (
                    classe in ("A", "B", "C")
                    and nome not in ALIAS
                    and tipo != "composito"
                    and nome not in SOLO_LIVE
                    and riassunto["leghe_coperte"] >= LEGHE_MINIME_TARGET
                    and (
                        (gare_utili / gare_pannello) >= COPERTURA_MINIMA_TARGET
                        or classe == "C"
                    )
                ),
                "subordinato_a_ricostruzione": (
                    classe == "C"
                    and (gare_utili / gare_pannello) < COPERTURA_MINIMA_TARGET
                ),
            },
            "rischio_leakage": (
                "alto se letta sulla gara da prevedere; nullo se letta solo da gare "
                "con data anteriore al calcio d'inizio"
            ),
        })

    return {
        "schema": "registro-metriche/1",
        "generato_da": "scripts/projection/discovery/build_registries.py",
        "politica_provenienza": {
            "versione": VERSIONE_POLITICA,
            "classi": {
                "A": "osservato direttamente",
                "B": "zero implicito verificato dalla struttura della fonte",
                "C": "ricostruito deterministicamente da un'altra risorsa",
                "D": "ambiguo",
                "E": "mancante",
            },
            "ammesse_nei_dataset_validati": ["A", "B", "C"],
            "regola_pannello": (
                "una riga statistica compare per entrambe le squadre o per nessuna: "
                "verificato su " + str(gare_pannello) + " gare senza una sola presenza asimmetrica"
            ),
            "gare_senza_pannello": gare_totali - gare_pannello,
            "trattamento_gare_senza_pannello": "classe E, restano null e non diventano mai zero",
            "min_previous_matches": MIN_PREVIOUS_MATCHES,
        },
        "campione": {
            "gare": gare_totali,
            "gare_con_pannello_completo": gare_pannello,
            "leghe": campi["leghe"],
            "data_minima": intervallo["da"],
            "data_massima": intervallo["a"],
            "tiri_mappati": campi["volumi"]["tiri_totali"],
        },
        "altre_risorse": sorted(entita.get("campioni_api", {}).keys()),
        "metriche": voci + voci_ricostruite(cartellini, gare_pannello, gare_totali),
        "superate_dalla_ricostruzione": [
            {"nome_fonte": nome, "motivo": motivo} for nome, motivo in sorted(SUPERATE.items())
        ],
        "verifica_doppio_conteggio": verifica,
        "derivate": DERIVATE,
    }


def modelli_candidati(tipo):
    if tipo == "conteggio":
        return ["poisson", "binomiale_negativa", "regressione_regolarizzata", "gradient_boosting"]
    if tipo == "percentuale":
        return ["regressione_su_logit", "beta", "gradient_boosting"]
    return ["regressione_regolarizzata", "gradient_boosting"]


def costruisci_target(registro):
    baseline = [
        "media_di_lega",
        "media_di_squadra_stagione",
        "media_di_squadra_casa_trasferta",
        "media_mobile_recente",
        "attacco_contro_concesso_avversario",
        "restringimento_verso_la_media_di_lega",
    ]
    voci = []
    for metrica in registro["metriche"]:
        if not metrica["uso"]["come_target"]:
            continue
        tipo = metrica["tipo"]
        voci.append({
            "target": metrica["nome_interno"],
            "nome_fonte": metrica["nome_fonte"],
            "sorgente": metrica["sorgente"],
            "entita": metrica["entita"],
            "natura": tipo,
            "copertura_storica": {
                "gare_utili": metrica["copertura"]["gare_utili_dopo_politica"],
                "quota_sul_pannello": round(
                    metrica["copertura"]["gare_utili_dopo_politica"]
                    / registro["campione"]["gare_con_pannello_completo"], 4
                ),
                "leghe": metrica["copertura"]["leghe_coperte"],
                "osservazioni_squadra_gara": metrica["copertura"]["gare_utili_dopo_politica"] * 2,
            },
            "provenienza_ammessa": metrica["provenienza"]["classe"],
            "quota_assente": metrica["copertura"]["quota_assente"],
            "baseline_obbligatorie": baseline,
            "modelli_candidati": modelli_candidati(tipo),
            "metrica_di_valutazione": ["mae", "rmse", "bias", "errore_mediano_assoluto",
                                       "copertura_intervallo"],
            "validazione": "walk-forward per date intere, mai split casuale",
            "min_previous_matches": MIN_PREVIOUS_MATCHES,
            "subordinato_a_ricostruzione": metrica["uso"]["subordinato_a_ricostruzione"],
            "ricostruzione": metrica["provenienza"]["ricostruzione"],
            "idoneita_produzione": (
                "subordinata alla ricostruzione, poi da validare"
                if metrica["uso"]["subordinato_a_ricostruzione"]
                else "da validare"
            ),
            "fallback": [
                "modello del target con meno feature",
                "baseline attacco contro concesso avversario",
                "restringimento verso la media di lega",
                "nessuna previsione se l'incertezza resta eccessiva",
            ],
        })
    return {
        "schema": "registro-target/1",
        "generato_da": "scripts/projection/discovery/build_registries.py",
        "politica_provenienza": registro["politica_provenienza"]["versione"],
        "campione": registro["campione"],
        "nota_idoneita": (
            "nessun target e' idoneo alla produzione prima di aver battuto le baseline "
            "fuori campione e di aver superato il test di parita' numerica fra Python e TypeScript"
        ),
        "target": voci,
        "derivate_di_mercato": registro["derivate"],
    }


def main():
    if not os.path.isfile(INV_CAMPI) or not os.path.isfile(INV_ENTITA):
        print("inventari mancanti: eseguire prima scan_archive.py e scan_entities.py")
        return 1

    campi = carica(INV_CAMPI)
    entita = carica(INV_ENTITA)
    cartellini = carica(RAPPORTO_CARTELLINI) if os.path.isfile(RAPPORTO_CARTELLINI) else None
    verifica = riassunto_verifica()
    if cartellini is None:
        print("ricostruzione dei cartellini assente: eseguire prima reconstruct_cards.py")
        return 1

    registro = costruisci_metriche(campi, entita, cartellini, verifica)
    target = costruisci_target(registro)

    os.makedirs(os.path.dirname(OUT_METRICHE), exist_ok=True)
    with open(OUT_METRICHE, "w", encoding="utf-8") as handle:
        json.dump(registro, handle, ensure_ascii=False, indent=2)
    with open(OUT_TARGET, "w", encoding="utf-8") as handle:
        json.dump(target, handle, ensure_ascii=False, indent=2)

    conteggio = {}
    for voce in registro["metriche"]:
        classe = voce["provenienza"]["classe"]
        conteggio[classe] = conteggio.get(classe, 0) + 1

    print("metriche registrate: " + str(len(registro["metriche"])))
    for classe in sorted(conteggio):
        print("  classe " + classe + ": " + str(conteggio[classe]))
    print("target ammessi: " + str(len(target["target"])))
    print("scritto: " + OUT_METRICHE)
    print("scritto: " + OUT_TARGET)
    return 0


if __name__ == "__main__":
    sys.exit(main())
