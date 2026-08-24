import Link from "next/link";

import { LeagueIdentity } from "@/components/league-identity";
import { TeamCrest } from "@/components/team-crest";
import type { CoperturaDiGara } from "@/server/iqstats/copertura";
import type { GiornataDiCompetizione } from "@/server/iqstats/giornate";

/**
 * Il menu di ingresso: scegli il campionato, vedi la prossima giornata, apri la gara.
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
/** Quante gare si mostrano per competizione: una giornata di campionato ci sta dentro. */
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
          <TeamCrest name={gara.homeTeam} teamId={gara.homeTeamId} />
          {gara.homeTeam}
          <span className="home-feature-vs"> contro </span>
          <TeamCrest name={gara.awayTeam} teamId={gara.awayTeamId} />
          {gara.awayTeam}
          <Targhette copertura={copertura} />
        </span>
      </Link>
    </li>
  );
}

function Competizione({ giornata, coperture, aperta }: {
  readonly giornata: GiornataDiCompetizione;
  readonly coperture: ReadonlyMap<number, CoperturaDiGara>;
  readonly aperta: boolean;
}) {
  const titolo = (
    <>
      <LeagueIdentity
        leagueId={giornata.leagueId}
        name={giornata.leagueName}
        code={giornata.leagueCountryCode}
        size="sm"
      />
      <span className="engine-obs">
        {giornata.giornata === null
          ? `${giornata.gare.length} ${giornata.gare.length === 1 ? "gara in arrivo" : "gare in arrivo"}`
          : `giornata ${giornata.giornata} · ${giornata.gare.length} ${giornata.gare.length === 1 ? "gara" : "gare"}`}
        {/* I recuperi non sono la prossima giornata, ma esistono: si dice quanti sono e
            dove trovarli, invece di farli sparire dal menu. */}
        {giornata.recuperi === 0 ? "" : ` · ${giornata.recuperi} in altri turni`}
      </span>
    </>
  );

  // Una giornata di campionato sta in dieci gare. Le coppe non hanno giornate e nella
  // finestra ne portano anche ventiquattro: si taglia e si dice quante restano, invece di
  // far pesare a tutti un elenco che nessuno legge fino in fondo.
  const mostrate = giornata.gare.slice(0, MASSIME);
  const oltre = giornata.gare.length - mostrate.length;

  const elenco = (
    <>
      <ol className="partite-rows">
        {mostrate.map((g) => (
          <Gara key={g.eventId} gara={g} copertura={coperture.get(g.eventId)} />
        ))}
      </ol>
      {oltre === 0 ? null : (
        <p className="dossier-src">
          Altre {oltre} gare di questa competizione nella finestra:{" "}
          <Link href={`/partite?leagueId=${giornata.leagueId}`}>vedile nel calendario</Link>.
        </p>
      )}
    </>
  );

  // I campionati principali restano aperti, gli altri dietro un `details` nativo: nessun
  // JavaScript, e il contenuto resta raggiungibile da tastiera e dalla ricerca del browser.
  return aperta ? (
    <section className="giornata" aria-label={giornata.leagueName}>
      <p className="giornata-head">{titolo}</p>
      {elenco}
    </section>
  ) : (
    <details className="giornata">
      <summary className="giornata-head">{titolo}</summary>
      {elenco}
    </details>
  );
}

type Props = {
  readonly principali: readonly GiornataDiCompetizione[];
  readonly europee: readonly GiornataDiCompetizione[];
  readonly altre: readonly GiornataDiCompetizione[];
  readonly coperture: ReadonlyMap<number, CoperturaDiGara>;
  /** Fin dove arriva la finestra letta, in giorni. */
  readonly giorni: number;
};

export function CalendarioGiornate({ principali, europee, altre, coperture, giorni }: Props) {
  if (principali.length === 0 && europee.length === 0 && altre.length === 0) return null;

  return (
    <section className="dossier-panel" aria-labelledby="giornate-title">
      <p className="dossier-kick">Scegli la gara</p>
      <h2 id="giornate-title" className="squad-section-title">
        La prossima giornata, campionato per campionato
      </h2>

      {principali.map((g) => (
        <Competizione key={g.leagueId} giornata={g} coperture={coperture} aperta />
      ))}

      {europee.length === 0 ? null : (
        <>
          <p className="dossier-kick">Coppe europee</p>
          {europee.map((g) => (
            <Competizione key={g.leagueId} giornata={g} coperture={coperture} aperta />
          ))}
        </>
      )}

      {altre.length === 0 ? null : (
        <details className="giornata giornata-altre">
          <summary className="giornata-head">
            Tutti gli altri campionati <i>{altre.length}</i>
          </summary>
          {/* Qui dentro vanno i nomi, non i calendari. Con la finestra intera erano oltre
              seicento gare e la pagina pesava 1,2 MB: un cassetto che nessuno apre non deve
              costare a chi non lo apre. Ogni voce porta al calendario filtrato. */}
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
        Gli altri campionati stanno nel cassetto come nomi e non come calendari: erano oltre
        seicento gare, e un cassetto che non apri non deve costarti niente. Ogni voce porta al
        calendario di quel campionato. La finestra letta &egrave; di {giorni} giorni. Di ogni campionato si mostra il turno
        pi&ugrave; basso ancora da giocare, che &egrave; la prossima giornata; le coppe
        numerano i turni a modo loro, quindi per loro si mostrano le gare della finestra e non
        si scrive un numero di giornata che non sarebbe una giornata.
      </p>
    </section>
  );
}
