"""Costruisce, per un target, il dataset «al momento di» con le sue baseline.

Regola non negoziabile: ogni feature di una riga usa soltanto gare con calcio d'inizio
anteriore a quello della gara da prevedere. Il valore osservato in quella gara e' il
bersaglio e non entra mai fra gli ingressi.

Entrano nella storia soltanto i valori con provenienza A, B o C. Un valore ambiguo o
mancante non contribuisce e non viene sostituito: riduce il campione, che viene
dichiarato riga per riga.

Nessuna media mescola due stagioni. Le aggregazioni di stagione, di lato e di lega sono
calcolate dentro la stagione; gli orizzonti «ultime N gare» attraversano il confine ma
lo dichiarano nel nome, come previsto dal metodo.

MIN_PREVIOUS_MATCHES = 3: si prevede dalla quarta gara di stagione di ciascuna squadra.
Tre e' il minimo, non una finestra massima.

Il profilo dell'arbitro si costruisce in due modi, e la differenza e' di metodo:

    puro            la media esiste solo dove l'arbitro ha uno storico; dove manca,
                    la feature manca. Serve a misurare che cosa aggiunge l'arbitro
                    su un campione che lo conosce davvero.
    restringimento  la media si avvicina a quella di lega quanto piu' lo storico e'
                    povero, con un peso che dipende solo dal campione. Serve alla
                    previsione, che non puo' rifiutarsi di rispondere.

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/dataset/build_features.py --target corner_kicks
    .venv/Scripts/python.exe scripts/projection/dataset/build_features.py --target yellow_cards --arbitro restringimento
"""

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OSSERVAZIONI = os.path.join(os.path.dirname(__file__), "output", "osservazioni.csv")
GIOCATORI = os.path.join(os.path.dirname(__file__), "output", "giocatori.csv")
TIRI = os.path.join(os.path.dirname(__file__), "output", "tiri.csv")
REGISTRO_TARGET = os.path.join(ROOT, "data", "registro-target.json")
OUT_DIR = os.path.join(os.path.dirname(__file__), "output", "features")

MIN_PREVIOUS_MATCHES = 3
ORIZZONTI = (3, 5, 10)
PROVENIENZE_AMMESSE = ("A", "B", "C")
MEZZA_VITA_EWMA = 4
FORZA_RESTRINGIMENTO = 5.0  # gare equivalenti di prior di lega
GIORNI_CONGESTIONE = 14

# Chiavi di contesto che esistono prima del calcio d'inizio, piu' i gol, che non
# esistono e servono solo a ricostruire la classifica da gare anteriori.
COLONNE_CONTESTO = ("referee_id", "venue_id", "round_number", "derby",
                    "gol_fatti", "gol_subiti")

# Conteggi che descrivono la severita' di un arbitro. Servono a ogni target, anche
# quando il bersaglio e' un'altra metrica.
SEVERITA = ("fouls", "yellow_cards", "red_cards_direct", "second_yellow_red")

# Grandezze del profilo dell'arbitro: colonna della tavola, nome nel profilo.
CAMPI_ARBITRO = (("valore_noto", "prodotto"), ("sev_fouls", "falli"),
                 ("sev_yellow_cards", "ammoniti"), ("sev_espulsioni", "espulsioni"))


def media_precedente(serie, finestra=None):
    precedenti = serie.shift(1)
    if finestra is None:
        return precedenti.expanding(min_periods=1).mean()
    return precedenti.rolling(finestra, min_periods=1).mean()


def sd_precedente(serie, finestra=None):
    precedenti = serie.shift(1)
    if finestra is None:
        return precedenti.expanding(min_periods=1).std(ddof=0)
    return precedenti.rolling(finestra, min_periods=1).std(ddof=0)


def campione_precedente(serie, finestra=None):
    precedenti = serie.shift(1)
    if finestra is None:
        return precedenti.expanding(min_periods=1).count()
    return precedenti.rolling(finestra, min_periods=1).count()


def normalizza_severita(tavola):
    """I conteggi che descrivono l'arbitro, con la stessa politica di provenienza.

    Si normalizzano prima di rinominare il bersaglio: quando il target e' esso stesso
    uno di questi conteggi, la colonna originale sparisce subito dopo.
    """
    for nome in ("fouls", "yellow_cards"):
        valore = pd.to_numeric(tavola[nome], errors="coerce")
        noto = tavola[nome + "__p"].isin(PROVENIENZE_AMMESSE) & valore.notna()
        tavola["sev_" + nome] = valore.where(noto)

    diretti = pd.to_numeric(tavola["red_cards_direct"], errors="coerce")
    seconde = pd.to_numeric(tavola["second_yellow_red"], errors="coerce")
    noti = (
        tavola["red_cards_direct__p"].isin(PROVENIENZE_AMMESSE)
        & tavola["second_yellow_red__p"].isin(PROVENIENZE_AMMESSE)
        & diretti.notna() & seconde.notna()
    )
    tavola["sev_espulsioni"] = (diretti + seconde).where(noti)
    return tavola


