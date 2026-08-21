"""L'incertezza del totale di gara: calibrazione diretta contro composizione delle marginali.

Il valore atteso del totale non e' in discussione ed e' esatto senza nessuna assunzione:

    E[casa + trasferta] = E[casa] + E[trasferta]

vale sempre, anche con i due processi dipendenti. Quello che richiede la dipendenza e'
l'**incertezza**: l'intervallo, la distribuzione da cui escono le cinque linee, e
l'affidabilita' del totale. Questo modulo confronta due modi di costruirla, fuori
campione, bersaglio per bersaglio, e non sceglie per teoria.

**A — calibrazione diretta.** La distribuzione del totale e' una binomiale negativa
centrata sulla somma dei due attesi, con la dispersione stimata sui residui della somma
nelle origini precedenti e il livello nominale calibrato come per le marginali. Nessuna
teoria nuova: e' la stessa macchina delle marginali applicata a un'altra grandezza.

**B — composizione delle due marginali.** Le due distribuzioni gia' calibrate si compongono
con la dipendenza misurata fuori campione, attraverso una copula gaussiana simulata. La
correlazione si stima sulle sole origini precedenti, mai su quella di prova.

**Il centro e' lo stesso per costruzione in entrambi i metodi.** Quindi errore assoluto,
errore quadratico e scostamento del totale sono identici fra A e B: si riportano una volta
come contesto, e non distinguono niente. A distinguere sono copertura e larghezza
dell'intervallo, calibrazione delle probabilita' Under/Over, Brier e log-loss.

Le marginali non si riaddestrano: si riusano le previsioni fuori campione del modello gia'
validato, con la miscela congelata dell'artefatto, che e' il numero che il predittore
produce davvero.

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/total.py --target offsides
    .venv/Scripts/python.exe scripts/projection/models/total.py --tutti
"""

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import evaluate  # noqa: E402
import export_model  # noqa: E402
import reliability  # noqa: E402
import validate_maturity  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "output")
SCHEMA = "totale-di-gara/1"

# Le cinque linee centrali si costruiscono attorno all'atteso, a passo di una unita' e
# mezza unita' di scarto, come si legge un mercato: e' una convenzione di presentazione,
# e le probabilita' vengono comunque dalla distribuzione calibrata.
PASSI_DELLE_LINEE = (-2.0, -1.0, 0.0, 1.0, 2.0)

# Quante estrazioni per gara nella composizione. Piu' di cosi' non sposta la terza cifra
# delle probabilita', e la simulazione e' l'unico costo vero di questo confronto.
ESTRAZIONI = 4000

MINIMO_TRENO = 300
MINIMO_PROVA = 100


def modello_operativo(target):
    """Il modello che il predittore usa davvero per questo bersaglio.

    Non si legge dal manifesto. Il manifesto dichiara il modello con cui e' stata fatta la
    **selezione delle feature**, e sui falli quel nome non coincide con quello del modello
    validato: manifesto `poisson_glm`, maturita' e artefatto `ridge`. Il numero che esce in
    produzione viene dall'artefatto, quindi la verita' operativa e' la sua, e si legge dal
    rapporto di maturita', che e' il file da cui i pesi della miscela finiscono
    nell'artefatto.
    """
    percorso = os.path.join(OUT_DIR, target + "-maturita.json")
    if not os.path.isfile(percorso):
        return None
    with open(percorso, "r", encoding="utf-8") as handle:
        return json.load(handle).get("modello")


