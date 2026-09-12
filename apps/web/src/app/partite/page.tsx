import { statoInGioco } from "@iqstats/shared";
import type { Metadata } from "next";
import Link from "next/link";

import { ProductShell } from "@/components/product-shell";
import { LeagueIdentity } from "@/components/league-identity";
import { VerifiedMediaImage } from "@/components/verified-media-image";
import { CampionatiPreferiti } from "@/components/campionati-preferiti";
import { Targhette } from "@/components/calendario-giornate";
import { DateJump } from "@/components/date-jump";
import { AggiornamentoLive } from "@/components/aggiornamento-live";
import { GuidaPartite } from "@/components/guida-partite";
import { LeagueSelect, type LeagueOption } from "@/components/league-select";
import { coperturaDelleGare } from "@/server/iqstats/copertura";
import { getMatchesByDate, MATCHES_TTL_MS, type MatchListItem } from "@/server/iqstats/matches";
import { getPredictionsByDate } from "@/server/iqstats/predictions";
import { readMatch, readOutcome } from "@/server/iqstats/match-reading";

export const metadata: Metadata = {
  title: "Partite",
  description: "Le gare del giorno di tutti i campionati, con calendario dei prossimi giorni. Filtro lega opzionale.",
};

type PartitePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const timeFormatter = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

function todayRomeIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

/**
 * I sette giorni della barra, **attorno a quello mostrato** e non a oggi.
 *
 * Prima la barra partiva sempre da oggi e guardava solo avanti: scelta una data, non si
 * poteva proseguire oltre la settimana ne' tornare indietro di un giorno, e il passato era
 * irraggiungibile. Con la finestra centrata la barra scorre nei due versi, e il passato
 * serve: e' li' che vivono le gare finite, quindi la verifica di quello che avevamo detto.
 */
function buildDateBar(centroIso: string): { iso: string; label: string }[] {
  const base = new Date(`${centroIso}T12:00:00Z`);
  const labelFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
  const isoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getTime() + (i - 3) * 86_400_000);
    return { iso: isoFmt.format(d), label: labelFmt.format(d).replace(".", "") };
  });
}