def normalizza_esito(tavola):
    """Punti e reti della gara: osservati a fine gara, usati solo da gare anteriori."""
    fatti = pd.to_numeric(tavola["gol_fatti"], errors="coerce")
    subiti = pd.to_numeric(tavola["gol_subiti"], errors="coerce")
    noti = fatti.notna() & subiti.notna()
    tavola["reti_fatte"] = fatti.where(noti)
    tavola["reti_subite"] = subiti.where(noti)
    punti = pd.Series(np.where(fatti > subiti, 3.0, np.where(fatti == subiti, 1.0, 0.0)),
                      index=tavola.index)
    tavola["punti"] = punti.where(noti)
    return tavola


def carica_osservazioni(target):
    colonne = [
        "event_id", "league_id", "season_id", "data", "calcio_dinizio",
        "lato", "team_id", "opponent_id", "coach_id", "opponent_coach_id",
        "pannello", target, target + "__p",
    ]
    colonne.extend(COLONNE_CONTESTO)
    for nome in SEVERITA:
        colonne.extend((nome, nome + "__p"))
    tavola = pd.read_csv(OSSERVAZIONI, usecols=list(dict.fromkeys(colonne)), low_memory=False)

    tavola = normalizza_severita(tavola)
    tavola = normalizza_esito(tavola)
    tavola = tavola.rename(columns={target: "valore", target + "__p": "provenienza"})

    quando = tavola["calcio_dinizio"].fillna(tavola["data"])
    tavola["quando"] = pd.to_datetime(quando, errors="coerce", utc=True, format="mixed")
    tavola["valore"] = pd.to_numeric(tavola["valore"], errors="coerce")

    noto = tavola["provenienza"].isin(PROVENIENZE_AMMESSE) & tavola["valore"].notna()
    tavola["valore_noto"] = tavola["valore"].where(noto)
    return tavola


def aggiungi_concesso(tavola):
    """Per ogni riga, il valore dell'altra squadra nella stessa gara."""
    coppia = tavola[["event_id", "lato", "valore_noto"]].copy()
    coppia["lato"] = coppia["lato"].map({"home": "away", "away": "home"})
    coppia = coppia.rename(columns={"valore_noto": "concesso"})
    return tavola.merge(coppia, on=["event_id", "lato"], how="left")


def feature_di_squadra(tavola):
    """Orizzonti mobili: attraversano la stagione e lo dichiarano nel nome."""
    tavola = tavola.sort_values(["team_id", "quando", "event_id"]).copy()
    per_squadra = tavola.groupby("team_id", sort=False)

    for orizzonte in ORIZZONTI:
        etichetta = "ultime" + str(orizzonte)
        tavola["prodotto_" + etichetta + "_media"] = per_squadra["valore_noto"].transform(
            media_precedente, orizzonte)
        tavola["prodotto_" + etichetta + "_sd"] = per_squadra["valore_noto"].transform(
            sd_precedente, orizzonte)
        tavola["prodotto_" + etichetta + "_campione"] = per_squadra["valore_noto"].transform(
            campione_precedente, orizzonte)
        tavola["concesso_" + etichetta + "_media"] = per_squadra["concesso"].transform(
            media_precedente, orizzonte)

    tavola["prodotto_ewma"] = per_squadra["valore_noto"].transform(
        lambda serie: serie.shift(1).ewm(halflife=MEZZA_VITA_EWMA, min_periods=1).mean())
    tavola["concesso_ewma"] = per_squadra["concesso"].transform(
        lambda serie: serie.shift(1).ewm(halflife=MEZZA_VITA_EWMA, min_periods=1).mean())
    tavola["giorni_di_riposo"] = per_squadra["quando"].transform(
        lambda serie: serie.diff().dt.total_seconds() / 86400.0)
    return tavola