def paia_di_gara(target, nome_modello, origini, quota_iniziale, densita_minima):
    """Le previsioni fuori campione dei due lati, appaiate per gara, origine per origine.

    Una gara entra solo se **entrambi** i lati sono utilizzabili: il totale di mezza gara
    non esiste, e completarlo con una baseline sarebbe un numero inventato dentro una
    misura che serve a decidere.
    """
    metriche = export_model.metriche_di_validazione(target, nome_modello, "-manifesto")
    soglia_marginale = export_model.soglia_assoluta(metriche)
    pesi = reliability.pesi_congelati(target, nome_modello)
    if pesi is None:
        raise SystemExit("nessun rapporto di maturita' per " + target + " con " + nome_modello)

    tavola = evaluate.carica(target)
    colonne, _ = evaluate.colonne_feature(tavola, densita_minima)
    complete = evaluate.colonne_dal_manifesto(target, set(colonne))
    if complete is None:
        raise SystemExit("nessuna voce di manifesto per il target " + target)

    bersaglio = pd.to_numeric(tavola["valore_noto"], errors="coerce")
    matrice = tavola[complete].apply(pd.to_numeric, errors="coerce")
    matrice = matrice.replace([np.inf, -np.inf], np.nan)
    utilizzabile = matrice.notna().all(axis=1) & bersaglio.notna()

    righe = tavola[utilizzabile].reset_index(drop=True)
    x = matrice[utilizzabile].to_numpy(dtype=float)
    y = bersaglio[utilizzabile].to_numpy(dtype=float)
    ripiego = pd.to_numeric(righe["baseline_restringimento"], errors="coerce").to_numpy()
    # Le baseline dei due lati viaggiano con le paia perche' la soglia dell'affidabilita'
    # del totale si prende dalla migliore baseline **del totale**, che e' la somma dei due
    # lati e non la baseline di un lato solo.
    baseline = {
        nome: pd.to_numeric(righe[nome], errors="coerce").to_numpy()
        for nome in evaluate.BASELINE if nome in righe.columns
    }
    gare = pd.to_numeric(righe["gare_precedenti"], errors="coerce").to_numpy()
    fascia = validate_maturity.etichetta_fascia(gare)
    lega = righe["league_id"].astype(str).to_numpy()
    event_id = righe["event_id"].to_numpy()
    lato = righe["lato"].astype(str).to_numpy()
    quando = righe["quando"]

    confini = [
        quando.quantile(quota_iniziale + (1.0 - quota_iniziale) * k / origini)
        for k in range(origini + 1)
    ]

    raccolta = []
    for k in range(origini):
        inizio, fine = confini[k], confini[k + 1]
        treno = (quando < inizio).to_numpy()
        prova = ((quando >= inizio) & (quando < fine)).to_numpy()
        if treno.sum() < 500 or prova.sum() < 100:
            continue
        previsto, _ = evaluate.addestra_e_prevedi(nome_modello, x[treno], y[treno], x[prova])
        previsto = np.asarray(previsto, dtype=float)
        atteso = previsto.copy()
        for nome, peso in pesi.items():
            dentro_fascia = fascia[prova] == nome
            if peso < 1 and dentro_fascia.any():
                atteso[dentro_fascia] = (peso * previsto[dentro_fascia]
                                         + (1 - peso) * ripiego[prova][dentro_fascia])

        parziale = pd.DataFrame(dict({
            "event_id": event_id[prova],
            "lato": lato[prova],
            "atteso": atteso,
            "vero": y[prova],
            "gare": gare[prova],
            "fascia": fascia[prova],
            "lega": lega[prova],
        }, **{nome: valori[prova] for nome, valori in baseline.items()}))
        casa = parziale[parziale["lato"] == "home"].set_index("event_id")
        via = parziale[parziale["lato"] == "away"].set_index("event_id")
        comuni = casa.index.intersection(via.index)
        if len(comuni) == 0:
            continue
        casa, via = casa.loc[comuni], via.loc[comuni]

        # La fascia della gara e' la piu' povera delle due: e' la storia piu' corta a
        # governare l'incertezza, non la media delle due.
        ordine = {"EARLY": 0, "DEVELOPING": 1, "MATURE": 2}
        fasce = np.where(
            casa["fascia"].map(ordine).to_numpy() <= via["fascia"].map(ordine).to_numpy(),
            casa["fascia"].to_numpy(), via["fascia"].to_numpy())

        raccolta.append({
            "origine": k + 1,
            "event_id": comuni.to_numpy(),
            "atteso_casa": casa["atteso"].to_numpy(),
            "atteso_via": via["atteso"].to_numpy(),
            "vero_casa": casa["vero"].to_numpy(),
            "vero_via": via["vero"].to_numpy(),
            "fascia": fasce,
            "lega": casa["lega"].to_numpy(),
            "gare_min": np.minimum(casa["gare"].to_numpy(), via["gare"].to_numpy()),
            "baseline": {
                nome: casa[nome].to_numpy() + via[nome].to_numpy()
                for nome in baseline
            },
        })
    return raccolta, soglia_marginale


