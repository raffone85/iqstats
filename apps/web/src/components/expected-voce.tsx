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
import type {
  Consigliato, EsitoDiFamigliaInGara, GaraExpected, RigaDiFamiglia,
} from "@/server/iqstats/expected-famiglie";
import type { TendenzaArbitro } from "@/server/iqstats/projection/letture-forti";

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

/** Il consigliato come si legge: la linea, o «Corner 1X2: 1» per l'esito di famiglia. */
export function consiglio(c: Consigliato): string {
  return c.tipo === "esito" ? `${nomeFamiglia(c.bersaglio)} 1X2: ${c.esito}` : linea(c);
}

/** A chi si riferisce il consigliato: la squadra della linea, o chi ne fa di piu'. */
export function chiDelConsiglio(c: Consigliato, casa: string, fuori: string): string {
  if (c.tipo === "linea") return chiRiguarda(c.lato, casa, fuori);
  return c.esito === "1" ? `${casa} ne fa di più` : c.esito === "2" ? `${fuori} ne fa di più` : "pari";
}

/** Un numero con segno e virgola: «+2,1», «−0,4». */
function conSegno(valore: number): string {
  return `${valore > 0 ? "+" : "−"}${soglia(Math.abs(Math.round(valore * 10) / 10))}`;
}

/** L'arbitro contro la sua lega, in una riga: solo sui falli, dove decide se il consiglio sale. */
export function arbitroInBreve(a: TendenzaArbitro): string {
  return `arbitro ${conSegno(a.totale)} falli a gara sulla lega (casa ${conSegno(a.casa)}, `
    + `trasferta ${conSegno(a.trasferta)}), su ${a.gare} gare`;
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

/**
 * L'1X2 di una famiglia in breve: l'esito piu' probabile, e se il banco lo quota.
 *
 * **Informativo**: il consigliato non lo legge. Dal 19 settembre 2026 il consigliato propone
 * solo esiti che il banco quota, e gli 1X2 di falli e tiri non comparivano quasi piu': qui
 * restano visibili, con la nostra probabilita' e senza cambiare il criterio.
 */
function EsitoInBreve({ e, quote }: {
  readonly e: EsitoDiFamigliaInGara;
  readonly quote: GaraExpected["quote"];
}) {
  // La linea Under/Over quotata piu' probabile della famiglia, dentro gli stessi confini del
  // consigliato: tetto all'ottanta per cento e niente soglie fuori misura. Informativa anche
  // lei: il consigliato finisce quasi sempre sui corner, che il banco apre su quindici linee.
  const linee = quote.filter((r) => r.bersaglio === e.bersaglio && r.probabilita !== null
    && r.probabilita <= 0.8 && !r.fuoriFinestra);
  const migliore = linee.reduce<(typeof linee)[number] | null>(
    (m, r) => (m === null || (r.probabilita ?? 0) > (m.probabilita ?? 0) ? r : m), null);
  const p = e.probabilita;
  const primo = p === null ? null
    : ([["1", p.uno], ["X", p.x], ["2", p.due]] as const).reduce((m, s) => (s[1] > m[1] ? s : m));
  const quotato = primo === null ? e.quote !== null : (e.quote?.[primo[0]] ?? null) !== null;
  return (
    <span className="expected-esito" role="listitem">
      <span>{nomeFamiglia(e.bersaglio)}</span>
      <span>
        <b>{primo === null ? "stima assente" : `${primo[0]} ${Math.round(primo[1] * 100)}%`}</b>
        {quotato ? <span className="engine-obs"> banco</span> : null}
      </span>
      {migliore === null ? <span className="engine-obs">U/O assente</span> : (
        <span>
          {migliore.verso} {soglia(migliore.soglia)}{" "}
          <span className="engine-obs">
            {migliore.lato === "casa" ? "casa" : migliore.lato === "trasferta" ? "ospite" : "totale"}
          </span>{" "}
          <b>{Math.round((migliore.probabilita ?? 0) * 100)}%</b>
        </span>
      )}
    </span>
  );
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
            <b>{consiglio(g.consigliato)}</b>
            {" · "}
            {chiDelConsiglio(g.consigliato, g.casa, g.fuori)}
            {" · "}
            <b>{Math.round(g.consigliato.probabilita * 100)}%</b>
          </span>
        )}
        {g.consigliato?.arbitro == null ? null : (
          <span className="engine-obs">{arbitroInBreve(g.consigliato.arbitro)}</span>
        )}
        {g.esiti === undefined ? null : (
          <span className="expected-esiti">
            <span className="engine-obs">
              Per famiglia, informativo: 1X2 (banco = lo quota) e miglior linea U/O del banco
            </span>
            <span className="expected-esiti-griglia" role="list">
              {g.esiti.map((e) => <EsitoInBreve key={e.bersaglio} e={e} quote={g.quote} />)}
            </span>
          </span>
        )}
      </Link>
    </li>
  );
}