def feature_di_stagione(tavola):
    """Aggregazioni di stagione: mai attraverso il confine di stagione."""
    tavola = tavola.sort_values(["team_id", "season_id", "quando", "event_id"]).copy()
    per_stagione = tavola.groupby(["team_id", "season_id"], sort=False, dropna=False)

    tavola["prodotto_stagione_media"] = per_stagione["valore_noto"].transform(media_precedente)
    tavola["prodotto_stagione_sd"] = per_stagione["valore_noto"].transform(sd_precedente)
    tavola["prodotto_stagione_campione"] = per_stagione["valore_noto"].transform(
        campione_precedente)
    tavola["concesso_stagione_media"] = per_stagione["concesso"].transform(media_precedente)
    tavola["gare_precedenti"] = per_stagione.cumcount()

    per_lato = tavola.sort_values(
        ["team_id", "season_id", "lato", "quando", "event_id"]
    ).groupby(["team_id", "season_id", "lato"], sort=False, dropna=False)
    tavola["prodotto_lato_media"] = per_lato["valore_noto"].transform(media_precedente)
    tavola["prodotto_lato_campione"] = per_lato["valore_noto"].transform(campione_precedente)
    tavola["concesso_lato_media"] = per_lato["concesso"].transform(media_precedente)
    return tavola


def feature_di_lega(tavola):
    """Media di lega al momento, dentro la stagione e separata per lato."""
    ordinata = tavola.sort_values(["league_id", "season_id", "lato", "quando", "event_id"])
    per_lato = ordinata.groupby(["league_id", "season_id", "lato"], sort=False, dropna=False)
    tavola["lega_lato_media"] = per_lato["valore_noto"].transform(media_precedente)
    tavola["lega_lato_campione"] = per_lato["valore_noto"].transform(campione_precedente)

    ordinata = tavola.sort_values(["league_id", "season_id", "quando", "event_id"])
    per_lega = ordinata.groupby(["league_id", "season_id"], sort=False, dropna=False)
    tavola["lega_media"] = per_lega["valore_noto"].transform(media_precedente)
    tavola["lega_sd"] = per_lega["valore_noto"].transform(sd_precedente)
    return tavola


DA_AVVERSARIO = (
    "prodotto_ultime3_media", "prodotto_ultime5_media", "prodotto_ultime10_media",
    "prodotto_stagione_media", "prodotto_ewma", "prodotto_lato_media",
    "concesso_ultime3_media", "concesso_ultime5_media", "concesso_ultime10_media",
    "concesso_stagione_media", "concesso_ewma", "concesso_lato_media",
    "gare_precedenti", "giorni_di_riposo",
)


def aggiungi_avversario(tavola):
    """Aggancia alla riga di una squadra il profilo dell'avversario di quella gara."""
    altro = tavola[["event_id", "lato"] + list(DA_AVVERSARIO)].copy()
    altro["lato"] = altro["lato"].map({"home": "away", "away": "home"})
    altro = altro.rename(columns={nome: "avv_" + nome for nome in DA_AVVERSARIO})
    return tavola.merge(altro, on=["event_id", "lato"], how="left")


def aggiungi_scarti(tavola):
    """Forza relativa rispetto alla lega, e confronto diretto fra le due squadre."""
    lega = tavola["lega_lato_media"]
    with np.errstate(divide="ignore", invalid="ignore"):
        tavola["forza_attacco"] = tavola["prodotto_lato_media"] / lega
        tavola["debolezza_difesa_avversario"] = tavola["avv_concesso_lato_media"] / lega
    tavola["scarto_dalla_lega"] = tavola["prodotto_lato_media"] - lega
    tavola["zeta_dalla_lega"] = (
        (tavola["prodotto_stagione_media"] - tavola["lega_media"]) / tavola["lega_sd"]
    ).replace([np.inf, -np.inf], np.nan)
    tavola["confronto_produce_meno_concede"] = (
        tavola["prodotto_ultime5_media"] - tavola["avv_concesso_ultime5_media"]
    )
    return tavola


def aggiungi_baseline(tavola):
    """Le sei baseline obbligatorie, su sola informazione anteriore."""
    lega = tavola["lega_lato_media"]

    tavola["baseline_lega"] = lega
    tavola["baseline_squadra_stagione"] = tavola["prodotto_stagione_media"]
    tavola["baseline_squadra_lato"] = tavola["prodotto_lato_media"]
    tavola["baseline_media_mobile"] = tavola["prodotto_ultime5_media"]

    attacco = tavola["prodotto_lato_media"].fillna(tavola["prodotto_stagione_media"])
    concesso = tavola["avv_concesso_lato_media"].fillna(tavola["avv_concesso_stagione_media"])
    with np.errstate(divide="ignore", invalid="ignore"):
        tavola["baseline_attacco_contro_concesso"] = (
            lega * (attacco / lega) * (concesso / lega)
        ).replace([np.inf, -np.inf], np.nan)

    campione = tavola["prodotto_stagione_campione"].fillna(0)
    peso = campione / (campione + FORZA_RESTRINGIMENTO)
    tavola["baseline_restringimento"] = (
        peso * tavola["prodotto_stagione_media"].fillna(lega) + (1 - peso) * lega
    )
    return tavola


