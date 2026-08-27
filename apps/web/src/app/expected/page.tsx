import type { Metadata } from "next";

import { MatchContestoSection } from "@/components/match-contesto-section";
import { MatchFormaSection } from "@/components/match-forma-section";
import { MatchGolSection } from "@/components/match-gol-section";
import { MatchProjectionSection } from "@/components/match-projection-section";
import { MatchRitardiSection } from "@/components/match-ritardi-section";
import { ProductShell } from "@/components/product-shell";
import {
  allenatoreDellaSquadra,
  idAllenatore,
  provenienzaInChiaro,
  type AllenatoreDellaSquadra,
} from "@/server/iqstats/allenatore";
import { contestoExpected } from "@/server/iqstats/expected";
import { proiezioniDellaGara } from "@/server/iqstats/projection-runtime";
import { classificaArbitri } from "@/server/iqstats/referees";
import { competizioniConSquadre } from "@/server/iqstats/team-stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Expected",
  description:
    "Accosta due squadre che non si incontrano, con l'arbitro che scegli tu, e leggi che "
    + "cosa dice il motore: un banco di prova, non il dossier di una gara in calendario.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function scalare(valore: string | string[] | undefined): string {
  return typeof valore === "string" ? valore : "";
}

/**
 * L'allenatore in chiaro con la sua provenienza. **Un identificativo non e' un'evidenza**:
 * se il nome c'e' si legge il nome, e accanto perche' e' quello e non un altro.
 */
function rigaAllenatore(squadra: string, allenatore: AllenatoreDellaSquadra | null): string {
  if (allenatore === null) return `${squadra}: allenatore non cercato`;
  if (allenatore.esito !== "trovato") {
    return `${squadra}: ${provenienzaInChiaro(allenatore)}`;
  }
  const nome = allenatore.profilo?.name ?? `identificativo ${allenatore.id}`;
  return `${squadra}: ${nome}, ${provenienzaInChiaro(allenatore)}`;
}

const GIORNO: Intl.DateTimeFormatOptions = {
  day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome",
};

