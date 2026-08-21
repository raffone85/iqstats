"""Dove cambia davvero la qualita' della proiezione, e dove non cambia affatto.

La fascia di maturita' non distingue: EARLY, DEVELOPING e MATURE danno la stessa quota di
previsioni entro soglia, e su falli e tiri in porta la fascia con meno storico e' persino
la migliore. Un'affidabilita' costruita su quella grandezza ripeterebbe l'errore gia'
scartato con la stabilita' temporale: direbbe che alla quarta giornata ci si fida di piu'.

Questo script cerca allora le condizioni che *distinguono* una proiezione affidabile da una
che lo e' meno, usando solo cio' che si conosce prima del calcio d'inizio. Per ogni
condizione divide le righe di prova in gruppi e misura la quota entro soglia in ciascuno,
con l'incertezza che serve a non scambiare il rumore per un segnale.

Tre regole che questo modulo non negozia:

**Si misura sulla forma di produzione.** Non sul modello nudo, ma sulla miscela con il peso
congelato della fascia, che e' quello che il lato che prevede produce davvero. I pesi si
leggono dal rapporto di maturita': non si ristimano qui.

**Nessun modello viene riaddestrato per comodita'.** La finestra avanzante e' la stessa
della validazione principale, con le stesse origini e la stessa quota iniziale, e il
modello resta addestrato su tutto il passato disponibile all'origine.

**Una differenza non e' un discriminatore.** Perche' una condizione sia promossa servono
gruppi abbastanza popolosi, uno scarto grande rispetto al suo errore standard, e lo stesso
segno ripetuto fra le origini e fra le leghe. Cio' che non passa resta scritto, marcato
come non promosso: sapere che una condizione *non* discrimina e' un risultato.

Nessuna richiesta di rete.

Uso:
    .venv/Scripts/python.exe scripts/projection/models/discriminate.py --target fouls \
        --modello ridge
"""

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import evaluate  # noqa: E402
import validate_maturity as maturita  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "output")

# Perche' un gruppo sia guardato deve avere abbastanza righe da produrre una quota con un
# errore standard sotto i cinque punti: con meno, la differenza fra due gruppi e' rumore.
RIGHE_MINIME_PER_GRUPPO = 150

# Lo scarto fra il gruppo migliore e il peggiore deve superare due volte il proprio errore
# standard, e il segno deve ripetersi. Due soglie insieme, perche' una sola si supera per
# caso quando le condizioni provate sono molte.
RAPPORTO_MINIMO = 2.0
QUOTA_MINIMA_DI_COERENZA = 0.75

# Le condizioni comuni a ogni bersaglio: tutte note prima del calcio d'inizio, tutte gia'
# calcolate nel dataset «al momento di». Il nome che compare nel rapporto e' quello leggibile.
CONDIZIONI_COMUNI = (
    ("lega", "league_id", "categoria"),
    ("lato del campo", "lato", "categoria"),
    ("derby", "contesto_derby", "categoria"),
    ("storico della squadra", "gare_precedenti", "terzili"),
    ("storico dell'avversario", "avv_gare_precedenti", "terzili"),
    ("giorni di riposo", "giorni_di_riposo", "terzili"),
    ("gare ravvicinate", "contesto_gare_recenti", "terzili"),
    ("turno di campionato", "contesto_turno", "terzili"),
    ("variabilita' della squadra", "prodotto_stagione_sd", "terzili"),
    ("scarto dalla media di lega", "zeta_dalla_lega", "terzili"),
    ("qualita' del confronto", "confronto_produce_meno_concede", "terzili"),
    ("forza d'attacco", "forza_attacco", "terzili"),
    ("debolezza difensiva avversaria", "debolezza_difesa_avversario", "terzili"),
    ("storico dei giocatori", "giocatori_gare_precedenti", "terzili"),
    ("minuti di volti nuovi", "giocatori_minuti_nuovi", "terzili"),
    ("ampiezza della rosa usata", "giocatori_rosa_usata", "terzili"),
    ("stabilita' della rosa", "giocatori_stabilita", "terzili"),
    ("allenatore noto", "allenatore_disponibile", "categoria"),
    ("gare dell'allenatore con la squadra", "allenatore_gare_con_la_squadra", "terzili"),
    ("scarto fra le classifiche", "classifica_delta_punti", "terzili"),
)