def riferimenti_di_lega(tavola):
    """Media di lega «al momento di» delle grandezze che descrivono l'arbitro.

    Non sono feature: sono il termine di paragone della severita' e il prior verso cui
    un profilo con poco storico viene ristretto.
    """
    ordinata = tavola.sort_values(["league_id", "season_id", "quando", "event_id"])
    per_lega = ordinata.groupby(["league_id", "season_id"], sort=False, dropna=False)
    for colonna, etichetta in CAMPI_ARBITRO:
        if etichetta == "prodotto":
            continue  # gia' calcolata come lega_media
        tavola["rif_lega_" + etichetta] = per_lega[colonna].transform(media_precedente)
    return tavola


def profilo_arbitro(tavola):
    """Medie dell'arbitro «al momento di», calcolate per gara e non per riga.

    Le due righe di una gara condividono l'arbitro: una media spostata di una riga
    lascerebbe entrare il lato gemello della gara stessa. Si aggrega per gara, si
    sposta di una gara, e solo dopo si aggancia alle due righe.
    """
    colonne = ["event_id", "referee_id", "quando", "lato"] + [nome for nome, _ in CAMPI_ARBITRO]
    gare = tavola.loc[tavola["referee_id"].notna(), colonne]
    casa = gare[gare["lato"] == "home"].drop_duplicates("event_id").set_index("event_id")
    via = gare[gare["lato"] == "away"].drop_duplicates("event_id").set_index("event_id")
    via = via.reindex(casa.index)

    per_gara = casa[["referee_id", "quando"]].copy()
    for nome, etichetta in CAMPI_ARBITRO:
        per_gara[etichetta + "_casa"] = casa[nome]
        per_gara[etichetta + "_via"] = via[nome]
        per_gara[etichetta + "_gara"] = per_gara[
            [etichetta + "_casa", etichetta + "_via"]].mean(axis=1)

    per_gara = per_gara.reset_index().sort_values(["referee_id", "quando", "event_id"])
    per_arbitro = per_gara.groupby("referee_id", sort=False)

    per_gara["arbitro_campione"] = per_arbitro["prodotto_gara"].transform(campione_precedente)
    per_gara["arbitro_gare_viste"] = per_arbitro.cumcount()
    for _, etichetta in CAMPI_ARBITRO:
        per_gara["arbitro_" + etichetta + "_media"] = per_arbitro[
            etichetta + "_gara"].transform(media_precedente)
    per_gara["arbitro_prodotto_sd"] = per_arbitro["prodotto_gara"].transform(sd_precedente)
    per_gara["arbitro_prodotto_ewma"] = per_arbitro["prodotto_gara"].transform(
        lambda serie: serie.shift(1).ewm(halflife=MEZZA_VITA_EWMA, min_periods=1).mean())
    per_gara["arbitro_casa_media"] = per_arbitro["prodotto_casa"].transform(media_precedente)
    per_gara["arbitro_via_media"] = per_arbitro["prodotto_via"].transform(media_precedente)

    da_agganciare = ["event_id", "arbitro_campione", "arbitro_gare_viste",
                     "arbitro_prodotto_sd", "arbitro_prodotto_ewma",
                     "arbitro_casa_media", "arbitro_via_media"]
    da_agganciare += ["arbitro_" + etichetta + "_media" for _, etichetta in CAMPI_ARBITRO]
    tavola = tavola.merge(per_gara[da_agganciare], on="event_id", how="left")

    tavola["arbitro_prodotto_lato_media"] = np.where(
        tavola["lato"] == "home", tavola["arbitro_casa_media"], tavola["arbitro_via_media"])
    tavola["arbitro_disponibile"] = tavola["referee_id"].notna().astype(float)
    tavola["arbitro_qualita_storia"] = (
        tavola["arbitro_campione"] / tavola["arbitro_gare_viste"]
    ).replace([np.inf, -np.inf], np.nan)
    return tavola.drop(columns=["arbitro_casa_media", "arbitro_via_media"])