function scalar(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function formatTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : timeFormatter.format(d);
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/**
 * I quattro filtri di stato del calendario.
 *
 * **Rinviate e annullate stanno solo in «tutte»**, e non e' una dimenticanza: non sono ne'
 * in corso, ne' da giocare, ne' finite, e infilarle in uno dei tre gruppi farebbe sparire
 * dal conto una gara che esiste. Chi le cerca le trova dove ci sono tutte.
 */
/**
 * I filtri di stato, con gli stati **della fonte** perche' e' quello che l'elenco porta.
 *
 * «Live» non elenca piu' i due stati a mano: la fonte non manda mai «live» ne'
 * «inprogress», manda `1st_half`, `halftime` e `2nd_half`, e con la lista scritta qui il
 * filtro trovava zero gare su trentasette in corso. Ora la domanda la fa `statoInGioco`,
 * che tiene quella lista in un posto solo.
 */
const STATI = [
  { chiave: "tutte", nome: "Tutte", stati: null },
  { chiave: "live", nome: "Live", stati: "in-gioco" },
  { chiave: "da-giocare", nome: "Da giocare", stati: ["notstarted", "upcoming", "delayed"] },
  { chiave: "finite", nome: "Finite", stati: ["finished"] },
] as const;

/** Vero quando la gara passa il filtro scelto. */
function passaIlFiltro(stato: string, ammessi: readonly string[] | "in-gioco" | null): boolean {
  if (ammessi === null) return true;
  if (ammessi === "in-gioco") return statoInGioco(stato);
  return ammessi.includes(stato);
}

type ChiaveStato = (typeof STATI)[number]["chiave"];

function statusInfo(status: string): { label: string; tone: string } {
  // Gli stati del gioco - primo tempo, intervallo, secondo tempo, supplementari, rigori -
  // sono tutti «Live»: elencarli qui uno per uno voleva dire dimenticarne tre.
  if (statoInGioco(status)) return { label: "Live", tone: "live" };
  const map: Record<string, { label: string; tone: string }> = {
    notstarted: { label: "Prossima", tone: "next" },
    upcoming: { label: "Prossima", tone: "next" },
    inprogress: { label: "Live", tone: "live" },
    live: { label: "Live", tone: "live" },
    delayed: { label: "In ritardo", tone: "warn" },
    finished: { label: "Conclusa", tone: "done" },
    postponed: { label: "Rinviata", tone: "warn" },
    cancelled: { label: "Annullata", tone: "warn" },
  };
  return map[status] ?? { label: "—", tone: "next" };
}

function Crest({ name, teamId }: { name: string; teamId: number | null }) {
  return (
    <span className="oggi-crest-sm">
      <span className="oggi-crest-mono" aria-hidden="true">{initials(name)}</span>
      {teamId ? <VerifiedMediaImage src={`/api/media/team/${teamId}`} className="oggi-crest-img" width={26} height={26} /> : null}
    </span>
  );
}

interface Group {
  readonly id: number | null;
  readonly name: string | null;
  readonly countryCode: string | null;
  readonly matches: MatchListItem[];
}

export default async function PartitePage({ searchParams }: PartitePageProps) {
  const query = await searchParams;
  const today = todayRomeIso();
  const dateParam = scalar(query.date);
  const activeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;
  const leagueParam = scalar(query.leagueId);
  const leagueId = /^[1-9]\d*$/.test(leagueParam) ? Number(leagueParam) : null;
  const statoChiesto = scalar(query.stato);
  const stato: ChiaveStato = STATI.some((s) => s.chiave === statoChiesto)
    ? (statoChiesto as ChiaveStato)
    : "tutte";

  // Gare e letture dello stesso giorno: le letture arrivano da una richiesta sola, quindi
  // l'assaggio in ogni riga non costa traffico in più.
  const [result, predictions] = await Promise.all([
    getMatchesByDate(activeDate),
    getPredictionsByDate(activeDate),
  ]);
  const allMatches = result.matches;
  const readings = new Map(predictions.predictions.map((p) => [p.eventId, p]));

  // Opzioni del filtro lega = solo i campionati che HANNO gare quel giorno.
  const optionMap = new Map<number, LeagueOption>();
  for (const m of allMatches) {
    if (m.leagueId === null) continue;
    const existing = optionMap.get(m.leagueId);
    if (existing) optionMap.set(m.leagueId, { ...existing, count: existing.count + 1 });
    else optionMap.set(m.leagueId, { id: m.leagueId, label: m.leagueName ?? `Lega ${m.leagueId}`, count: 1 });
  }
  const leagueOptions = [...optionMap.values()].sort((a, b) => a.label.localeCompare(b.label));

  const dellaLega = leagueId ? allMatches.filter((m) => m.leagueId === leagueId) : allMatches;
  // I conteggi rispettano il campionato gia' scelto: un numero che non corrisponde a quello
  // che si vedra' cliccando e' peggio di nessun numero.
  const quante = new Map<string, number>(STATI.map((v) => [
    v.chiave,
    v.stati === null
      ? dellaLega.length
      : dellaLega.filter((m) => passaIlFiltro(m.status, v.stati)).length,
  ]));
  // **Quante gare non stanno in nessuno dei tre gruppi.** Rinviate, annullate, e quelle con
  // uno stato che la fonte non dichiara: misurato il 29 agosto 2026, sulle 161 gare del
  // giorno ne restavano fuori 24. Un buco silenzioso in un conteggio si legge come un
  // difetto, quindi la pagina lo dice.
  const dentroIGruppi = STATI
    .filter((v) => v.stati !== null)
    .reduce((totale, v) => totale + (quante.get(v.chiave) ?? 0), 0);
  const fuoriDaiGruppi = dellaLega.length - dentroIGruppi;

  const sceltoStati = STATI.find((v) => v.chiave === stato)?.stati ?? null;
  const shown = sceltoStati === null
    ? dellaLega
    : dellaLega.filter((m) => passaIlFiltro(m.status, sceltoStati));

  /** L'indirizzo che cambia una cosa sola e conserva le altre due. */
  const indirizzo = (cambio: { date?: string; leagueId?: number | null; stato?: ChiaveStato }) => {
    const p = new URLSearchParams();
    p.set("date", cambio.date ?? activeDate);
    const lega = cambio.leagueId === undefined ? leagueId : cambio.leagueId;
    if (lega !== null) p.set("leagueId", String(lega));
    const s = cambio.stato ?? stato;
    if (s !== "tutte") p.set("stato", s);
    return `/partite?${p.toString()}`;
  };

  // **Che cosa si trovera' aprendo ogni gara, prima di aprirla.** Il prodotto di
  // riferimento appende l'etichetta al campionato; qui e' per gara, perche' non e' la
  // competizione a decidere: due squadre della stessa lega possono avere una la stagione
  // in corso dal lato giusto e l'altra no. Una interrogazione sola per tutto l'elenco.
  const coperture = await coperturaDelleGare(shown);

  const groups: Group[] = [];
  const groupMap = new Map<number | string, Group>();
  for (const m of shown) {
    const key = m.leagueId ?? "unknown";
    let g = groupMap.get(key);
    if (!g) {
      g = { id: m.leagueId, name: m.leagueName, countryCode: m.leagueCountryCode, matches: [] };
      groupMap.set(key, g);
      groups.push(g);
    }
    g.matches.push(m);
  }

  // **Che giornata e', prima dell'elenco.** Stessa forma della gara: pochi numeri in cima
  // e la prosa dopo. I conteggi per stato non si ripetono qui, stanno gia' nei filtri, che
  // in piu' sono cliccabili; queste quattro voci dicono cose che i filtri non dicono.
  const conLettura = shown.filter((m) => readings.has(m.eventId)).length;
  const prossima = shown.find((m) => passaIlFiltro(m.status, ["notstarted", "upcoming", "delayed"]));
  const ultima = shown.length > 0 ? shown[shown.length - 1] : undefined;

  // **Una lega sola resta aperta.** Con quarantadue campionati tutti aperti la pagina
  // misurava 45.006 px a 375 px, cinquanta schermate, e il 91,8% erano le 184 righe di
  // gara. Resta aperta quella della **stessa gara** che il verdetto chiama prossimo
  // fischio: aprire la prima lega con una gara non finita apriva un campionato che
  // comincia alle 00:15, e mostrava due risultati della notte mentre il verdetto sopra
  // annunciava le 11:00. Senza gare da giocare - un giorno tutto concluso - si apre la
  // prima, che li' e' la piu' vecchia del giorno ed e' l'unica scelta sensata.
  const daVedere = prossima === undefined ? -1 : groups.findIndex((g) => g.matches.includes(prossima));
  const legaAperta = daVedere === -1 ? 0 : daVedere;

  const dateBar = buildDateBar(activeDate);
  const dateLabel = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${activeDate}T12:00:00Z`));

  return (
    <ProductShell activeSection="home">
      <div className="oggi-backdrop" aria-hidden="true" />
      <section className="partite" aria-labelledby="partite-title">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Partite</span>
          <span className="oggi-line" aria-hidden="true" />
          <span className="oggi-src">
            {result.source === "provider"
              ? [
                // I conteggi sono passati al verdetto sotto il titolo: qui resta la sola
                // provenienza, che e' la voce che il monospazio porta.
                // L'endpoint del calendario non espone nessuna data di aggiornamento: l'unico
                // istante vero e' quello in cui l'abbiamo letto, e la risposta resta in cache
                // per 120 secondi, quindi non coincide con il momento del render.
                result.lettoIl ? "letto alle ".concat(timeFormatter.format(new Date(result.lettoIl))) : null,
              ].filter((voce): voce is string => voce !== null).join(" · ")
              : "Elenco non disponibile"}
          </span>
        </div>
        <h1 id="partite-title" className="partite-title">{dateLabel}</h1>

        {shown.length === 0 ? null : (
          <ul className="verdetto-voci partite-verdetto">
            <li>
              <span className="verdetto-titolo">Gare</span>
              <b className="verdetto-valore">{shown.length}</b>
              <span className="verdetto-sotto">
                in {groups.length === 1 ? "un campionato" : `${groups.length} campionati`}
              </span>
            </li>
            <li>
              <span className="verdetto-titolo">Con una lettura</span>
              <b className="verdetto-valore">{conLettura}</b>
              <span className="verdetto-sotto">
                {conLettura === shown.length ? "tutte quelle del giorno" : `su ${shown.length} gare`}
              </span>
            </li>
            {prossima === undefined ? null : (
              <li>
                <span className="verdetto-titolo">Prossimo fischio</span>
                <b className="verdetto-valore">{formatTime(prossima.kickoff)}</b>
                <span className="verdetto-sotto">{prossima.leagueName ?? "campionato non dichiarato"}</span>
              </li>
            )}
            {ultima === undefined ? null : (
              <li>
                <span className="verdetto-titolo">Ultima in programma</span>
                <b className="verdetto-valore">{formatTime(ultima.kickoff)}</b>
                <span className="verdetto-sotto">{ultima.leagueName ?? "campionato non dichiarato"}</span>
              </li>
            )}
          </ul>
        )}

        {/* Sotto il titolo e sopra i comandi che descrive: si legge una volta, si salta, e
            chi la salta non la rivede. Non e' un velo sopra la pagina. */}
        <GuidaPartite />

        <nav className="partite-datebar" aria-label="Scegli il giorno">
          {dateBar.map((d) => (
            <Link
              key={d.iso}
              href={indirizzo({ date: d.iso })}
              className={`partite-date${d.iso === activeDate ? " is-active" : ""}`}
              aria-current={d.iso === activeDate ? "page" : undefined}
            >
              {d.iso === today ? "Oggi" : d.label}
            </Link>
          ))}
        </nav>

        <div className="partite-salta">
          {dateBar.some((d) => d.iso === today) ? null : (
            <Link className="partite-date" href={indirizzo({ date: today })}>
              Torna a oggi
            </Link>
          )}
          <DateJump date={activeDate} leagueId={leagueId} stato={stato} />
        </div>

        <nav className="partite-stati" aria-label="Stato delle gare">
          {STATI.map((v) => (
            <Link
              key={v.chiave}
              className={`partite-stato${v.chiave === stato ? " is-active" : ""}`}
              href={indirizzo({ stato: v.chiave })}
              aria-current={v.chiave === stato ? "page" : undefined}
            >
              {v.nome} <i>{quante.get(v.chiave) ?? 0}</i>
            </Link>
          ))}
        </nav>

        {fuoriDaiGruppi > 0 ? (
          <p className="partite-fuori">
            {fuoriDaiGruppi === 1
              ? "Una gara non è né in corso né da giocare né finita: è rinviata, annullata, o "
                + "ha uno stato che la fonte non dichiara. La trovi in «Tutte»."
              : `${fuoriDaiGruppi} gare non sono né in corso né da giocare né finite: sono `
                + "rinviate, annullate, o hanno uno stato che la fonte non dichiara. Le trovi "
                + "in «Tutte»."}
          </p>
        ) : null}

        {/* Si contano le gare in corso **fra quelle mostrate**: con il filtro «finite»
            attivo non c'è nessun punteggio che si muove sotto gli occhi, e annunciare un
            aggiornamento che non si vedrebbe sarebbe una promessa vuota. */}
        <AggiornamentoLive
          gareLive={shown.filter((m) => statoInGioco(m.status)).length}
          ogniMs={MATCHES_TTL_MS}
        />

        {leagueOptions.length > 0 ? (
          <div className="partite-filter">
            <label htmlFor="league-filter" className="partite-filter-label">Campionato</label>
            <LeagueSelect
              date={activeDate}
              current={leagueId}
              options={leagueOptions}
              total={allMatches.length}
              stato={stato}
            />
            <span className="partite-filter-hint">Facoltativo · di default vedi tutte le gare del giorno.</span>
          </div>
        ) : null}

        {groups.length > 0 ? (
          <div className="partite-groups">
            {groups.length > 1 ? (
              <CampionatiPreferiti
                voci={groups.map((g) => ({
                  id: g.id,
                  nome: g.name,
                  codice: g.countryCode,
                  gare: g.matches.length,
                }))}
              />
            ) : null}

            {groups.map((g, indice) => (
              <details
                key={g.id ?? "unknown"}
                id={"lega-".concat(String(g.id ?? "altre"))}
                className="partite-group"
                open={indice === legaAperta}
              >
                <summary className="partite-group-head">
                  <LeagueIdentity leagueId={g.id} name={g.name} code={g.countryCode} />
                  {/* «dalle» costava 38 px al nome, che a 375 px ne ha centocinquanta: senza,
                      le teste che andavano a capo spezzando la parola - «NPL Queenslan d»,
                      «USL Champions hip» - scendono, e l'orario da solo si legge lo stesso. */}
                  <span className="partite-group-count">
                    {g.matches.length} · {formatTime(g.matches[0]?.kickoff ?? "")}
                  </span>
                </summary>
                <ul className="partite-list">
                  {g.matches.map((m) => {
                    const st = statusInfo(m.status);
                    const finished = m.homeScore != null && m.awayScore != null;
                    const prediction = readings.get(m.eventId) ?? null;
                    const reading = prediction ? readMatch(prediction, m.homeTeam, m.awayTeam) : null;
                    const outcome = prediction ? readOutcome(prediction, m.homeScore, m.awayScore) : null;
                    return (
                      <li key={m.eventId}>
                        <Link className="partite-row" href={`/match/${m.eventId}`}>
                          <span className="partite-time">{formatTime(m.kickoff)}</span>
                          <span className="partite-teams">
                            <span className="partite-team"><Crest name={m.homeTeam} teamId={m.homeTeamId} />{m.homeTeam}</span>
                            <span className="partite-team"><Crest name={m.awayTeam} teamId={m.awayTeamId} />{m.awayTeam}</span>
                            {/* **Dove non c'e' niente da leggere, la riga non lo scrive.**
                                Misurato a 375 px sul tabellone del 5 settembre: su 280 gare,
                                100 righe portavano «Lettura non disponibile per questa gara»
                                per 49 px l'una, e 99 di quelle 100 avevano gia' accanto la
                                targhetta «Solo calendario», che dice la stessa cosa in venti
                                pixel. La stessa assenza scritta due volte non e' due
                                informazioni. */}
                            {!(finished && outcome) && !reading ? null : (
                            <span className="partite-read">
                              <span className="partite-read-line">
                                <em>
                                  {finished && outcome
                                    ? outcome
                                    : [reading?.headline, reading?.goals].filter(Boolean).join(" · ")}
                                </em>
                              </span>
                              {reading?.thread ? (
                                <span className="signals-thread" aria-hidden="true">
                                  <span className="signals-thread-home" style={{ flexGrow: reading.thread.home }} />
                                  <span className="signals-thread-draw" style={{ flexGrow: reading.thread.draw }} />
                                  <span className="signals-thread-away" style={{ flexGrow: reading.thread.away }} />
                                </span>
                              ) : null}
                            </span>
                            )}
                            {/* Le targhette stanno in fondo alla cella, non fra i nomi e la
                                lettura: li' spostavano in basso il secondo nome e lo
                                disallineavano dal punteggio, che e' impilato apposta con una
                                cifra per squadra. Visto nella cattura. */}
                            <Targhette copertura={coperture.get(m.eventId)} />
                          </span>
                          <span className="partite-outcome">
                            {finished
                              ? <span className="partite-score">{m.homeScore}<br />{m.awayScore}</span>
                              : <span className={`partite-badge tone-${st.tone}`}>{st.label}</span>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        ) : (
          <div className="oggi-empty">
            <h2>Nessuna gara per questo giorno</h2>
            <p>
              {result.source === "provider"
                ? "Non risultano gare per la data selezionata (o per il campionato filtrato). Prova un altro giorno dal calendario."
                : "La fonte non è raggiungibile ora. Riprova più tardi: non mostriamo dati inventati."}
            </p>
          </div>
        )}

        <p className="oggi-note">Dati letti soltanto lato server. Orari in ora italiana. Elenco del giorno, tutti i campionati salvo filtro.</p>
      </section>
    </ProductShell>
  );
}
