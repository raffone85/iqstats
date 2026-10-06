"""Il turno ricavato dalle gare giocate regge al posto di quello della fonte?

Due domande, per corner e tiri in porta:
1. dove la fonte dichiara il turno, quanto cambia la previsione usando quello ricavato;
2. in MLS, dove la fonte non lo dichiara mai e il modello non e' quindi mai girato,
   il modello con il turno ricavato batte il ripiego che la produzione usa oggi?

Sola lettura: non scrive niente. E' la misura su cui poggia il turno ricavato in
`apps/web/src/server/iqstats/projection-store.ts` (`materiale`), acceso il 6 ottobre 2026.

Uso, dalla radice del repository:
    .venv/Scripts/python.exe scripts/projection/models/turno_ricavato.py
"""
import json
import pathlib

import numpy as np
import pandas as pd

RADICE = pathlib.Path(__file__).resolve().parents[3]
MLS = 18

for bersaglio in ["corner_kicks", "shots_on_target"]:
    artefatto = json.loads(
        (RADICE / f"apps/web/src/server/iqstats/artefatti/{bersaglio}__poisson_glm.json").read_text(encoding="utf-8")
    )
    schema = artefatto["feature_schema"]
    ordine = schema["ordine"]
    media = np.array(schema["preprocessing"]["media"], dtype=float)
    scala = np.array(schema["preprocessing"]["scala"], dtype=float)
    coefficienti = artefatto["coefficients"]
    if isinstance(coefficienti, dict):
        coefficienti = [coefficienti[n] for n in ordine]
    coefficienti = np.array(coefficienti, dtype=float)
    intercetta = float(artefatto["intercept"])
    assert artefatto["collegamento"] == "log" and len(ordine) == len(media) == len(coefficienti)

    t = pd.read_csv(RADICE / f"scripts/projection/dataset/output/features/{bersaglio}.csv", low_memory=False)
    t["quando"] = pd.to_datetime(t["calcio_dinizio"], utc=True, errors="coerce")
    t = t.sort_values(["team_id", "season_id", "quando", "event_id"]).copy()
    t["turno_ricavato"] = t.groupby(["team_id", "season_id"]).cumcount() + 1

    def prevedi(tavola, turno):
        x = tavola[ordine].astype(float).copy()
        x["contesto_turno"] = turno
        return np.exp(intercetta + ((x.to_numpy() - media) / scala) @ coefficienti)

    altre = [n for n in ordine if n != "contesto_turno"]
    completa = t[altre].notna().all(axis=1) & t["valore"].notna()

    print(f"\n=== {bersaglio}: {len(t)} righe, {int(completa.sum())} con tutti gli altri ingressi")
    for nome in ["baseline_restringimento", "baseline_lega", "baseline_squadra_stagione"]:
        if nome not in t.columns:
            print("  manca la colonna", nome)

    # 1. Dove il turno della fonte c'e': stessa riga, due turni.
    controllo = t[completa & t["contesto_turno"].notna() & (t["league_id"] != MLS)]
    fonte = prevedi(controllo, controllo["contesto_turno"])
    ricavato = prevedi(controllo, controllo["turno_ricavato"])
    vero = controllo["valore"].to_numpy()
    scarto = np.abs(ricavato / fonte - 1) * 100
    print(f"  controllo, {len(controllo)} righe con turno della fonte:")
    print(f"    MAE col turno della fonte {np.abs(fonte - vero).mean():.4f} | col turno ricavato {np.abs(ricavato - vero).mean():.4f}")
    print(f"    differenza fra le due previsioni: media {scarto.mean():.3f}% | 95° percentile {np.percentile(scarto, 95):.3f}% | massima {scarto.max():.3f}%")
    print(f"    media prevista {fonte.mean():.3f} contro media osservata {vero.mean():.3f}")

    # 2. MLS: mai vista dal modello di questo bersaglio.
    mls = t[completa & (t["league_id"] == MLS)]
    if len(mls) == 0:
        print("  MLS: nessuna riga con tutti gli altri ingressi")
        continue
    modello = prevedi(mls, mls["turno_ricavato"])
    vero = mls["valore"].to_numpy()
    print(f"  MLS, {len(mls)} righe, {mls['season_id'].nunique()} stagioni, dal {mls['quando'].min():%Y-%m-%d} al {mls['quando'].max():%Y-%m-%d}:")
    print(f"    modello col turno ricavato: MAE {np.abs(modello - vero).mean():.4f} | bias {np.mean(modello - vero):+.4f}")
    for nome in ["baseline_restringimento", "baseline_lega", "baseline_squadra_stagione"]:
        if nome in mls.columns and mls[nome].notna().all():
            b = mls[nome].to_numpy(dtype=float)
            print(f"    {nome}: MAE {np.abs(b - vero).mean():.4f} | bias {np.mean(b - vero):+.4f}")
    # Lo stesso confronto diviso in due meta' di tempo: un vantaggio che c'e' in una sola
    # meta' non e' un vantaggio.
    meta = mls["quando"].rank(method="first") <= len(mls) / 2
    if "baseline_restringimento" in mls.columns:
        b = mls["baseline_restringimento"].to_numpy(dtype=float)
        for etichetta, parte in [("prima meta'", meta.to_numpy()), ("seconda meta'", ~meta.to_numpy())]:
            print(f"    {etichetta}: modello {np.abs(modello[parte] - vero[parte]).mean():.4f} | ripiego {np.abs(b[parte] - vero[parte]).mean():.4f} | {int(parte.sum())} righe")
        # Quante volte su cento il modello sbaglia meno del ripiego, e l'incertezza della
        # differenza media per ricampionamento sulle gare.
        diff = np.abs(b - vero) - np.abs(modello - vero)
        rng = np.random.default_rng(7)
        medie = [diff[rng.integers(0, len(diff), len(diff))].mean() for _ in range(2000)]
        print(f"    vantaggio medio del modello sul ripiego: {diff.mean():+.4f} (intervallo 95%: {np.percentile(medie, 2.5):+.4f} .. {np.percentile(medie, 97.5):+.4f})")

    # 3. Le probabilita' sulle linee: in MLS dicono il vero quanto altrove?
    from math import lgamma, exp, log
    dispersione = float(artefatto["calibration"]["dispersione"])
    assert artefatto["calibration"]["distribuzione_intervallo"] == "binomiale_negativa"

    def sopra(mu, soglia):
        r, p = mu / (dispersione - 1), 1 / dispersione
        k = np.arange(0, int(soglia) + 1)
        logpmf = [lgamma(i + r) - lgamma(r) - lgamma(i + 1) + r * log(p) + i * log(1 - p) for i in k]
        return 1 - sum(exp(v) for v in logpmf)

    for nome, righe, previste in [("controllo", controllo, fonte), ("MLS", mls, modello)]:
        promesse, esiti = [], []
        for mu, v in zip(previste, righe["valore"].to_numpy()):
            centro = round(mu) - 0.5
            for passo in (-2, -1, 0, 1, 2):
                s = centro + passo
                if s < 0:
                    continue
                p = sopra(mu, s)
                # Il lato piu' probabile, come lo mostra la pagina.
                promesse.append(max(p, 1 - p))
                esiti.append((v > s) if p >= 0.5 else (v < s))
        promesse, esiti = np.array(promesse), np.array(esiti, dtype=float)
        riga = f"    linee {nome}: promesso {promesse.mean()*100:.1f}% reso {esiti.mean()*100:.1f}% su {len(esiti)} letture"
        for da, a in [(0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 1.01)]:
            m = (promesse >= da) & (promesse < a)
            riga += f" | {int(da*100)}-{min(int(a*100),100)}: {promesse[m].mean()*100:.1f}->{esiti[m].mean()*100:.1f}"
        print(riga)