def derivati_arbitro(tavola):
    """Rapporti e scarti del profilo: si ricalcolano dopo un eventuale restringimento."""
    with np.errstate(divide="ignore", invalid="ignore"):
        tavola["arbitro_cartellini_per_fallo"] = (
            tavola["arbitro_ammoniti_media"] / tavola["arbitro_falli_media"]
        ).replace([np.inf, -np.inf], np.nan)
    tavola["arbitro_scarto_dalla_lega"] = tavola["arbitro_prodotto_media"] - tavola["lega_media"]
    tavola["arbitro_severita_ammoniti"] = (
        tavola["arbitro_ammoniti_media"] - tavola["rif_lega_ammoniti"])
    tavola["arbitro_severita_falli"] = (
        tavola["arbitro_falli_media"] - tavola["rif_lega_falli"])
    return tavola


def restringi_arbitro(tavola, forza):
    """Il profilo con poco storico si avvicina alla media di lega «al momento di».

    Il peso dipende soltanto dal campione: nessun valore inventato e nessun peso fissato
    a mano oltre alla forza del prior, che resta un parametro da validare in backtest.
    Un arbitro assente non diventa un arbitro medio in silenzio: `arbitro_disponibile`
    e `arbitro_campione` restano nel record e dichiarano quanto profilo c'era.
    """
    campione = tavola["arbitro_campione"].fillna(0.0)
    peso = campione / (campione + forza)
    riferimenti = (
        ("arbitro_prodotto_media", "lega_media"),
        ("arbitro_prodotto_lato_media", "lega_lato_media"),
        ("arbitro_prodotto_ewma", "lega_media"),
        ("arbitro_falli_media", "rif_lega_falli"),
        ("arbitro_ammoniti_media", "rif_lega_ammoniti"),
        ("arbitro_espulsioni_media", "rif_lega_espulsioni"),
    )
    for colonna, riferimento in riferimenti:
        prior = tavola[riferimento]
        tavola[colonna] = peso * tavola[colonna].fillna(prior) + (1.0 - peso) * prior

    tavola["arbitro_campione"] = campione
    tavola["arbitro_qualita_storia"] = tavola["arbitro_qualita_storia"].fillna(0.0)
    tavola["arbitro_prodotto_sd"] = tavola["arbitro_prodotto_sd"].fillna(tavola["lega_sd"])
    return tavola


def profilo_allenatore(tavola):
    """L'allenatore ha una riga sola per gara: il calcolo puo' stare sulla riga."""
    ordinata = tavola.sort_values(["coach_id", "quando", "event_id"])
    per_allenatore = ordinata.groupby("coach_id", sort=False)

    tavola["allenatore_prodotto_media"] = per_allenatore["valore_noto"].transform(
        media_precedente)
    tavola["allenatore_concesso_media"] = per_allenatore["concesso"].transform(
        media_precedente)
    tavola["allenatore_campione"] = per_allenatore["valore_noto"].transform(
        campione_precedente)
    tavola["allenatore_prodotto_ewma"] = per_allenatore["valore_noto"].transform(
        lambda serie: serie.shift(1).ewm(halflife=MEZZA_VITA_EWMA, min_periods=1).mean())

    con_la_squadra = tavola.sort_values(
        ["coach_id", "team_id", "quando", "event_id"]
    ).groupby(["coach_id", "team_id"], sort=False)
    tavola["allenatore_gare_con_la_squadra"] = con_la_squadra.cumcount()
    tavola["allenatore_disponibile"] = tavola["coach_id"].notna().astype(float)
    return tavola


def feature_di_congestione(tavola, giorni):
    """Quante gare ha gia' giocato la squadra nei giorni immediatamente precedenti."""
    valori = pd.Series(np.nan, index=tavola.index, dtype=float)
    limite = pd.Timedelta(days=giorni)
    con_data = tavola[tavola["quando"].notna() & tavola["team_id"].notna()]
    for _, gruppo in con_data.groupby("team_id", sort=False):
        ordinata = gruppo.sort_values(["quando", "event_id"])
        istanti = ordinata["quando"].to_numpy()
        prima = np.searchsorted(istanti, istanti - limite, side="left")
        valori.loc[ordinata.index] = np.arange(len(istanti)) - prima
    return valori


def feature_di_contesto(tavola):
    """Solo cio' che esiste prima del calcio d'inizio e che l'archivio copre davvero.

    Meteo, condizione del terreno e distanza di viaggio esistono soltanto dalla meta'
    di aprile 2026: sono un campo nuovo, non un campo sparso, e non sono addestrabili.
    Campo neutro e' falso in tutto l'archivio: e' una costante, non una feature.
    """
    tavola["contesto_turno"] = pd.to_numeric(tavola["round_number"], errors="coerce")
    tavola["contesto_derby"] = pd.to_numeric(tavola["derby"], errors="coerce")
    tavola["contesto_gare_recenti"] = feature_di_congestione(tavola, GIORNI_CONGESTIONE)
    return tavola