def dispersione_del_totale(vero, atteso):
    return evaluate.dispersione_residua(vero, atteso)


def parametri_nb(mu, disp):
    """Da media e dispersione ai parametri della binomiale negativa."""
    mu = np.clip(np.asarray(mu, dtype=float), 1e-6, None)
    p = 1.0 / disp
    r = mu / (disp - 1.0)
    return r, p


def cdf_diretta(soglie, mu, disp):
    """P(totale <= soglia) sotto la calibrazione diretta."""
    mu = np.clip(np.asarray(mu, dtype=float), 1e-6, None)
    if disp <= evaluate.SOGLIA_POISSON:
        return stats.poisson.cdf(soglie, mu)
    r, p = parametri_nb(mu, disp)
    return stats.nbinom.cdf(soglie, r, p)


def intervallo_diretto(mu, disp, livello):
    return evaluate.intervallo(mu, disp, livello)


def livello_calibrato(vero, atteso, disp, obiettivo=evaluate.LIVELLO_INTERVALLO):
    livello, _ = evaluate.calibra_livello(vero, atteso, disp, obiettivo)
    return livello


def correlazione(residuo_casa, residuo_via):
    """Correlazione dei residui fra i due lati: Pearson e di rango."""
    buoni = np.isfinite(residuo_casa) & np.isfinite(residuo_via)
    if buoni.sum() < 50:
        return 0.0, 0.0
    pearson = float(np.corrcoef(residuo_casa[buoni], residuo_via[buoni])[0, 1])
    rango = float(stats.spearmanr(residuo_casa[buoni], residuo_via[buoni])[0])
    if not np.isfinite(pearson):
        pearson = 0.0
    if not np.isfinite(rango):
        rango = 0.0
    return pearson, rango


def simula_composizione(mu_casa, disp_casa, mu_via, disp_via, rho, estrazioni, seme):
    """La distribuzione del totale componendo le due marginali con la dipendenza misurata.

    Copula gaussiana: due normali correlate, portate sulle marginali gia' calibrate
    attraverso la loro inversa. Con rho a zero e' la convoluzione sotto indipendenza, e
    quello e' il caso di riferimento, non un'assunzione nascosta.
    """
    generatore = np.random.default_rng(seme)
    n = len(mu_casa)
    z1 = generatore.standard_normal((n, estrazioni))
    z2 = generatore.standard_normal((n, estrazioni))
    rho = float(np.clip(rho, -0.99, 0.99))
    z2 = rho * z1 + np.sqrt(1.0 - rho * rho) * z2
    u1 = stats.norm.cdf(z1)
    u2 = stats.norm.cdf(z2)

    def campiona(mu, disp, u):
        mu = np.clip(np.asarray(mu, dtype=float), 1e-6, None)[:, None]
        if disp <= evaluate.SOGLIA_POISSON:
            return stats.poisson.ppf(u, mu)
        r, p = parametri_nb(mu, disp)
        return stats.nbinom.ppf(u, r, p)

    return campiona(mu_casa, disp_casa, u1) + campiona(mu_via, disp_via, u2)


