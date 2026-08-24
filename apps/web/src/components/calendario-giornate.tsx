import Link from "next/link";

import { LeagueIdentity } from "@/components/league-identity";
import { TeamCrest } from "@/components/team-crest";
import type { CoperturaDiGara } from "@/server/iqstats/copertura";
import type { GiornataDiCompetizione } from "@/server/iqstats/giornate";

/**
 * Il menu di ingresso: scegli il campionato, vedi la prossima giornata, apri la gara.
 *
 * **Un calendario per volta.** I campionati stanno affiancati in una fascia che scorre in
 * orizzontale, e si apre quello scelto. La prima versione ne teneva otto aperti insieme:
 * settantacinque gare in pagina, 305.073 byte, e su un telefono la prima gara della
 * Bundesliga stava a diverse schermate di distanza. Ora la pagina rende un elenco solo.
 *
 * **Nessun JavaScript.** La scelta viaggia nell'indirizzo, come su `/arbitri` e su
 * `/squadre`: funziona da tastiera, si puo' condividere, e la pagina resta di server.
 *
 * **Le targhette dicono che cosa troverai, e sono calcolate per gara.** Misurato sul
 * dossier vero: Roma-Atalanta da' i sette attesi ma zero scale di soglie, perche' la Roma
 * non ha ancora giocato in casa in questa stagione; Hull-Aston Villa le da' tutte. Una
 * targhetta appesa al campionato direbbe «Serie A si» su una gara che dira' no, quindi si
 * calcola sulle due squadre e sul lato del campo.
 *
 * **Si mostrano solo le targhette accese.** Una spenta e una assente si confondono, e senza
 * connessione al livello dati non ne compare nessuna: non sappiamo, e non fingiamo.
 */

/** Quante gare si mostrano: una giornata di campionato ci sta dentro, una coppa no. */
const MASSIME = 10;

const ORA: Intl.DateTimeFormatOptions = {
  timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit",
};

const GIORNO: Intl.DateTimeFormatOptions = {
  timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short",
};

/** Il giorno sopra e l'ora sotto: una giornata si spalma su piu' giorni, e serve vederlo. */
function Quando({ iso }: { readonly iso: string }) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) {
    return <span className="partite-time">da definire</span>;
  }
  return (
    <span className="partite-time giornata-quando">
      {data.toLocaleDateString("it-IT", GIORNO)}
      <i>{data.toLocaleTimeString("it-IT", ORA)}</i>
    </span>
  );
}

function Targhette({ copertura }: { readonly copertura: CoperturaDiGara | undefined }) {
  if (copertura === undefined) return null;
  const accese: string[] = [];
  if (copertura.proiezione) accese.push("Proiezione");
  if (copertura.storia) accese.push("Storia");
  if (copertura.arbitro) accese.push("Arbitro");

  return (
    <span className="giornata-tag">
      {accese.length === 0
        ? <span className="oggi-chip">Solo calendario</span>
        : accese.map((nome) => <span className="oggi-chip" key={nome}>{nome}</span>)}
    </span>
  );
}

function Gara({ gara, copertura }: {
  readonly gara: GiornataDiCompetizione["gare"][number];
  readonly copertura: CoperturaDiGara | undefined;
}) {
  return (
    <li>
      <Link className="partite-row giornata-row" href={`/match/${gara.eventId}`}>
        <Quando iso={gara.kickoff} />
        <span className="partite-teams">
          <span className="giornata-sfida">
            <TeamCrest name={gara.homeTeam} teamId={gara.homeTeamId} />
            {gara.homeTeam}
            <span className="home-feature-vs"> contro </span>
            <TeamCrest name={gara.awayTeam} teamId={gara.awayTeamId} />
            {gara.awayTeam}
          </span>
          <Targhette copertura={copertura} />
        </span>
      </Link>
    </li>
  );
}

/** L'etichetta di una competizione: giornata e quante gare, o la finestra per le coppe. */
function etichetta(g: GiornataDiCompetizione): string {
  const quante = `${g.gare.length} ${g.gare.length === 1 ? "gara" : "gare"}`;
  const base = g.giornata === null
    ? `${quante} in arrivo`
    : `giornata ${g.giornata} · ${quante}`;
  // I recuperi non sono la prossima giornata, ma esistono: si dice quanti sono invece di
  // farli sparire dal menu.
  return g.recuperi === 0 ? base : `${base} · ${g.recuperi} in altri turni`;
}