def feature_di_classifica(tavola):
    """Punti e reti accumulati nella stagione prima di questa gara."""
    ordinata = tavola.sort_values(["team_id", "season_id", "quando", "event_id"])
    per_stagione = ordinata.groupby(["team_id", "season_id"], sort=False, dropna=False)

    tavola["classifica_punti_media"] = per_stagione["punti"].transform(media_precedente)
    tavola["classifica_reti_fatte_media"] = per_stagione["reti_fatte"].transform(
        media_precedente)
    tavola["classifica_reti_subite_media"] = per_stagione["reti_subite"].transform(
        media_precedente)
    tavola["classifica_differenza_media"] = (
        tavola["classifica_reti_fatte_media"] - tavola["classifica_reti_subite_media"])

    altro = tavola[["event_id", "lato", "classifica_punti_media",
                    "classifica_differenza_media"]].copy()
    altro["lato"] = altro["lato"].map({"home": "away", "away": "home"})
    altro = altro.rename(columns={
        "classifica_punti_media": "altrui_punti",
        "classifica_differenza_media": "altrui_differenza",
    })
    tavola = tavola.merge(altro, on=["event_id", "lato"], how="left")
    tavola["classifica_delta_punti"] = tavola["classifica_punti_media"] - tavola["altrui_punti"]
    tavola["classifica_delta_differenza"] = (
        tavola["classifica_differenza_media"] - tavola["altrui_differenza"])
    return tavola.drop(columns=["altrui_punti", "altrui_differenza"])


def feature_di_interazione(tavola):
    """Il lato del campo moltiplicato per cio' che lo rende diverso.

    Un modello lineare non puo' inventare un prodotto: sa che in casa si commettono in
    media meno falli, perche' le medie di lega sono per lato, ma non puo' sapere che
    quel vantaggio e' piu' grande per le squadre forti se nessuno glielo scrive.

    Misurato sull'archivio, 472 squadre-stagione: lo scostamento personale dall'effetto
    casa della lega non e' ripetibile — sui falli la sua dispersione e' perfino minore di
    quella che il caso produce da solo. Ma l'effetto casa **cresce con la forza**: sugli
    ammoniti va da 0,127 delle squadre deboli a 0,395 delle forti, e la correlazione con
    i punti per gara e' -0,243. Quello e' un parametro solo, non uno per squadra, e si
    puo' stimare.
    """
    casa = (tavola["lato"] == "home").astype(float)
    tavola["interazione_casa"] = casa
    tavola["interazione_casa_delta_punti"] = casa * tavola["classifica_delta_punti"]
    tavola["interazione_casa_scarto_dalla_lega"] = casa * (
        tavola["prodotto_stagione_media"] - tavola["lega_media"])
    tavola["interazione_casa_severita_arbitro"] = casa * tavola["arbitro_severita_ammoniti"]
    return tavola


def feature_di_rosa(tavola):
    """Aggancia gli aggregati di rosa, gia' calcolati sulle sole gare precedenti."""
    if not os.path.isfile(GIOCATORI):
        return tavola
    rosa = pd.read_csv(GIOCATORI, low_memory=False)
    rosa = rosa.drop(columns=["lato"])
    rosa["event_id"] = pd.to_numeric(rosa["event_id"], errors="coerce")
    rosa["team_id"] = pd.to_numeric(rosa["team_id"], errors="coerce").astype(float)
    tavola["team_id"] = pd.to_numeric(tavola["team_id"], errors="coerce").astype(float)
    tavola["event_id"] = pd.to_numeric(tavola["event_id"], errors="coerce")
    return tavola.merge(rosa, on=["event_id", "team_id"], how="left")


def feature_spaziali(tavola):
    """Medie «al momento di» del profilo spaziale, prodotto e concesso.

    Le colonne grezze descrivono la gara stessa: si usano per costruire la storia e poi
    escono dalla tavola. Nessuna di esse deve sopravvivere fino al dataset.
    """
    if not os.path.isfile(TIRI):
        return tavola
    tiri = pd.read_csv(TIRI, low_memory=False)
    tiri["event_id"] = pd.to_numeric(tiri["event_id"], errors="coerce")
    grezze = [nome for nome in tiri.columns if nome.startswith("tiro_")]

    subito = tiri.copy()
    subito["lato"] = subito["lato"].map({"home": "away", "away": "home"})
    subito = subito.rename(columns={nome: nome + "__subito" for nome in grezze})

    tavola = tavola.merge(tiri, on=["event_id", "lato"], how="left")
    tavola = tavola.merge(subito, on=["event_id", "lato"], how="left")

    ordinata = tavola.sort_values(["team_id", "season_id", "quando", "event_id"])
    per_stagione = ordinata.groupby(["team_id", "season_id"], sort=False, dropna=False)
    for nome in grezze:
        etichetta = "spaziale_" + nome[len("tiro_"):]
        tavola[etichetta] = per_stagione[nome].transform(media_precedente)
        tavola[etichetta + "_concesso"] = per_stagione[nome + "__subito"].transform(
            media_precedente)
    return tavola.drop(columns=grezze + [nome + "__subito" for nome in grezze])