# Le condizioni che riguardano l'arbitro hanno senso solo dove l'arbitro entra nel modello:
# sui bersagli disciplinari. Altrove le colonne esistono ma non sono state promosse.
CONDIZIONI_ARBITRO = (
    ("arbitro noto", "arbitro_disponibile", "categoria"),
    ("gare viste dell'arbitro", "arbitro_gare_viste", "terzili"),
    ("campione dell'arbitro", "arbitro_campione", "terzili"),
    ("qualita' della storia dell'arbitro", "arbitro_qualita_storia", "terzili"),
    ("falli medi dell'arbitro", "arbitro_falli_media", "terzili"),
    ("ammoniti medi dell'arbitro", "arbitro_ammoniti_media", "terzili"),
    ("severita' dell'arbitro sui falli", "arbitro_severita_falli", "terzili"),
    ("severita' dell'arbitro sugli ammoniti", "arbitro_severita_ammoniti", "terzili"),
    ("scarto dell'arbitro dalla lega", "arbitro_scarto_dalla_lega", "terzili"),
    ("squadra per severita' dell'arbitro", "interazione_casa_severita_arbitro", "terzili"),
)

BERSAGLI_DISCIPLINARI = ("fouls", "yellow_cards")

# Le due condizioni calcolate dalla proiezione stessa, non lette dal dataset: quanto la
# previsione e' alta, e quanto e' largo l'intervallo che la accompagna.
CONDIZIONI_DALLA_PROIEZIONE = (
    ("livello atteso della proiezione", "previsto", "terzili"),
    ("ampiezza dell'intervallo", "ampiezza", "terzili"),
)


def gruppi_da(valori, modo):
    """I gruppi di una condizione: le sue categorie, oppure i terzili se e' continua.

    Una colonna continua con pochissimi valori distinti non si taglia in tre: si tratta
    come categoria, altrimenti i tagli cadrebbero tutti sullo stesso numero.
    """
    valori = np.asarray(valori, dtype=object)
    finiti = np.array([v is not None and v == v for v in valori])
    if modo == "categoria" or len(set(valori[finiti].tolist())) <= 3:
        etichette = np.full(len(valori), "", dtype=object)
        for categoria in set(valori[finiti].tolist()):
            etichette[valori == categoria] = str(categoria)
        return etichette, "categoria"

    numeri = pd.to_numeric(pd.Series(list(valori)), errors="coerce").to_numpy(dtype=float)
    validi = np.isfinite(numeri)
    if validi.sum() < 3 * RIGHE_MINIME_PER_GRUPPO:
        return None, None
    primo = float(np.quantile(numeri[validi], 1.0 / 3.0))
    secondo = float(np.quantile(numeri[validi], 2.0 / 3.0))
    if not (primo < secondo):
        return None, None
    etichette = np.full(len(numeri), "", dtype=object)
    etichette[validi & (numeri <= primo)] = "basso"
    etichette[validi & (numeri > primo) & (numeri <= secondo)] = "medio"
    etichette[validi & (numeri > secondo)] = "alto"
    return etichette, "terzili"


def scarto_fra_quote(dentro_uno, totale_uno, dentro_due, totale_due):
    """Lo scarto fra due quote e il suo errore standard, per non leggere il rumore."""
    if totale_uno == 0 or totale_due == 0:
        return None
    quota_uno = dentro_uno / totale_uno
    quota_due = dentro_due / totale_due
    varianza = (quota_uno * (1 - quota_uno) / totale_uno
                + quota_due * (1 - quota_due) / totale_due)
    errore = float(np.sqrt(varianza))
    differenza = float(quota_uno - quota_due)
    return {
        "differenza": round(differenza, 4),
        "errore_standard": round(errore, 4),
        "rapporto": round(differenza / errore, 2) if errore > 0 else None,
    }


