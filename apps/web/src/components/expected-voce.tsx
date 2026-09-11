// La voce di una gara di Expected: le due squadre, l'ora, il consigliato.
//
// **Sta qui perche' la aprono due pagine.** L'indice di Expected la usa per ogni giorno
// coperto; la home la usa per il primo giorno con gare ancora da giocare. Prima la home
// mostrava un'altra cosa - lo scarto sull'1x2, sei gare, un numero che non ricompare da
// nessun'altra parte del prodotto - e chi apriva l'app trovava in prima schermata un
// criterio diverso da quello su cui tutto il resto e' costruito.
//
// Gli aiutanti che formattano una lettura stanno qui con lei, e non nella pagina, cosi'
// esiste **una** scrittura di «Over 2,5 corner» e non due che possono divergere.
import Link from "next/link";

import { TeamCrest } from "@/components/team-crest";
import { FAMIGLIE } from "@/components/match-projection-section";
import type { GaraExpected, RigaDiFamiglia } from "@/server/iqstats/expected-famiglie";

/** Dentro un giorno la data e' gia' scritta nella testata: resta l'ora. */
const ORA: Intl.DateTimeFormatOptions = {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
};

export function ora(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "orario non disponibile" : data.toLocaleString("it-IT", ORA);
}

/** La virgola al posto del punto: e' la voce italiana delle soglie. */
export function soglia(valore: number): string {
  return String(valore).replace(".", ",");
}

export function nomeFamiglia(bersaglio: string): string {
  return FAMIGLIE[bersaglio]?.nome ?? bersaglio;
}

export function chiRiguarda(
  lato: RigaDiFamiglia["lato"],
  casa: string,
  fuori: string,
): string {
  return lato === "casa" ? casa : lato === "trasferta" ? fuori : "Totale gara";
}

/** La linea come si legge: «Over 2,5 fuorigioco». */
export function linea(r: RigaDiFamiglia): string {
  return `${r.verso} ${soglia(r.soglia)} ${nomeFamiglia(r.bersaglio)}`;
}

/**
 * L'indirizzo della gara: `fixtureId` decide, il resto si legge.
 *
 * I nomi delle squadre e la data non entrano in nessuna ricerca - sono etichette, e una
 * gara resta la stessa anche se il nome cambia - ma un indirizzo che dice chi gioca si
 * condivide, e uno che dice solo un numero no.
 */
export function indirizzoDi(g: GaraExpected): string {
  const q = new URLSearchParams();
  if (g.lega !== null) q.set("league", g.lega);
  q.set("home", g.casa);
  q.set("away", g.fuori);
  q.set("fixtureId", String(g.gara));
  q.set("date", g.kickoff.slice(0, 10));
  return `/expected?${q.toString()}`;
}

/** La riga di una gara: chi gioca, quando, e la lettura consigliata con la sua probabilita'. */
export function VoceDiGara({ g }: { readonly g: GaraExpected }) {
  return (
    <li>
      <Link className="expected-voce" href={indirizzoDi(g)}>
        <span className="expected-gara-squadre">
          <TeamCrest name={g.casa} teamId={g.casaId} />
          {g.casa} contro <TeamCrest name={g.fuori} teamId={g.fuoriId} />
          {g.fuori}
        </span>
        <span className="engine-obs">
          {ora(g.kickoff)} · {g.lega ?? "competizione non dichiarata"}
          {g.famiglie.length === 7 ? "" : ` · ${g.famiglie.length} famiglie su 7`}
        </span>
        {g.consigliato === null ? (
          <span className="engine-obs">nessun consigliato per questa gara</span>
        ) : (
          <span className="expected-sintesi">
            <b>{linea(g.consigliato)}</b>
            {" · "}
            {chiRiguarda(g.consigliato.lato, g.casa, g.fuori)}
            {" · "}
            <b>{Math.round(g.consigliato.probabilita * 100)}%</b>
          </span>
        )}
      </Link>
    </li>
  );
}