def livello_della_composizione(
    mu_casa, disp_casa, mu_via, disp_via, rho, vero, estrazioni, seme, massimo=3000,
):
    """Il livello nominale della composizione, calibrato sul treno come per le marginali.

    Senza questo passo il confronto sarebbe truccato: la calibrazione diretta sceglie il
    proprio livello nominale sul periodo di addestramento, e su una distribuzione discreta
    chiedere l'80% ne copre spesso l'87%. Confrontarla con una composizione lasciata al
    livello nominale grezzo misurerebbe la calibrazione, non i due metodi.

    Il treno si sottocampiona quando e' grande: il livello e' uno scalare, e tremila gare
    bastano a sceglierlo. Il sottocampione e' regolare, non casuale, cosi' copre tutto
    l'intervallo temporale invece di addensarsi.
    """
    n = len(mu_casa)
    if n > massimo:
        passo = int(np.ceil(n / massimo))
        scelte = np.arange(0, n, passo)
    else:
        scelte = np.arange(n)
    campione = simula_composizione(
        np.asarray(mu_casa)[scelte], disp_casa, np.asarray(mu_via)[scelte], disp_via,
        rho, estrazioni, seme)
    osservato = np.asarray(vero)[scelte]
    migliore, scarto_migliore = evaluate.LIVELLO_INTERVALLO, None
    for livello in np.arange(0.50, 0.96, 0.01):
        coda = (1.0 - float(livello)) / 2.0
        basso = np.quantile(campione, coda, axis=1)
        alto = np.quantile(campione, 1.0 - coda, axis=1)
        copertura = float(np.mean((osservato >= basso) & (osservato <= alto)))
        scarto = abs(copertura - evaluate.LIVELLO_INTERVALLO)
        if scarto_migliore is None or scarto < scarto_migliore:
            migliore, scarto_migliore = float(livello), scarto
    return migliore


def misure_del_totale(vero, atteso, basso, alto):
    errore = atteso - vero
    finiti = np.isfinite(basso) & np.isfinite(alto)
    dentro = (vero >= basso) & (vero <= alto)
    return {
        "righe": int(len(vero)),
        "mae": round(float(np.mean(np.abs(errore))), 4),
        "rmse": round(float(np.sqrt(np.mean(errore ** 2))), 4),
        "bias": round(float(np.mean(errore)), 4),
        "copertura_intervallo": round(float(np.mean(dentro[finiti])), 4),
        "larghezza_media": round(float(np.mean((alto - basso)[finiti])), 4),
    }


def linee_di_gara(atteso):
    """Le cinque soglie centrali: mezze unita' attorno all'atteso arrotondato."""
    centro = np.round(atteso) - 0.5
    return np.column_stack([centro + passo for passo in PASSI_DELLE_LINEE])


def calibrazione_delle_linee(vero, linee, probabilita_over, decili=10):
    """Quanto la probabilita' promessa somiglia alla frequenza osservata, sulle linee."""
    p = probabilita_over.reshape(-1)
    v = (vero[:, None] > linee).astype(float).reshape(-1)
    buoni = np.isfinite(p) & np.isfinite(v)
    p, v = p[buoni], v[buoni]
    if len(p) == 0:
        return {"decili": [], "scarto_medio_di_calibrazione": None, "brier": None,
                "log_loss": None}
    ordine = np.argsort(p)
    gruppi = np.array_split(ordine, decili)
    voci, scarto = [], []
    for indici in gruppi:
        if len(indici) == 0:
            continue
        promessa, osservata = float(np.mean(p[indici])), float(np.mean(v[indici]))
        voci.append({"righe": int(len(indici)),
                     "probabilita_promessa": round(promessa, 4),
                     "frequenza_osservata": round(osservata, 4)})
        scarto.append(abs(promessa - osservata) * len(indici))
    return {
        "decili": voci,
        "scarto_medio_di_calibrazione": round(float(np.sum(scarto) / len(p)), 4),
        "brier": round(reliability.brier(v, p), 5),
        "log_loss": round(reliability.log_loss(v, p), 5),
    }


def per_segmento(etichette, vero, atteso, basso, alto):
    uscita = {}
    for nome in sorted(set(etichette.tolist())):
        maschera = etichette == nome
        if maschera.sum() < 30:
            continue
        uscita[str(nome)] = misure_del_totale(
            vero[maschera], atteso[maschera], basso[maschera], alto[maschera])
    return uscita