def coerenza(etichette, dentro_soglia, alto, basso, sottogruppi, verso):
    """Quante volte lo scarto conserva il segno, guardando un pezzo di dati per volta.

    Una differenza vera si ripete: fra un'origine e l'altra, e da una lega all'altra. Una
    differenza prodotta dal caso cambia segno appena si cambia il taglio.

    Il segno da confermare e' quello complessivo, non il positivo: una condizione che rende
    la proiezione *meno* affidabile discrimina esattamente quanto una che la rende piu'
    affidabile, e va riconosciuta allo stesso modo.
    """
    concordi = 0
    contate = 0
    for chiave in sorted(set(sottogruppi.tolist())):
        pezzo = sottogruppi == chiave
        su = pezzo & (etichette == alto)
        giu = pezzo & (etichette == basso)
        if su.sum() < 30 or giu.sum() < 30:
            continue
        contate += 1
        scarto = dentro_soglia[su].mean() - dentro_soglia[giu].mean()
        if scarto * verso > 0:
            concordi += 1
    if contate == 0:
        return None
    return {"pezzi": contate, "concordi": concordi,
            "quota": round(concordi / contate, 3)}


def esamina(nome, etichette, forma, vero, previsto, soglia, origine, lega):
    """Una condizione: i suoi gruppi, la quota entro soglia in ciascuno, e il verdetto."""
    dentro_soglia = (np.abs(previsto - vero) <= soglia).astype(float)
    presenti = [chiave for chiave in sorted(set(etichette.tolist())) if chiave != ""]
    gruppi = []
    for chiave in presenti:
        maschera = etichette == chiave
        totale = int(maschera.sum())
        if totale < RIGHE_MINIME_PER_GRUPPO:
            continue
        dentro = int(dentro_soglia[maschera].sum())
        bassa, alta = maturita.quota_incerta(dentro, totale)
        gruppi.append({
            "gruppo": chiave,
            "righe": totale,
            "entro_soglia": dentro,
            "quota": round(dentro / totale, 4),
            "quota_bassa": round(bassa, 4),
            "quota_alta": round(alta, 4),
            "mae": round(float(np.mean(np.abs(previsto[maschera] - vero[maschera]))), 4),
        })
    if len(gruppi) < 2:
        return None

    # Sui terzili i due gruppi da confrontare sono decisi prima di guardare i numeri: il
    # terzile alto contro il basso. Scegliere invece il migliore e il peggiore fra molti
    # gruppi gonfia lo scarto, perche' il massimo di piu' stime rumorose supera il vero.
    # Sulle categorie quella scelta e' inevitabile, e il rapporto va letto con quel bias.
    per_nome = {voce["gruppo"]: voce for voce in gruppi}
    if forma == "terzili" and "alto" in per_nome and "basso" in per_nome:
        migliore, peggiore = per_nome["alto"], per_nome["basso"]
        estremi_scelti_dai_dati = False
    else:
        migliore = max(gruppi, key=lambda voce: voce["quota"])
        peggiore = min(gruppi, key=lambda voce: voce["quota"])
        estremi_scelti_dai_dati = True
    confronto = scarto_fra_quote(
        migliore["entro_soglia"], migliore["righe"],
        peggiore["entro_soglia"], peggiore["righe"])

    verso = 1.0 if (confronto or {}).get("differenza", 0.0) >= 0 else -1.0
    fra_origini = coerenza(etichette, dentro_soglia, migliore["gruppo"],
                           peggiore["gruppo"], origine, verso)
    fra_leghe = coerenza(etichette, dentro_soglia, migliore["gruppo"],
                         peggiore["gruppo"], lega, verso)

    abbastanza_grande = (confronto is not None
                         and confronto["rapporto"] is not None
                         and abs(confronto["rapporto"]) >= RAPPORTO_MINIMO)
    stabile = all(voce is None or voce["quota"] >= QUOTA_MINIMA_DI_COERENZA
                  for voce in (fra_origini, fra_leghe))
    misurata = fra_origini is not None or fra_leghe is not None

    return {
        "condizione": nome,
        "forma": forma,
        "soglia": soglia,
        "gruppi": gruppi,
        "gruppo_migliore": migliore["gruppo"],
        "gruppo_peggiore": peggiore["gruppo"],
        "estremi_scelti_dai_dati": estremi_scelti_dai_dati,
        "scarto_fra_gli_estremi": confronto,
        "coerenza_fra_origini": fra_origini,
        "coerenza_fra_leghe": fra_leghe,
        "promossa": bool(abbastanza_grande and stabile and misurata),
        "perche": (
            "scarto sotto due errori standard" if not abbastanza_grande
            else ("segno non stabile fra origini o leghe" if not stabile
                  else ("nessun sottogruppo abbastanza popoloso per la coerenza"
                        if not misurata else "scarto ampio e segno stabile"))
        ),
    }


