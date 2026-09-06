// La vetrina delle letture in arrivo, in cima ai Pronostici.
//
// **Non e' una vetrina di riuscite.** Il prodotto di riferimento mostra soltanto gli
// azzeccati fra l'88 e il 99 per cento, che e' una selezione e non una misura. Qui accanto
// alle letture in arrivo c'e' il rimando al consuntivo completo di quelle passate, prese e
// sbagliate: senza quel collegamento questa sezione non si pubblica.
//
// **Il criterio e' quello scelto il 6 settembre 2026 dopo averne misurati cinque**: la
// lettura piu' probabile dentro la fascia fino all'ottanta per cento, dove promesso e reso
// coincidono. Il criterio precedente ordinava per scostamento dalla media di lega e portava
// in cima la coda degli errori del modello.
import Link from "next/link";

import type { VoceDiVetrina } from "@/server/iqstats/vetrina";

import { FAMIGLIE } from "./match-projection-section";

const QUANDO: Intl.DateTimeFormatOptions = {
  weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Rome",
};

function quando(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "orario non disponibile"
    : data.toLocaleString("it-IT", QUANDO);
}

function soglia(valore: number): string {
  return String(valore).replace(".", ",");
}

type Props = Readonly<{
  letture: readonly VoceDiVetrina[];
  calcolataIl: string;
}>;

export function VetrinaSection({ letture, calcolataIl }: Props) {
  return (
    <section className="oggi" aria-labelledby="vetrina-title">
      <div className="oggi-eyebrow">
        <span className="oggi-kick">In arrivo</span>
        <span className="oggi-line" aria-hidden="true" />
        <span className="oggi-src">letture scelte il {quando(calcolataIl)}</span>
      </div>

      <h2 id="vetrina-title" className="squad-title">
        Le letture più probabili delle prossime gare
      </h2>
      <p className="home-lede">
        Una lettura per gara, la più probabile <b>dentro la fascia dove promesso e reso
        coincidono</b>: fino all&apos;ottanta per cento. Sopra quella soglia il modello
        promette 81,5% e rende 74,7%, misurato su 1.200 gare chiuse, quindi lì la cima non si
        prende. Le prime si assomigliano per forza di cose, tutte contro il tetto:{" "}
        <b>a parità di punto percentuale viene prima il bersaglio che sbaglia meno</b>, e
        l&apos;affidabilità sta scritta accanto a ciascuna.{" "}
        <Link href="/metodo#consuntivo-title">Quanto ci prendiamo, comprese le volte in cui
        sbagliamo</Link>.
      </p>

      <ol className="partite-rows">
        {letture.map((voce, indice) => {
          const famiglia = FAMIGLIE[voce.bersaglio];
          const chi = voce.lato === "casa" ? voce.casa
            : voce.lato === "trasferta" ? voce.fuori : "Totale gara";
          return (
            <li key={`${voce.gara}-${voce.bersaglio}-${voce.lato}`}>
              <Link className="partite-row" href={`/match/${voce.gara}`}>
                <span className="partite-time">{indice + 1}</span>
                <span className="partite-teams">
                  {voce.casa} - {voce.fuori}
                  <span className="engine-obs">
                    {voce.lega} · {quando(voce.kickoff)}
                  </span>
                  <span className="engine-obs">
                    <b>
                      {voce.verso} {soglia(voce.soglia)}{" "}
                      {famiglia?.nome ?? voce.bersaglio}
                    </b>{" "}
                    · {chi}
                    {voce.base === null
                      ? " · non sappiamo quanto sia normale in questa lega"
                      : ` · in questa lega succede il ${Math.round(voce.base)}% delle volte`}
                    {" · affidabilità "}{voce.affidabilita}/100
                  </span>
                </span>
                <span className="partite-read">
                  <b>{Math.round(voce.probabilita * 100)}%</b>
                  <i>la nostra</i>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <p className="dossier-src">
        <b>Non è una lista di vincenti.</b> Sono le letture che il dossier metterebbe in cima
        a quelle gare, scelte prima che si giochino e senza sapere come andranno. Il
        consuntivo qui sopra conta <b>tutte</b> quelle passate, prese e sbagliate: è la metà
        che rende questa sezione una misura invece di una selezione.
      </p>
    </section>
  );
}