def valuta(target, nome_modello, origini, quota_iniziale, densita_minima, estrazioni):
    raccolta, soglia_marginale = paia_di_gara(
        target, nome_modello, origini, quota_iniziale, densita_minima)
    if len(raccolta) < 2:
        return {"target": target, "modello": nome_modello, "schema": SCHEMA,
                "origini_valutabili": 0,
                "perche": "servono almeno due origini: una per stimare, una per giudicare"}

    confronto = []
    soglie_osservate = []
    for indice in range(1, len(raccolta)):
        prima = raccolta[:indice]
        ora = raccolta[indice]

        atteso_treno = np.concatenate([v["atteso_casa"] + v["atteso_via"] for v in prima])
        vero_treno = np.concatenate([v["vero_casa"] + v["vero_via"] for v in prima])
        residuo_casa = np.concatenate([v["vero_casa"] - v["atteso_casa"] for v in prima])
        residuo_via = np.concatenate([v["vero_via"] - v["atteso_via"] for v in prima])
        atteso_casa_treno = np.concatenate([v["atteso_casa"] for v in prima])
        vero_casa_treno = np.concatenate([v["vero_casa"] for v in prima])
        atteso_via_treno = np.concatenate([v["atteso_via"] for v in prima])
        vero_via_treno = np.concatenate([v["vero_via"] for v in prima])

        if len(vero_treno) < MINIMO_TRENO or len(ora["event_id"]) < MINIMO_PROVA:
            continue

        atteso = ora["atteso_casa"] + ora["atteso_via"]
        vero = ora["vero_casa"] + ora["vero_via"]

        # --- A: calibrazione diretta sui residui della somma
        disp_totale = dispersione_del_totale(vero_treno, atteso_treno)
        livello_totale = livello_calibrato(vero_treno, atteso_treno, disp_totale)
        basso_a, alto_a = intervallo_diretto(atteso, disp_totale, livello_totale)

        # --- B: composizione delle due marginali con la dipendenza misurata
        disp_casa = evaluate.dispersione_residua(vero_casa_treno, atteso_casa_treno)
        disp_via = evaluate.dispersione_residua(vero_via_treno, atteso_via_treno)
        pearson, rango = correlazione(residuo_casa, residuo_via)
        livello_composto = livello_della_composizione(
            atteso_casa_treno, disp_casa, atteso_via_treno, disp_via, rango, vero_treno,
            estrazioni, seme=2000 + ora["origine"])
        campione = simula_composizione(
            ora["atteso_casa"], disp_casa, ora["atteso_via"], disp_via, rango,
            estrazioni, seme=1000 + ora["origine"])
        coda = (1.0 - livello_composto) / 2.0
        basso_b = np.quantile(campione, coda, axis=1)
        alto_b = np.quantile(campione, 1.0 - coda, axis=1)

        linee = linee_di_gara(atteso)
        over_a = 1.0 - cdf_diretta(linee, atteso[:, None], disp_totale)
        over_b = np.column_stack([
            np.mean(campione > linee[:, colonna][:, None], axis=1)
            for colonna in range(linee.shape[1])
        ])

        soglie_osservate.append(float(np.mean(np.abs(atteso_treno - vero_treno))))

        confronto.append({
            "origine": ora["origine"],
            "gare_di_addestramento": int(len(vero_treno)),
            "gare_di_prova": int(len(vero)),
            "dipendenza_fra_i_lati": {
                "pearson": round(pearson, 4),
                "rango": round(rango, 4),
                "misurata_su": int(len(residuo_casa)),
            },
            "centro_comune": {
                "mae": round(float(np.mean(np.abs(atteso - vero))), 4),
                "rmse": round(float(np.sqrt(np.mean((atteso - vero) ** 2))), 4),
                "bias": round(float(np.mean(atteso - vero)), 4),
                "nota": "identico ai due metodi: il centro e' la somma dei due attesi",
            },
            "diretta": {
                "dispersione": round(float(disp_totale), 4),
                "livello_nominale": round(float(livello_totale), 3),
                **misure_del_totale(vero, atteso, basso_a, alto_a),
                "linee": calibrazione_delle_linee(vero, linee, over_a),
                "per_fascia": per_segmento(ora["fascia"], vero, atteso, basso_a, alto_a),
            },
            "composizione": {
                "dispersione_casa": round(float(disp_casa), 4),
                "dispersione_via": round(float(disp_via), 4),
                "livello_nominale": round(float(livello_composto), 3),
                "correlazione_usata": round(float(rango), 4),
                **misure_del_totale(vero, atteso, basso_b, alto_b),
                "linee": calibrazione_delle_linee(vero, linee, over_b),
                "per_fascia": per_segmento(ora["fascia"], vero, atteso, basso_b, alto_b),
            },
        })

    if not confronto:
        return {"target": target, "modello": nome_modello, "schema": SCHEMA,
                "origini_valutabili": 0, "perche": "nessuna origine con campione bastante"}

    def vittorie_sul_brier():
        """Quante origini vince ciascun metodo sul Brier delle linee.

        Un pareggio non conta per nessuno dei due: dichiararlo vittoria di chi lo
        annuncia sarebbe un modo di scegliere senza misurare.
        """
        avanti, indietro = 0, 0
        for voce in confronto:
            mio = voce["diretta"]["linee"]["brier"]
            suo = voce["composizione"]["linee"]["brier"]
            if mio is None or suo is None:
                continue
            if mio < suo:
                avanti += 1
            elif suo < mio:
                indietro += 1
        return avanti, indietro

    def scostamento_copertura(chiave):
        return float(np.mean([abs(v[chiave]["copertura_intervallo"]
                                  - evaluate.LIVELLO_INTERVALLO) for v in confronto]))

    totale_origini = len(confronto)
    copertura_diretta = scostamento_copertura("diretta")
    copertura_composta = scostamento_copertura("composizione")
    brier_diretta, brier_composta = vittorie_sul_brier()
    larghezza_diretta = float(np.mean([v["diretta"]["larghezza_media"] for v in confronto]))
    larghezza_composta = float(np.mean(
        [v["composizione"]["larghezza_media"] for v in confronto]))

    # Chi vince: prima la copertura, che e' la promessa dell'intervallo; a parita' di
    # copertura il Brier delle linee; a parita' di entrambe la larghezza, perche' fra due
    # intervalli ugualmente onesti il piu' stretto dice di piu'.
    if abs(copertura_diretta - copertura_composta) > 0.005:
        migliore = "diretta" if copertura_diretta < copertura_composta else "composizione"
        perche = "copertura dell'intervallo piu' vicina all'obiettivo"
    elif brier_diretta != brier_composta:
        migliore = "diretta" if brier_diretta > brier_composta else "composizione"
        perche = "Brier delle cinque linee migliore nella maggioranza delle origini"
    else:
        migliore = "diretta" if larghezza_diretta <= larghezza_composta else "composizione"
        perche = "a parita' di copertura e calibrazione, l'intervallo piu' stretto"

    return {
        "target": target,
        "modello": nome_modello,
        "schema": SCHEMA,
        "regola_non_negoziabile": (
            "il centro del totale e' sempre la somma dei due attesi: nessun terzo valore "
            "atteso indipendente che possa contraddire i due lati"
        ),
        "soglia_assoluta_marginale": soglia_marginale,
        # Non e' ancora la soglia del totale. La regola del progetto e' l'errore della
        # previsione banale, cioe' il MAE della migliore baseline, e qui c'e' il MAE del
        # modello: serve solo a dare l'ordine di grandezza. La soglia vera si misura
        # quando si costruisce l'affidabilita' del totale, dopo aver scelto il metodo.
        "mae_medio_del_totale_fuori_campione": (
            None if not soglie_osservate else round(float(np.mean(soglie_osservate)), 4)),
        "origini_valutabili": totale_origini,
        "confronto_per_origine": confronto,
        "esito": {
            "migliore": migliore,
            "perche": perche,
            "scostamento_medio_di_copertura": {
                "diretta": round(copertura_diretta, 4),
                "composizione": round(copertura_composta, 4),
            },
            "origini_vinte_su_brier_delle_linee": {
                "diretta": str(brier_diretta) + "/" + str(totale_origini),
                "composizione": str(brier_composta) + "/" + str(totale_origini),
            },
            "larghezza_media": {
                "diretta": round(larghezza_diretta, 4),
                "composizione": round(larghezza_composta, 4),
            },
        },
        "come_e_stato_misurato": (
            "le previsioni dei due lati sono quelle fuori campione del modello gia' "
            "validato, con la miscela congelata dell'artefatto; dispersione, livello "
            "nominale e correlazione si stimano sulle sole origini precedenti e si "
            "giudicano sull'origine successiva"
        ),
    }