export default async function ExpectedPage({ searchParams }: Props) {
  const parametri = await searchParams;
  const competizioni = await competizioniConSquadre();

  if (competizioni.length === 0) {
    return (
      <ProductShell activeSection="expected">
        <section className="page-intro" aria-labelledby="expected-title">
          <p className="eyebrow">Expected</p>
          <h1 id="expected-title">Nessuna competizione da cui scegliere.</h1>
          <p>
            Il livello dati non risponde, oppure nessuna competizione ha abbastanza squadre
            con storia. In nessuno dei due casi si mostrano numeri: un accostamento senza
            storia alle spalle sarebbe due nomi e una probabilit&agrave; inventata.
          </p>
        </section>
      </ProductShell>
    );
  }

  const richiesta = Number(scalare(parametri.competizione));
  const scelta = competizioni.find((c) => c.sourceId === richiesta) ?? competizioni[0];
  const contesto = await contestoExpected(scelta.sourceId);

  const casaId = Number(scalare(parametri.casa));
  const trasfertaId = Number(scalare(parametri.trasferta));
  const arbitroId = Number(scalare(parametri.arbitro));

  const casa = contesto?.squadre.find((s) => s.sourceId === casaId) ?? null;
  const trasferta = contesto?.squadre.find((s) => s.sourceId === trasfertaId) ?? null;
  const stesseSquadre = casa !== null && trasferta !== null && casa.sourceId === trasferta.sourceId;

  const arbitri = await classificaArbitri(scelta.sourceId, "gialli");
  const arbitro = arbitri.find((a) => a.sourceId === arbitroId) ?? null;

  // **Gli allenatori qui non arrivano da un evento: questa gara non esiste.** Si chiedono
  // alla fonte e, se tace, al nostro livello dati. Senza, le sei feature `allenatore_*`
  // restano vuote e gialli, fuorigioco, parate e corner ripiegano su tutta la pagina.
  const allenatori = casa === null || trasferta === null || stesseSquadre
    ? null
    : await Promise.all([
      allenatoreDellaSquadra(casa.sourceId, null),
      allenatoreDellaSquadra(trasferta.sourceId, null),
    ]);
  const allenatoreCasa = allenatori?.[0] ?? null;
  const allenatoreTrasferta = allenatori?.[1] ?? null;

  // La proiezione parte solo con due squadre diverse scelte davvero: nessun accostamento di
  // riserva, perche' una pagina che decide da sola chi accostare risponderebbe a una domanda
  // che nessuno ha fatto.
  const esito = contesto === null || casa === null || trasferta === null || stesseSquadre
    ? null
    : await proiezioniDellaGara({
      homeTeamId: casa.sourceId,
      awayTeamId: trasferta.sourceId,
      seasonId: contesto.seasonSourceId,
      refereeId: arbitro?.sourceId ?? null,
      // L'istante rispetto al quale si guarda indietro e' adesso: e' un accostamento di
      // prova, non una gara con una data.
      kickoff: new Date().toISOString(),
      homeCoachId: idAllenatore(allenatoreCasa),
      awayCoachId: idAllenatore(allenatoreTrasferta),
      roundNumber: null,
      roundName: null,
      isLocalDerby: null,
    });

  const proiezioni = typeof esito === "string" ? null : esito;
  const motivo = typeof esito === "string" ? esito : null;

  return (
    <ProductShell activeSection="expected">
      <div className="oggi-backdrop" aria-hidden="true" />
      <div className="dossier">
        <section className="page-intro" aria-labelledby="expected-title">
          <p className="eyebrow">Expected</p>
          <h1 id="expected-title">Due squadre che non si incontrano.</h1>
          <p>
            Scegli chi contro chi, e se vuoi l&apos;arbitro. Il motore &egrave; lo stesso del
            dossier di una gara vera: cambia solo che questa gara non &egrave; in calendario, e
            la storia si guarda <b>da adesso</b> indietro. &Egrave; un banco di prova, non un
            pronostico su una partita che si giocher&agrave;.
          </p>
        </section>

        <form className="signals-filters" method="get" aria-labelledby="expected-scelta">
          <h2 id="expected-scelta" className="signals-filters-title">Chi contro chi</h2>
          <div className="signals-filter-grid">
            <p className="signals-field">
              <label htmlFor="expected-competizione">Competizione</label>
              <select
                id="expected-competizione"
                name="competizione"
                defaultValue={String(scelta.sourceId)}
              >
                {competizioni.map((c) => (
                  <option key={c.sourceId} value={String(c.sourceId)}>
                    {c.nome} ({c.squadre} squadre)
                  </option>
                ))}
              </select>
            </p>

            <p className="signals-field">
              <label htmlFor="expected-casa">In casa</label>
              <select id="expected-casa" name="casa" defaultValue={casa ? String(casa.sourceId) : ""}>
                <option value="">Scegli la squadra di casa</option>
                {(contesto?.squadre ?? []).map((s) => (
                  <option key={s.sourceId} value={String(s.sourceId)}>
                    {s.nome} &middot; {s.gare} gare
                  </option>
                ))}
              </select>
            </p>

            <p className="signals-field">
              <label htmlFor="expected-trasferta">In trasferta</label>
              <select
                id="expected-trasferta"
                name="trasferta"
                defaultValue={trasferta ? String(trasferta.sourceId) : ""}
              >
                <option value="">Scegli la squadra ospite</option>
                {(contesto?.squadre ?? []).map((s) => (
                  <option key={s.sourceId} value={String(s.sourceId)}>
                    {s.nome} &middot; {s.gare} gare
                  </option>
                ))}
              </select>
            </p>

            <p className="signals-field">
              <label htmlFor="expected-arbitro">Arbitro, se vuoi</label>
              <select
                id="expected-arbitro"
                name="arbitro"
                defaultValue={arbitro ? String(arbitro.sourceId) : ""}
              >
                <option value="">Nessun arbitro scelto</option>
                {arbitri.map((a) => (
                  <option key={a.sourceId} value={String(a.sourceId)}>
                    {a.nome} &middot; {a.gare} gare
                  </option>
                ))}
              </select>
            </p>
          </div>

          <button className="signals-submit" type="submit">Calcola</button>
        </form>

        {stesseSquadre ? (
          <section className="dossier-panel" aria-labelledby="expected-stessa">
            <p className="dossier-kick">Serve una seconda squadra</p>
            <h2 id="expected-stessa" className="squad-section-title">
              Hai scelto la stessa squadra da tutte e due i lati
            </h2>
            <p className="squad-empty-inline">
              Una squadra contro s&eacute; stessa non &egrave; un accostamento, e i numeri che
              uscirebbero non direbbero niente su nessuno.
            </p>
          </section>
        ) : null}

        {contesto === null ? (
          <section className="dossier-panel" aria-labelledby="expected-vuoto">
            <p className="dossier-kick">Nessuna squadra da accostare</p>
            <h2 id="expected-vuoto" className="squad-section-title">
              {scelta.nome} non ha due squadre con storia a sufficienza
            </h2>
            <p className="squad-empty-inline">
              Servono almeno quattro gare a testa nella stagione pi&ugrave; recente. Sotto
              quella soglia il motore non ha materiale, e un numero costruito su due gare
              racconterebbe due serate.
            </p>
          </section>
        ) : null}

        {casa === null || trasferta === null || stesseSquadre ? null : proiezioni === null ? (
          <section className="dossier-panel" aria-labelledby="expected-senza">
            <p className="dossier-kick">Il motore non risponde su questo accostamento</p>
            <h2 id="expected-senza" className="squad-section-title">
              {casa.nome} contro {trasferta.nome}
            </h2>
            <p className="squad-empty-inline">
              {motivo === "senza-connessione"
                ? "Il livello dati del motore non e' raggiungibile in questo momento."
                : motivo === "senza-modelli"
                  ? "Nessun modello e' in produzione: senza artefatti non si proietta niente."
                  : motivo === "gara-sconosciuta"
                    ? "Di una di queste due squadre non abbiamo l'identificativo nel livello dati."
                    : motivo === "senza-copertura"
                      ? "Queste due squadre non hanno abbastanza storia dal lato del campo richiesto."
                      : "La lettura non e' riuscita. Non viene mostrato niente al suo posto."}
            </p>
          </section>
        ) : (
          <>
            <section className="dossier-panel" aria-labelledby="expected-fatto">
              <p className="dossier-kick">Accostamento di prova</p>
              <h2 id="expected-fatto" className="squad-section-title">
                {casa.nome} contro {trasferta.nome}
              </h2>
              <p className="dossier-src">
                {scelta.nome}
                {contesto?.stagione ? `, ${contesto.stagione}` : ""} &middot;{" "}
                {casa.nome} con {casa.gare} gare, {trasferta.nome} con {trasferta.gare}{" "}
                &middot;{" "}
                {arbitro === null
                  ? "nessun arbitro scelto"
                  : `arbitro ${arbitro.nome}, ${arbitro.gare} gare dirette`}
                {proiezioni.ultimaOsservazione === null
                  ? ""
                  : ` · storia fino al ${new Date(proiezioni.ultimaOsservazione).toLocaleDateString("it-IT", GIORNO)}`}
              </p>
              <p className="dossier-src">
                Allenatori &middot; {rigaAllenatore(casa.nome, allenatoreCasa)} &middot;{" "}
                {rigaAllenatore(trasferta.nome, allenatoreTrasferta)}
              </p>
              <p className="dossier-src">
                <b>Questa gara non esiste.</b> I numeri sotto dicono che cosa il motore si
                aspetta se queste due squadre si incontrassero adesso, con la storia che hanno
                adesso. Non c&apos;&egrave; una data, non c&apos;&egrave; una formazione, e
                nessuna delle due sa di essere stata accostata: &egrave; un banco di prova per
                capire come si muovono i numeri, non una lettura su una partita che si
                giocher&agrave;.
              </p>
            </section>

            {proiezioni.gol ? (
              <MatchGolSection
                gol={proiezioni.gol}
                homeTeam={casa.nome}
                awayTeam={trasferta.nome}
                ultima={proiezioni.ultimaOsservazione}
              />
            ) : null}

            <MatchProjectionSection
              proiezioni={proiezioni}
              homeTeam={casa.nome}
              awayTeam={trasferta.nome}
            />

            {proiezioni.forma ? (
              <MatchFormaSection
                casa={proiezioni.forma.casa}
                trasferta={proiezioni.forma.trasferta}
                homeTeam={casa.nome}
                awayTeam={trasferta.nome}
              />
            ) : null}

            <MatchContestoSection
              contesto={proiezioni.contesto}
              homeTeam={casa.nome}
              awayTeam={trasferta.nome}
            />

            <MatchRitardiSection
              casa={proiezioni.ritardi.casa}
              trasferta={proiezioni.ritardi.trasferta}
              homeTeam={casa.nome}
              awayTeam={trasferta.nome}
            />
          </>
        )}
      </div>
    </ProductShell>
  );
}
