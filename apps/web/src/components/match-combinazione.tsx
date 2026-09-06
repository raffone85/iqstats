"use client";

// Più letture della stessa gara, messe insieme sulla griglia dei punteggi.
//
// **Non moltiplica niente.** La probabilità di due o più condizioni è la somma delle
// caselle della griglia che le soddisfano tutte, calcolata qui nel browser dalle stesse
// due medie attese che la sezione mostra sopra: nessuna chiamata, nessun dato nuovo.
// Accanto sta il prodotto delle condizioni prese una per una, che è il numero sbagliato,
// e quanto sbaglia: è la voce 18 del piano, dove senza la correlazione non si mostra nulla.
//
// **I sette bersagli del motore non entrano qui**, ed è misurato: nella stessa gara tiri e
// tiri in porta stanno a 0,622, tiri e parate a 0,556, falli e gialli a 0,413 su 11.066
// gare. La loro congiunta non è modellata, quindi una combinazione fra bersagli diversi
// non avrebbe un numero onesto da mostrare.
import { useMemo, useState } from "react";

import { combinazione, type Condizione } from "@/server/iqstats/projection/gol";

type Props = {
  readonly attesiCasa: number;
  readonly attesiTrasferta: number;
  readonly homeTeam: string;
  readonly awayTeam: string;
};

interface Voce {
  readonly chiave: string;
  readonly etichetta: string;
  readonly condizione: Condizione;
}

function percento(quota: number): string {
  return `${(quota * 100).toFixed(1).replace(".", ",")}%`;
}

function gruppi(homeTeam: string, awayTeam: string): ReadonlyArray<{
  readonly nome: string;
  readonly voci: readonly Voce[];
}> {
  const linee = [1.5, 2.5, 3.5, 4.5];
  return [
    {
      nome: "Esito",
      voci: [
        { chiave: "1", etichetta: homeTeam, condizione: { tipo: "esito", quale: "uno" } },
        { chiave: "X", etichetta: "Pareggio", condizione: { tipo: "esito", quale: "x" } },
        { chiave: "2", etichetta: awayTeam, condizione: { tipo: "esito", quale: "due" } },
      ],
    },
    {
      nome: "Doppia chance",
      voci: [
        { chiave: "1X", etichetta: "1X", condizione: { tipo: "doppia", quale: "unoX" } },
        { chiave: "X2", etichetta: "X2", condizione: { tipo: "doppia", quale: "xDue" } },
        { chiave: "12", etichetta: "12", condizione: { tipo: "doppia", quale: "unoDue" } },
      ],
    },
    {
      nome: "Gol totali",
      voci: linee.flatMap((soglia) => {
        const nome = String(soglia).replace(".", ",");
        return [
          {
            chiave: `O${soglia}`,
            etichetta: `Over ${nome}`,
            condizione: { tipo: "totale", verso: "sopra", linea: soglia } as Condizione,
          },
          {
            chiave: `U${soglia}`,
            etichetta: `Under ${nome}`,
            condizione: { tipo: "totale", verso: "sotto", linea: soglia } as Condizione,
          },
        ];
      }),
    },
    {
      nome: "Entrambe segnano",
      voci: [
        { chiave: "GG", etichetta: "Sì", condizione: { tipo: "entrambe", segnano: true } },
        { chiave: "NG", etichetta: "No", condizione: { tipo: "entrambe", segnano: false } },
      ],
    },
  ];
}

export function MatchCombinazione({ attesiCasa, attesiTrasferta, homeTeam, awayTeam }: Props) {
  const [scelte, setScelte] = useState<readonly string[]>([]);
  const elenco = useMemo(() => gruppi(homeTeam, awayTeam), [homeTeam, awayTeam]);
  const tutte = useMemo(() => elenco.flatMap((gruppo) => gruppo.voci), [elenco]);

  const scelte_ = tutte.filter((voce) => scelte.includes(voce.chiave));
  const esito = useMemo(
    () => combinazione(attesiCasa, attesiTrasferta, scelte_.map((voce) => voce.condizione)),
    // Le condizioni sono ricavate dalle chiavi: dipendere da quelle evita di ricalcolare
    // a ogni render per una lista nuova ma uguale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attesiCasa, attesiTrasferta, scelte, tutte],
  );

  const commuta = (chiave: string) => {
    setScelte((precedenti) =>
      precedenti.includes(chiave)
        ? precedenti.filter((altra) => altra !== chiave)
        : [...precedenti, chiave],
    );
  };

  const punti = (esito.congiunta - esito.prodotto) * 100;

  return (
    <div className="combo">
      {elenco.map((gruppo) => (
        <div className="combo-gruppo" key={gruppo.nome}>
          <p className="combo-nome">{gruppo.nome}</p>
          <div className="combo-voci">
            {gruppo.voci.map((voce) => {
              const acceso = scelte.includes(voce.chiave);
              return (
                <button
                  type="button"
                  className={`combo-chip${acceso ? " is-acceso" : ""}`}
                  key={voce.chiave}
                  aria-pressed={acceso}
                  onClick={() => commuta(voce.chiave)}
                >
                  {voce.etichetta}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="combo-esito" aria-live="polite">
        {scelte_.length === 0 ? (
          <p className="combo-invito">
            Scegli due o più letture di questa gara: la probabilità che accadano{" "}
            <b>insieme</b> non è il prodotto delle loro probabilità, e qui si vedono tutte e
            due.
          </p>
        ) : esito.congiunta === 0 ? (
          <p className="combo-invito">
            Queste letture <b>non possono accadere nella stessa gara</b>. Moltiplicandole
            verrebbe {percento(esito.prodotto)}, che è la probabilità di una gara che non
            esiste.
          </p>
        ) : (
          <>
            <p className="combo-quota">
              <b>{percento(esito.congiunta)}</b>
              <span>
                {scelte_.length === 1 ? "questa lettura" : `queste ${scelte_.length} letture insieme`}
              </span>
            </p>
            {scelte_.length > 1 ? (
              <p className="combo-nota">
                Moltiplicando le {scelte_.length} probabilità separate verrebbe{" "}
                <b>{percento(esito.prodotto)}</b>:{" "}
                <span className={punti >= 0 ? "is-sopra" : "is-sotto"}>
                  {punti >= 0 ? "+" : "−"}
                  {Math.abs(punti).toFixed(1).replace(".", ",")} punti
                </span>{" "}
                di differenza. Le letture della stessa gara <b>non sono indipendenti</b>:
                nascono dallo stesso punteggio.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