def previsioni_di_produzione(target, nome_modello, origini, quota_iniziale, densita_minima):
    """Le proiezioni fuori campione nella forma che va in produzione: miscela congelata.

    I pesi della miscela non si ristimano: si leggono dal rapporto di maturita', dove ogni
    origine li ha stimati sul proprio treno e la mediana e' quella che finisce
    nell'artefatto. Qui si applicano e basta.
    """
    percorso = os.path.join(OUT_DIR, target + "-maturita.json")
    if not os.path.isfile(percorso):
        raise SystemExit("manca il rapporto di maturita' per " + target)
    with open(percorso, "r", encoding="utf-8") as handle:
        rapporto = json.load(handle)
    if rapporto.get("modello") != nome_modello:
        raise SystemExit("il rapporto di maturita' e' di un altro modello: "
                         + str(rapporto.get("modello")))
    pesi = {nome: voce["peso_della_miscela"]
            for nome, voce in rapporto["parametri_per_fascia"].items()}

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
    gare = pd.to_numeric(righe["gare_precedenti"], errors="coerce").to_numpy()
    fascia = maturita.etichetta_fascia(gare)

    quando = righe["quando"]
    confini = [
        quando.quantile(quota_iniziale + (1.0 - quota_iniziale) * k / origini)
        for k in range(origini + 1)
    ]

    indici, previsti, ampiezze, etichette_origine = [], [], [], []
    for k in range(origini):
        inizio, fine = confini[k], confini[k + 1]
        treno = (quando < inizio).to_numpy()
        prova = ((quando >= inizio) & (quando < fine)).to_numpy()
        if treno.sum() < 500 or prova.sum() < 100:
            continue

        modello, modello_treno = evaluate.addestra_e_prevedi(
            nome_modello, x[treno], y[treno], x[prova])
        baseline = pd.to_numeric(righe["baseline_restringimento"],
                                 errors="coerce").to_numpy()

        previsto = np.array(modello, dtype=float)
        previsto_treno = np.array(modello_treno, dtype=float)
        for nome, _, _ in maturita.FASCE:
            peso = pesi.get(nome, 1.0)
            dentro_prova = fascia[prova] == nome
            previsto[dentro_prova] = (peso * np.asarray(modello)[dentro_prova]
                                      + (1 - peso) * baseline[prova][dentro_prova])
            dentro_treno = fascia[treno] == nome
            previsto_treno[dentro_treno] = (
                peso * np.asarray(modello_treno)[dentro_treno]
                + (1 - peso) * baseline[treno][dentro_treno])

        # L'intervallo e' quello calibrato dentro la fascia, come in produzione: la sua
        # ampiezza e' una delle condizioni da esaminare, non un contorno.
        ampiezza = np.full(int(prova.sum()), np.nan)
        for nome, _, _ in maturita.FASCE:
            dentro_treno = fascia[treno] == nome
            dentro_prova = fascia[prova] == nome
            if dentro_treno.sum() < 200 or not dentro_prova.any():
                continue
            basso, alto, _, _ = maturita.calibra(
                y[treno][dentro_treno], previsto_treno[dentro_treno],
                previsto[dentro_prova])
            ampiezza[dentro_prova] = np.asarray(alto) - np.asarray(basso)

        indici.append(np.flatnonzero(prova))
        previsti.append(previsto)
        ampiezze.append(ampiezza)
        etichette_origine.append(np.full(int(prova.sum()), str(inizio)[:10], dtype=object))

    if not indici:
        raise SystemExit("nessuna origine valutabile per il target " + target)

    indici = np.concatenate(indici)
    return {
        "righe": righe.iloc[indici].reset_index(drop=True),
        "vero": y[indici],
        "previsto": np.concatenate(previsti),
        "ampiezza": np.concatenate(ampiezze),
        "origine": np.concatenate(etichette_origine),
        "fascia": fascia[indici],
        "pesi_della_miscela": pesi,
        "feature_del_modello": len(complete),
        "righe_scartate_per_feature_mancanti": int((~utilizzabile).sum()),
    }