def main():
    parser = argparse.ArgumentParser(description="Incertezza del totale di gara")
    parser.add_argument("--target")
    parser.add_argument("--tutti", action="store_true")
    parser.add_argument("--modello", default=None, choices=sorted(evaluate.ESPORTABILI),
                        help="se assente, il modello di riferimento del manifesto")
    parser.add_argument("--origini", type=int, default=5)
    parser.add_argument("--quota-iniziale", type=float, default=0.45)
    parser.add_argument("--densita-minima", type=float, default=0.80)
    parser.add_argument("--estrazioni", type=int, default=ESTRAZIONI)
    parser.add_argument("--salta-esistenti", action="store_true",
                        help="non rifa' i bersagli gia' misurati")
    argomenti = parser.parse_args()

    if not argomenti.tutti and not argomenti.target:
        raise SystemExit("indicare --target oppure --tutti")

    with open(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data",
                           "manifesto-feature.json"), "r", encoding="utf-8") as handle:
        manifesto = json.load(handle)["target"]
    bersagli = sorted(manifesto.keys()) if argomenti.tutti else [argomenti.target]

    os.makedirs(OUT_DIR, exist_ok=True)
    for bersaglio in bersagli:
        percorso = os.path.join(OUT_DIR, bersaglio + "-totale.json")
        if argomenti.salta_esistenti and os.path.isfile(percorso):
            print(bersaglio + ": gia' misurato, saltato")
            continue
        # Il modello non e' lo stesso per tutti, e non si legge dal manifesto: sui falli
        # il manifesto dice poisson e l'artefatto dice ridge. Comanda l'artefatto.
        nome_modello = argomenti.modello or modello_operativo(bersaglio)
        if nome_modello is None:
            print(bersaglio + ": nessun rapporto di maturita', saltato")
            continue
        rapporto = valuta(bersaglio, nome_modello, argomenti.origini,
                          argomenti.quota_iniziale, argomenti.densita_minima,
                          argomenti.estrazioni)
        percorso = os.path.join(OUT_DIR, bersaglio + "-totale.json")
        with open(percorso, "w", encoding="utf-8") as handle:
            json.dump(rapporto, handle, ensure_ascii=False, indent=2)
        esito = rapporto.get("esito")
        if esito is None:
            print(bersaglio + ": " + str(rapporto.get("perche")))
            continue
        prima = rapporto["confronto_per_origine"][0]["dipendenza_fra_i_lati"]
        print(bersaglio
              + " | origini " + str(rapporto["origini_valutabili"])
              + " | correlazione di rango " + str(prima["rango"])
              + " | migliore: " + esito["migliore"]
              + " (" + esito["perche"] + ")")
        print("    copertura: diretta "
              + str(esito["scostamento_medio_di_copertura"]["diretta"])
              + " | composizione "
              + str(esito["scostamento_medio_di_copertura"]["composizione"])
              + " | larghezza: " + str(esito["larghezza_media"]["diretta"])
              + " contro " + str(esito["larghezza_media"]["composizione"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
