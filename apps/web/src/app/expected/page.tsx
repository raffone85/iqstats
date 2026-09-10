// Expected: le due squadre che si affrontano, i numeri con le loro soglie, un consigliato.
//
// **Che cosa questa pagina non fa.** Non mostra come il motore arriva ai numeri: niente
// ricerca, niente passaggi, niente formula. Il calcolo resta nel codice - `candidateDiGara`,
// `baseDiLega`, `arricchisci` - e in pagina arriva soltanto l'esito, con accanto il campione
// su cui poggia.
//
// **Il consigliato non e' scelto qui.** Lo sceglie `ordinaLetture`, cioe' il criterio di cui
// il consuntivo di `/metodo` conosce la resa. Un criterio scelto in questa pagina sarebbe un
// pronostico senza consuntivo, ed e' la ragione della decisione presa il 6 settembre 2026.
//
// **La motivazione sono i numeri.** Quanto diciamo noi, quanto succede in quel campionato e
// su quante gare, di quanto ce ne stacchiamo, quanto quella famiglia ha reso sulle gare gia'
// chiuse. Dove lo scarto e' vicino a zero la lettura e' la norma del torneo, e il blocco lo
// dichiara invece di spacciarla per nostra: e' li' che un consiglio smette di essere banale.
import type { Metadata } from "next";
import Link from "next/link";

import { ProductShell } from "@/components/product-shell";
import { TeamCrest } from "@/components/team-crest";
import { articoloDiPercentuale } from "@/lib/italiano";
import { FAMIGLIE } from "@/components/match-projection-section";
import { resaDelBersaglio, GARE_DEL_CONSUNTIVO } from "@/server/iqstats/consuntivo";
import { expectedDelleGare, type RigaDiFamiglia } from "@/server/iqstats/expected-famiglie";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Expected",
  description:
    "Le gare in arrivo con i numeri del motore: tiri, tiri in porta, falli, cartellini, "
    + "corner, fuorigioco e parate con le loro soglie, e il pronostico consigliato.",
};

const QUANDO: Intl.DateTimeFormatOptions = {
  weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Rome",
};

function quando(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? "orario non disponibile"
    : data.toLocaleString("it-IT", QUANDO);
}

/** La virgola al posto del punto: e' la voce italiana delle soglie. */
function soglia(valore: number): string {
  return String(valore).replace(".", ",");
}

function virgola(valore: number): string {
  return valore.toFixed(1).replace(".", ",");
}

function nomeFamiglia(bersaglio: string): string {
  return FAMIGLIE[bersaglio]?.nome ?? bersaglio;
}

function chiRiguarda(lato: RigaDiFamiglia["lato"], casa: string, fuori: string): string {
  return lato === "casa" ? casa : lato === "trasferta" ? fuori : "Totale gara";
}

/** La linea come si legge: «Over 2,5 fuorigioco». */
function linea(r: RigaDiFamiglia): string {
  return `${r.verso} ${soglia(r.soglia)} ${nomeFamiglia(r.bersaglio)}`;
}