def soglia_di_lettura(vero, previsto):
    """La distanza su cui si legge la discriminazione: la mediana dell'errore, arrotondata.

    Non e' la soglia dell'affidabilita', che non e' ancora stata scelta. E' la lente: vicino
    alla mediana l'indicatore «dentro o fuori» ha la varianza massima, quindi e' li' che una
    condizione che discrimina si vede meglio. Altrove una differenza vera resterebbe
    schiacciata contro lo zero o contro l'uno.
    """
    mediano = float(np.median(np.abs(previsto - vero)))
    candidate = np.array(maturita.SOGLIE_DI_ERRORE, dtype=float)
    return float(candidate[int(np.argmin(np.abs(candidate - mediano)))])


def analizza(target, nome_modello, origini, quota_iniziale, densita_minima):
    dati = previsioni_di_produzione(target, nome_modello, origini, quota_iniziale,
                                    densita_minima)
    righe = dati["righe"]
    vero = dati["vero"]
    previsto = dati["previsto"]
    soglia = soglia_di_lettura(vero, previsto)

    lega = righe["league_id"].astype(str).to_numpy()
    condizioni = list(CONDIZIONI_COMUNI)
    if target in BERSAGLI_DISCIPLINARI:
        condizioni = condizioni + list(CONDIZIONI_ARBITRO)

    esiti = []
    for nome, colonna, modo in condizioni:
        if colonna not in righe.columns:
            esiti.append({"condizione": nome, "colonna": colonna,
                          "stato": "colonna assente dal dataset"})
            continue
        etichette, forma = gruppi_da(righe[colonna].to_numpy(), modo)
        if etichette is None:
            esiti.append({"condizione": nome, "colonna": colonna,
                          "stato": "troppo pochi valori distinti per tagliare i gruppi"})
            continue
        voce = esamina(nome, etichette, forma, vero, previsto, soglia,
                       dati["origine"], lega)
        if voce is None:
            esiti.append({"condizione": nome, "colonna": colonna,
                          "stato": "nessun gruppo abbastanza popoloso"})
            continue
        voce["colonna"] = colonna
        esiti.append(voce)

    for nome, chiave, modo in CONDIZIONI_DALLA_PROIEZIONE:
        valori = previsto if chiave == "previsto" else dati["ampiezza"]
        etichette, forma = gruppi_da(valori, modo)
        if etichette is None:
            continue
        voce = esamina(nome, etichette, forma, vero, previsto, soglia,
                       dati["origine"], lega)
        if voce is not None:
            voce["colonna"] = chiave
            esiti.append(voce)

    # Lo spostamento nel tempo si guarda da se': ogni origine e' un periodo diverso, e se la
    # quota entro soglia scivola di origine in origine il modello sta invecchiando.
    voce_origini = esamina("periodo di prova", dati["origine"], "categoria", vero, previsto,
                           soglia, dati["origine"], lega)
    if voce_origini is not None:
        voce_origini["colonna"] = "origine"
        esiti.append(voce_origini)

    promosse = [voce for voce in esiti if voce.get("promossa")]
    promosse.sort(key=lambda voce: abs(voce["scarto_fra_gli_estremi"]["differenza"]),
                  reverse=True)

    return {
        "target": target,
        "modello": nome_modello,
        "schema": "discriminazione-affidabilita/1",
        "forma_misurata": "miscela congelata, cioe' il valore che il predittore produce",
        "pesi_della_miscela": dati["pesi_della_miscela"],
        "soglia_di_lettura": soglia,
        "significato_della_soglia": (
            "la distanza su cui si legge la discriminazione, scelta vicino alla mediana "
            "dell'errore perche' li' l'indicatore ha varianza massima; non e' la soglia "
            "dell'affidabilita', che non e' stata scelta"
        ),
        "righe_di_prova": int(len(vero)),
        "righe_scartate_per_feature_mancanti": dati["righe_scartate_per_feature_mancanti"],
        "quota_complessiva_entro_soglia": round(
            float(np.mean(np.abs(previsto - vero) <= soglia)), 4),
        "regola_di_promozione": {
            "righe_minime_per_gruppo": RIGHE_MINIME_PER_GRUPPO,
            "rapporto_minimo": RAPPORTO_MINIMO,
            "quota_minima_di_coerenza": QUOTA_MINIMA_DI_COERENZA,
        },
        "condizioni_promosse": [
            {"condizione": voce["condizione"],
             "colonna": voce["colonna"],
             "gruppo_migliore": voce["gruppo_migliore"],
             "gruppo_peggiore": voce["gruppo_peggiore"],
             "punti_di_scarto": round(voce["scarto_fra_gli_estremi"]["differenza"] * 100, 1),
             "errori_standard": voce["scarto_fra_gli_estremi"]["rapporto"]}
            for voce in promosse
        ],
        "condizioni": esiti,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Dove cambia la qualita' della proiezione, e dove no")
    parser.add_argument("--target", required=True)
    parser.add_argument("--modello", default="poisson_glm",
                        choices=sorted(evaluate.ESPORTABILI))
    parser.add_argument("--origini", type=int, default=5)
    parser.add_argument("--quota-iniziale", type=float, default=0.45)
    parser.add_argument("--densita-minima", type=float, default=0.80)
    argomenti = parser.parse_args()

    rapporto = analizza(argomenti.target, argomenti.modello, argomenti.origini,
                        argomenti.quota_iniziale, argomenti.densita_minima)

    os.makedirs(OUT_DIR, exist_ok=True)
    uscita = os.path.join(OUT_DIR, argomenti.target + "-discriminazione.json")
    with open(uscita, "w", encoding="utf-8") as handle:
        json.dump(rapporto, handle, ensure_ascii=False, indent=2)

    print("target: " + rapporto["target"] + " | modello: " + rapporto["modello"])
    print("soglia di lettura: " + str(rapporto["soglia_di_lettura"])
          + " | quota complessiva: " + str(rapporto["quota_complessiva_entro_soglia"])
          + " | righe: " + str(rapporto["righe_di_prova"]))
    for voce in rapporto["condizioni"]:
        if voce.get("stato"):
            continue
        scarto = voce["scarto_fra_gli_estremi"] or {}
        riga = ("  " if voce["promossa"] else "  . ") + voce["condizione"].ljust(38)
        riga += (str(round((scarto.get("differenza") or 0) * 100, 1)) + " punti").rjust(14)
        riga += ("  " + str(scarto.get("rapporto")) + " es").rjust(12)
        print(riga)
    print("promosse: " + (", ".join(voce["condizione"]
                                    for voce in rapporto["condizioni_promosse"]) or "nessuna"))
    for voce in rapporto["condizioni"]:
        if voce.get("stato"):
            print("  non misurabile: " + voce["condizione"] + " -> " + voce["stato"])
    print("scritto: " + uscita)
    return 0


if __name__ == "__main__":
    sys.exit(main())