PREFISSI_FEATURE = ("prodotto_", "concesso_", "lega_", "avv_", "baseline_",
                    "giorni_", "gare_", "forza_", "debolezza_", "scarto_",
                    "zeta_", "confronto_", "arbitro_", "allenatore_",
                    "contesto_", "classifica_", "giocatori_", "spaziale_",
                    "interazione_")


def controlli_contaminazione(tavola, arbitro):
    """Verifiche che devono passare prima che il dataset sia utilizzabile."""
    esiti = {}
    esiti["righe_duplicate"] = int(tavola.duplicated(subset=["event_id", "lato"]).sum())

    colonne = [nome for nome in tavola.columns if nome.startswith(PREFISSI_FEATURE)]
    sospette = []
    bersaglio = tavola["valore_noto"]
    for colonna in colonne:
        valori = pd.to_numeric(tavola[colonna], errors="coerce")
        entrambi = valori.notna() & bersaglio.notna()
        if int(entrambi.sum()) < 50:
            continue
        quota = float(np.isclose(valori[entrambi], bersaglio[entrambi]).mean())
        if quota > 0.9:
            sospette.append({"colonna": colonna, "quota_identica": round(quota, 4)})
    esiti["feature_identiche_al_bersaglio"] = sospette

    prime = tavola[tavola["gare_precedenti"] == 0]
    esiti["prime_gare_con_media_precedente"] = int(
        prime["prodotto_stagione_media"].notna().sum())
    esiti["prime_gare_con_media_di_lato"] = int(
        tavola.loc[tavola["prodotto_lato_campione"] == 0, "prodotto_lato_media"].notna().sum())

    esiti["righe_senza_data"] = int(tavola["quando"].isna().sum())
    esiti["righe_senza_squadra"] = int(tavola["team_id"].isna().sum())
    esiti["righe_senza_stagione"] = int(tavola["season_id"].isna().sum())

    # Il primo arbitraggio di un arbitro non puo' avere una media: la verifica vale
    # sul profilo puro, perche' col restringimento il prior di lega e' legittimo.
    primo = tavola[tavola["arbitro_gare_viste"] == 0]
    esiti["primo_arbitraggio_con_media"] = (
        int(primo["arbitro_prodotto_media"].notna().sum()) if arbitro == "puro" else None)
    prima_con_allenatore = tavola[tavola["allenatore_gare_con_la_squadra"] == 0]
    esiti["primo_allenatore_con_media"] = int(
        prima_con_allenatore.loc[
            prima_con_allenatore["allenatore_campione"] == 0,
            "allenatore_prodotto_media"].notna().sum())

    esiti["passati"] = (
        esiti["righe_duplicate"] == 0
        and not sospette
        and esiti["prime_gare_con_media_precedente"] == 0
        and esiti["prime_gare_con_media_di_lato"] == 0
        and not esiti["primo_arbitraggio_con_media"]
        and esiti["primo_allenatore_con_media"] == 0
    )
    return esiti


def tavola_completa(target, arbitro="puro", forza_arbitro=FORZA_RESTRINGIMENTO):
    """Tutte le righe squadra-gara con le loro feature, prima di ogni filtro.

    Serve a chi deve guardare anche le gare che non entrano nel dataset: sono la storia
    da cui le medie delle altre righe sono calcolate.
    """
    tavola = carica_osservazioni(target)
    tavola = aggiungi_concesso(tavola)
    tavola = feature_di_squadra(tavola)
    tavola = feature_di_stagione(tavola)
    tavola = feature_di_lega(tavola)
    tavola = riferimenti_di_lega(tavola)
    tavola = aggiungi_avversario(tavola)
    tavola = aggiungi_scarti(tavola)
    tavola = aggiungi_baseline(tavola)
    tavola = profilo_arbitro(tavola)
    if arbitro == "restringimento":
        tavola = restringi_arbitro(tavola, forza_arbitro)
    tavola = derivati_arbitro(tavola)
    tavola = profilo_allenatore(tavola)
    tavola = feature_di_contesto(tavola)
    tavola = feature_di_classifica(tavola)
    tavola = feature_di_interazione(tavola)
    tavola = feature_di_rosa(tavola)
    tavola = feature_spaziali(tavola)
    return tavola