export default async function ExpectedPage() {
  const expected = expectedDelleGare();

  if (expected === null) {
    return (
      <ProductShell activeSection="expected">
        <section className="page-intro" aria-labelledby="expected-title">
          <p className="eyebrow">Expected</p>
          <h1 id="expected-title">Nessuna gara in arrivo con una proiezione.</h1>
          {/* Un'assenza si dichiara assenza: l'artefatto e' vecchio o le gare che copriva
              sono gia' cominciate. Non si mostra una pagina vuota che sembra piena. */}
          <p>
            L&apos;elenco viene da un calcolo offline, e quello disponibile non copre nessuna
            gara ancora da giocare. Le proiezioni della singola gara restano dentro il suo{" "}
            <Link href="/partite">dossier</Link>.
          </p>
        </section>
      </ProductShell>
    );
  }

  const { gare, calcolatoIl } = expected;

  return (
    <ProductShell activeSection="expected">
      <section className="page-intro" aria-labelledby="expected-title">
        <p className="eyebrow">Expected</p>
        <h1 id="expected-title">
          {gare.length === 1 ? "Una gara in arrivo." : `${gare.length} gare in arrivo.`}
        </h1>
        <p className="home-lede home-legenda">
          <b>Probabilita&apos; del motore, con la soglia.</b> Calcolato il{" "}
          {quando(calcolatoIl)} · consuntivo su {GARE_DEL_CONSUNTIVO.toLocaleString("it-IT")}{" "}
          gare chiuse
        </p>
      </section>

      {gare.map((g) => {
        const resa = g.consigliato === null ? null : resaDelBersaglio(g.consigliato.bersaglio);
        // **Una gara e' una riga, il resto si apre.** Aperte tutte insieme, ventiquattro
        // gare facevano 29.986 px a 375: piu' della pagina che questa sezione doveva
        // alleggerire. In riga sta la risposta - le due squadre e il consigliato con la sua
        // probabilita' - e sotto, a richiesta, i numeri che la reggono.
        return (
          <details className="expected-gara" key={g.gara}>
            <summary>
              <span className="expected-gara-squadre">
                <TeamCrest name={g.casa} teamId={g.casaId} />
                {g.casa} contro <TeamCrest name={g.fuori} teamId={g.fuoriId} />
                {g.fuori}
              </span>
              <span className="engine-obs">
                {g.lega ?? "competizione non dichiarata"} · {quando(g.kickoff)}
              </span>
              {g.consigliato === null ? (
                <span className="engine-obs">nessun consigliato per questa gara</span>
              ) : (
                <span className="expected-sintesi">
                  <b>{linea(g.consigliato)}</b> · {chiRiguarda(g.consigliato.lato, g.casa, g.fuori)}
                  {" · "}
                  <b>{Math.round(g.consigliato.probabilita * 100)}%</b>
                </span>
              )}
            </summary>

            <div className="expected-dettaglio">
            {g.consigliato === null ? null : (
              <div className="expected-consiglio">
                <p className="eyebrow">Consigliato</p>
                <p className="expected-lettura">
                  <b>{linea(g.consigliato)}</b> · {chiRiguarda(g.consigliato.lato, g.casa, g.fuori)}
                </p>
                <ul className="expected-motivi">
                  <li>
                    nostra <b>{Math.round(g.consigliato.probabilita * 100)}%</b> · affidabilità{" "}
                    {g.consigliato.affidabilita}/100
                  </li>
                  {g.consigliato.base === null ? (
                    <li>non sappiamo quanto sia normale in questo campionato</li>
                  ) : (
                    <li>
                      in questo campionato succede{" "}
                      {articoloDiPercentuale(g.consigliato.base)}
                      {Math.round(g.consigliato.base)}% delle volte
                      {g.consigliato.gareDiBase === null
                        ? ""
                        : ` su ${g.consigliato.gareDiBase} gare`}
                      {g.consigliato.scarto === null ? "" : ` · scarto ${
                        g.consigliato.scarto > 0 ? "+" : ""}${virgola(g.consigliato.scarto)} punti`}
                    </li>
                  )}
                  {/* La resa della famiglia sulle gare gia' chiuse: e' la meta' che rende
                      questo un consiglio misurato invece che una promessa. */}
                  {resa === null ? (
                    <li>di questa famiglia non abbiamo ancora un consuntivo</li>
                  ) : (
                    <li>
                      questa famiglia ha reso <b>{virgola(resa.frequenzaOsservata * 100)}%</b>{" "}
                      contro il {virgola(resa.probabilitaPromessa * 100)}% promesso, su{" "}
                      {resa.letture} letture
                    </li>
                  )}
                </ul>
              </div>
            )}

            <ol className="partite-rows">
              {g.famiglie.map((r) => (
                <li key={`${r.bersaglio}-${r.lato}-${r.soglia}-${r.verso}`}>
                  <span className="expected-riga">
                    <span className="expected-riga-linea">
                      {linea(r)}
                      <span className="engine-obs">
                        {chiRiguarda(r.lato, g.casa, g.fuori)}
                        {r.base === null
                          ? " · base di campionato non disponibile"
                          : ` · campionato ${Math.round(r.base)}%${
                            r.gareDiBase === null ? "" : ` su ${r.gareDiBase} gare`}`}
                      </span>
                    </span>
                    <span className="expected-riga-valore">
                      <b>{Math.round(r.probabilita * 100)}%</b>
                      <i>affidabilità {r.affidabilita}</i>
                    </span>
                  </span>
                </li>
              ))}
            </ol>

            {g.senzaMisura.length === 0 ? null : (
              <p className="engine-obs">
                Senza misura in questa gara:{" "}
                {g.senzaMisura.map(nomeFamiglia).join(", ")} — l&apos;arbitro non è ancora
                designato.
              </p>
            )}

            {/* Il collegamento al dossier sta qui e non nel riepilogo: dentro un
                `<summary>` competerebbe con il gesto che apre la riga. */}
            <p className="expected-apri">
              <Link href={`/match/${g.gara}`}>Apri il dossier della gara</Link>
            </p>
            </div>
          </details>
        );
      })}
    </ProductShell>
  );
}