type Props = {
  /** I campionati e le coppe affiancati nella fascia, gia' nell'ordine voluto. */
  readonly fascia: readonly GiornataDiCompetizione[];
  /** Quello aperto adesso. */
  readonly scelta: GiornataDiCompetizione | null;
  readonly altre: readonly GiornataDiCompetizione[];
  readonly coperture: ReadonlyMap<number, CoperturaDiGara>;
  /** Fin dove arriva la finestra letta, in giorni. */
  readonly giorni: number;
};

export function CalendarioGiornate({ fascia, scelta, altre, coperture, giorni }: Props) {
  if (fascia.length === 0 && altre.length === 0) return null;

  const mostrate = scelta === null ? [] : scelta.gare.slice(0, MASSIME);
  const oltre = scelta === null ? 0 : scelta.gare.length - mostrate.length;

  return (
    <section className="dossier-panel" aria-labelledby="giornate-title">
      <p className="dossier-kick">Scegli la gara</p>
      <h2 id="giornate-title" className="squad-section-title">
        La prossima giornata, campionato per campionato
      </h2>

      <nav className="partite-index" aria-label="Campionato">
        {fascia.map((g) => (
          <Link
            className="partite-index-link"
            key={g.leagueId}
            href={`/?lega=${g.leagueId}`}
            aria-current={scelta !== null && g.leagueId === scelta.leagueId ? "page" : undefined}
          >
            <LeagueIdentity
              leagueId={g.leagueId}
              name={g.leagueName}
              code={g.leagueCountryCode}
              size="sm"
            />
            <i>{g.gare.length}</i>
          </Link>
        ))}
      </nav>

      {scelta === null ? (
        <p className="squad-empty-inline">
          Nessuna gara nei prossimi {giorni} giorni per i campionati in fascia.
        </p>
      ) : (
        <>
          <p className="giornata-head">
            <span className="engine-obs">{etichetta(scelta)}</span>
          </p>

          <ol className="partite-rows">
            {mostrate.map((g) => (
              <Gara key={g.eventId} gara={g} copertura={coperture.get(g.eventId)} />
            ))}
          </ol>

          {oltre === 0 ? null : (
            <p className="dossier-src">
              Altre {oltre} gare di questa competizione nella finestra:{" "}
              <Link href={`/partite?leagueId=${scelta.leagueId}`}>vedile nel calendario</Link>.
            </p>
          )}
        </>
      )}

      {altre.length === 0 ? null : (
        <details className="giornata giornata-altre">
          <summary className="giornata-head">
            Tutti gli altri campionati <i>{altre.length}</i>
          </summary>
          {/* Qui dentro vanno i nomi, non i calendari. Con la finestra intera erano oltre
              seicento gare e la pagina pesava 1.234.203 byte: un cassetto che non apri non
              deve costarti niente. Ogni voce porta al calendario filtrato. */}
          <nav className="partite-index" aria-label="Altri campionati">
            {altre.map((g) => (
              <Link
                className="partite-index-link"
                key={g.leagueId}
                href={`/partite?leagueId=${g.leagueId}`}
              >
                {g.leagueName} <i>{g.gare.length}</i>
              </Link>
            ))}
          </nav>
        </details>
      )}

      <p className="dossier-src">
        <b>Le targhette dicono che cosa troverai aprendo quella gara</b>, e sono calcolate
        sulle due squadre, non sul campionato. <b>Proiezione</b>: ci sono le scale delle
        soglie e i mercati dei gol, che chiedono gare gi&agrave; giocate in questa stagione
        dal lato del campo giusto. <b>Storia</b>: ci sono forma e ritardi, che si accontentano
        dello storico. <b>Arbitro</b>: il designato &egrave; dichiarato e ha almeno cinque
        gare dirette da noi. Dove non compare nessuna targhetta c&apos;&egrave; il calendario
        e quello che la fonte espone in diretta, e la gara lo dice anche dentro.
      </p>
      <p className="dossier-src">
        La finestra letta &egrave; di {giorni} giorni, e di ogni campionato si mostra il turno
        con pi&ugrave; gare ancora da giocare, che &egrave; la prossima giornata: prendere il
        turno pi&ugrave; basso avrebbe mostrato un recupero da una gara al posto della
        giornata vera. Le coppe numerano i turni a modo loro, quindi per loro non si scrive un
        numero di giornata.
      </p>
    </section>
  );
}