def costruisci(target, arbitro="puro", forza_arbitro=FORZA_RESTRINGIMENTO):
    tavola = tavola_completa(target, arbitro, forza_arbitro)

    controlli = controlli_contaminazione(tavola, arbitro)

    utilizzabile = (
        tavola["valore_noto"].notna()
        & tavola["team_id"].notna()
        & tavola["season_id"].notna()
        & tavola["quando"].notna()
        & (tavola["gare_precedenti"] >= MIN_PREVIOUS_MATCHES)
        & (tavola["avv_gare_precedenti"].fillna(-1) >= MIN_PREVIOUS_MATCHES)
    )
    pronto = tavola[utilizzabile].sort_values(["quando", "event_id", "lato"]).copy()

    rapporto = {
        "target": target,
        "righe_totali": int(len(tavola)),
        "righe_con_bersaglio_noto": int(tavola["valore_noto"].notna().sum()),
        "righe_utilizzabili": int(len(pronto)),
        "min_previous_matches": MIN_PREVIOUS_MATCHES,
        "profilo_arbitro": arbitro,
        "forza_restringimento_arbitro": forza_arbitro if arbitro == "restringimento" else None,
        "arbitro": {
            "righe_con_arbitro": int(pronto["arbitro_disponibile"].fillna(0).sum()),
            "righe_con_almeno_3_precedenti": int((pronto["arbitro_campione"] >= 3).sum()),
            "righe_con_almeno_5_precedenti": int((pronto["arbitro_campione"] >= 5).sum()),
            "righe_con_almeno_10_precedenti": int((pronto["arbitro_campione"] >= 10).sum()),
        },
        "colonne_feature": len([n for n in pronto.columns if n.startswith(PREFISSI_FEATURE)]),
        "intervallo": {
            "da": str(pronto["quando"].min()) if len(pronto) else None,
            "a": str(pronto["quando"].max()) if len(pronto) else None,
        },
        "leghe": int(pronto["league_id"].nunique()) if len(pronto) else 0,
        "controlli_contaminazione": controlli,
    }
    return pronto, rapporto


def main():
    parser = argparse.ArgumentParser(description="Dataset al momento di, per un target")
    parser.add_argument("--target", required=True)
    parser.add_argument("--out", default=None)
    parser.add_argument("--arbitro", choices=("puro", "restringimento"), default="puro",
                        help="puro: profilo assente dove manca lo storico; "
                             "restringimento: profilo ristretto verso la media di lega")
    parser.add_argument("--forza-arbitro", type=float, default=FORZA_RESTRINGIMENTO,
                        help="gare equivalenti di prior di lega nel restringimento")
    argomenti = parser.parse_args()

    with open(REGISTRO_TARGET, "r", encoding="utf-8") as handle:
        registro = json.load(handle)
    if argomenti.target not in {voce["target"] for voce in registro["target"]}:
        print("target non nel registro: " + argomenti.target)
        return 1

    pronto, rapporto = costruisci(argomenti.target, argomenti.arbitro, argomenti.forza_arbitro)

    os.makedirs(OUT_DIR, exist_ok=True)
    uscita = argomenti.out or os.path.join(OUT_DIR, argomenti.target + ".csv")
    pronto.to_csv(uscita, index=False)
    nome_rapporto = os.path.basename(uscita)[:-4] + "-rapporto.json"
    with open(os.path.join(OUT_DIR, nome_rapporto), "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=2)

    print("target: " + argomenti.target + " | profilo arbitro: " + argomenti.arbitro)
    print("righe con bersaglio noto: " + str(rapporto["righe_con_bersaglio_noto"]))
    print("righe utilizzabili: " + str(rapporto["righe_utilizzabili"]))
    print("colonne feature: " + str(rapporto["colonne_feature"]))
    print("righe con arbitro: " + str(rapporto["arbitro"]["righe_con_arbitro"])
          + " | con almeno 5 gare precedenti: "
          + str(rapporto["arbitro"]["righe_con_almeno_5_precedenti"]))
    print("intervallo: " + str(rapporto["intervallo"]["da"]) + " -> "
          + str(rapporto["intervallo"]["a"]))
    controlli = rapporto["controlli_contaminazione"]
    print("controlli di contaminazione: " + ("passati" if controlli["passati"] else "FALLITI"))
    if not controlli["passati"]:
        print(json.dumps(controlli, ensure_ascii=False, indent=2))
    print("scritto: " + uscita)
    return 0


if __name__ == "__main__":
    sys.exit(main())
