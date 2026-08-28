import {
  giudizioSulMetro, metroPer,
  type GaraDiretta, type MedieDelPeriodo, type MetroDiLega, type RigaStagioneCompetizione,
} from "@/server/iqstats/referees";

import { ArbitroGare } from "./arbitro-gare";

/**
 * La scheda dell'arbitro: quattro blocchi, un'unica disciplina.
 *
 * **Ogni numero e' una media a partita.** Mai un totale: duemila falli non dicono niente
 * finche' non si sa in quante gare, e la stessa cifra puo' voler dire un arbitro severo o
 * una carriera lunga. La divisione la facciamo noi, sempre, anche dove la fonte pubblica
 * soltanto il totale.
 *
 * **Il campione sta accanto al numero, non in una nota.** Deciso dall'utente il 28 agosto
 * 2026: una competizione con una gara sola si mostra lo stesso, perche' sapere che li' ha
 * diretto e' un'informazione; ma allora il «1 gara» deve stare sulla stessa riga della
 * media, dove nessuno puo' non vederlo.
 *
 * **Carriera e nostre osservazioni sono due cose diverse, e portano nomi diversi.** La fonte
 * conta 293 gare in carriera ad Allen Chapman, noi ne osserviamo 42: il 14%. Chiamare
 * «carriera» la nostra tabella sarebbe falso, quindi il primo blocco dice «carriera, dalla
 * fonte» e non si divide per competizione, perche' la fonte non lo sa fare; il secondo dice
 * «nostre osservazioni» e dichiara da quando partono.
 *
 * **Un'assenza non diventa mai uno zero.** Dove i falli non ci sono la cella scrive un
 * trattino: «0,00 falli a partita» si legge «non ne fischia», ed e' un'altra cosa.
 */

const GIORNO: Intl.DateTimeFormatOptions = {
  day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome",
};

function decimale(valore: number, cifre: number): string {
  return valore.toFixed(cifre).replace(".", ",");
}

/** Il numero con le sue cifre, oppure il trattino: mai uno zero al posto di un'assenza. */
function cifra(valore: number | null, cifre: number): string {
  return valore === null ? "—" : decimale(valore, cifre);
}

function percentuale(quota: number | null): string {
  return quota === null ? "—" : `${Math.round(quota * 100)}%`;
}

function giorno(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "data non nota"
    : data.toLocaleDateString("it-IT", GIORNO);
}

function gare(quante: number): string {
  return `${quante} ${quante === 1 ? "gara" : "gare"}`;
}

function mediaDi(valori: readonly number[]): number | null {
  return valori.length === 0 ? null : valori.reduce((a, b) => a + b, 0) / valori.length;
}

/**
 * Una cella della tabella: il valore, e sotto il campione **solo quando e' piu' corto**
 * delle partite della riga.
 *
 * Ripetere «18 gare» in ogni cella di una riga da diciotto gare e' rumore. Scriverlo dove il
 * dato manca su qualche gara, invece, e' l'unica cosa che spiega perche' quella media non si
 * legge come le altre.
 */
function Cella({ valore, cifre, campione, partite }: {
  readonly valore: number | null;
  readonly cifre: number;
  readonly campione: number;
  readonly partite: number;
}) {
  return (
    <>
      {cifra(valore, cifre)}
      {campione < partite ? (
        <span className="ref-campione">
          {campione === 0 ? "non disponibile" : `su ${gare(campione)}`}
        </span>
      ) : null}
    </>
  );
}

type Props = {
  readonly nome: string;
  /** Gli aggregati di carriera della fonte: totali, che qui vengono divisi per gara. */
  readonly carriera: {
    readonly gare: number | null;
    readonly gialli: number | null;
    readonly rossi: number | null;
  } | null;
  readonly righe: readonly RigaStagioneCompetizione[];
  readonly gareDirette: readonly GaraDiretta[];
  readonly medieLunghe: MedieDelPeriodo;
  /** La lega e la stagione della scheda che si sta leggendo, per l'ultimo blocco. */
  readonly quiEOra: {
    readonly competizione: string;
    readonly stagione: string;
    readonly seasonId: number;
  } | null;
  /** Da quando partono le nostre osservazioni su questo arbitro, in chiaro. */
  readonly daQuando: string | null;
  /** I metri delle competizioni toccate: senza, nessuna riga puo' portare un giudizio. */
  readonly metri: ReadonlyMap<string, MetroDiLega>;
};

/**
 * Severo, in linea o permissivo, con accanto il numero che lo dice e su quante gare.
 *
 * **Nessun colore.** Verde e mattone in questo prodotto significano «sopra» o «sotto» un
 * riferimento, e qui sopra il metro vorrebbe dire severo: chi guarda in fretta leggerebbe il
 * verde come «bravo». La parola e' piu' onesta di una tinta, e il numero le sta accanto.
 */
function Metro({ riga, metro }: {
  readonly riga: RigaStagioneCompetizione;
  readonly metro: MetroDiLega | null;
}) {
  const giudizio = giudizioSulMetro(
    riga.gialli, metro?.gialli ?? null, metro?.dispersioneGialli ?? null,
  );
  if (giudizio === null || metro === null || riga.gialli === null) return null;
  return (
    <span className="ref-metro">
      <b className={`ref-metro-voce is-${giudizio.replace(" ", "-")}`}>{giudizio}</b>
      <span className="ref-campione">
        {decimale(riga.gialli, 2)} gialli contro {decimale(metro.gialli, 2)} di media
        {metro.dellaStagione ? " in questa lega e stagione" : " nella lega"}
        {riga.partite < 5 ? `, ma su ${gare(riga.partite)}: puo' cambiare` : ""}
      </span>
    </span>
  );
}

const ULTIME = 5;

/** Sotto questo scarto il confronto resta inchiostro: non e' distinguibile dal rumore. */
const SCARTO_MUTO = 0.05;

export function ArbitroScheda({
  nome, carriera, righe, gareDirette, medieLunghe, quiEOra, daQuando, metri,
}: Props) {
  const ultime = gareDirette.slice(0, ULTIME);
  const valoriUltime = {
    falli: ultime.map((g) => g.falli).filter((v): v is number => v !== null),
    gialli: ultime.map((g) => g.gialli).filter((v): v is number => v !== null),
    rossi: ultime.map((g) => g.rossi).filter((v): v is number => v !== null),
  };

  // Nel dossier l'elenco finale si restringe alla competizione di quella gara, perche' li'
  // la domanda e' «come fischia in questo torneo». Nella scheda dell'arbitro no: li' la
  // domanda e' «che cosa ha fatto», e le gare sono tutte, con la competizione su ogni riga.
  const daElencare = quiEOra === null ? gareDirette : gareDirette.filter(
    (g) => g.seasonId === quiEOra.seasonId && g.competizione === quiEOra.competizione,
  );

  return (
    <>
      {/* Blocco 1. La carriera e' l'unica cosa che la fonte sa e le nostre osservazioni no.
          Arriva in totali, e viene divisa qui: «2.000 falli» non e' un dato leggibile. */}
      {carriera === null || carriera.gare === null || carriera.gare <= 0 ? null : (
        <p className="ref-carriera">
          <b>Carriera, dalla fonte:</b>{" "}
          <span className="ref-carriera-num">{carriera.gare.toLocaleString("it-IT")}</span> gare
          {carriera.gialli === null ? null : (
            <>
              {" · "}
              <span className="ref-carriera-num">
                {decimale(carriera.gialli / carriera.gare, 2)}
              </span>{" "}gialli a partita
            </>
          )}
          {carriera.rossi === null ? null : (
            <>
              {" · "}
              <span className="ref-carriera-num">
                {decimale(carriera.rossi / carriera.gare, 2)}
              </span>{" "}rossi a partita
            </>
          )}
          . La fonte non li divide per competizione, e non li divide nemmeno per partita: la
          divisione qui sopra e la tabella qui sotto sono nostre.
        </p>
      )}

      {/* Blocco 2. Stagione per stagione, competizione per competizione. Sempre a partita. */}
      {righe.length === 0 ? (
        <p className="dossier-empty">
          Di {nome} non abbiamo ancora nessuna gara con entrambe le squadre osservate: senza
          tutte e due le righe il totale dei falli sarebbe dimezzato senza che si veda, e una
          media sbagliata e&apos; peggio di una media assente.
        </p>
      ) : (
        <>
          <div className="ref-table-wrap">
            <table className="ref-table">
              <caption className="sr-only-heading">
                Falli e cartellini di {nome} a partita, per stagione e competizione
              </caption>
              <thead>
                <tr>
                  <th scope="col">Stagione</th>
                  <th scope="col">Competizione</th>
                  <th scope="col">Partite</th>
                  <th scope="col">Falli</th>
                  <th scope="col">Gialli</th>
                  <th scope="col">Falli per giallo</th>
                  <th scope="col">Rossi</th>
                  <th scope="col">Gialli casa</th>
                  <th scope="col">Gialli trasferta</th>
                  <th scope="col">Falli casa</th>
                  <th scope="col">Falli trasferta</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <tr key={`${r.seasonId}-${r.competizione}`}>
                    <th scope="row" className="ref-stagione">
                      {r.stagione}
                      {r.stagioneCorrente ? <span className="ref-ora">in corso</span> : null}
                    </th>
                    <td className="ref-comp" data-label="Competizione">
                      {r.competizione}
                      <Metro riga={r} metro={metroPer(metri, r.competitionSourceId, r.seasonId)} />
                    </td>
                    <td data-label="Partite" className="ref-num ref-partite">{r.partite}</td>
                    <td data-label="Falli a partita" className="ref-num">
                      <Cella valore={r.falli} cifre={2}
                        campione={r.partiteConFalli} partite={r.partite} />
                    </td>
                    <td data-label="Gialli a partita" className="ref-num">
                      <Cella valore={r.gialli} cifre={2}
                        campione={r.partiteConGialli} partite={r.partite} />
                    </td>
                    <td data-label="Falli per giallo" className="ref-num">
                      {cifra(r.falliPerAmmonizione, 2)}
                    </td>
                    <td data-label="Rossi a partita" className="ref-num">
                      <Cella valore={r.rossi} cifre={2}
                        campione={r.partiteConRossi} partite={r.partite} />
                    </td>
                    <td data-label="Gialli alla squadra di casa" className="ref-num ref-quota">
                      {percentuale(r.quotaGialliCasa)}
                    </td>
                    <td data-label={"Gialli all'ospite"} className="ref-num ref-quota">
                      {percentuale(r.quotaGialliCasa === null ? null : 1 - r.quotaGialliCasa)}
                    </td>
                    <td data-label="Falli contro la squadra di casa"
                      className="ref-num ref-quota">
                      {percentuale(r.quotaFalliCasa)}
                    </td>
                    <td data-label={"Falli contro l'ospite"} className="ref-num ref-quota">
                      {percentuale(r.quotaFalliCasa === null ? null : 1 - r.quotaFalliCasa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dossier-src">
            Nostre osservazioni{daQuando === null ? "" : `, dal ${giorno(daQuando)}`}:{" "}
            {gare(medieLunghe.partite)} in tutto. Ogni valore e&apos; <b>a partita</b>, mai un
            totale, e dove il campione di una metrica e&apos; piu&apos; corto delle partite
            della riga sta scritto sotto il numero. <b>Le percentuali di casa e trasferta
            ripartiscono</b> quello che e&apos; successo fra le due squadre: 50 e 50 significa
            che ha diviso a meta&apos;, non che ha fischiato poco. Una riga da una gara sola
            resta una gara sola: si mostra perche&apos; aver diretto li&apos; e&apos; un
            fatto, e si legge sapendolo.
          </p>
          <p className="dossier-src">
            <b>Severo, in linea o permissivo si dice rispetto alla sua lega</b>, mai in
            assoluto: fra i direttori con almeno cinque gare, chi sta nel terzo piu&apos; alto
            della propria competizione va da <b>2,85 a 7,80</b> gialli a partita e chi sta nel
            terzo piu&apos; basso da <b>1,20 a 4,50</b>, quindi lo stesso numero cambia
            significato a seconda di dove fischia. La soglia non e&apos; decisa da noi:
            e&apos; <b>mezza dispersione</b> fra gli arbitri di quella competizione, che nei
            dati vale <b>0,71 gialli</b>, il 18% del metro; dove gli arbitri si somigliano di
            piu&apos;, si stringe da sola. <b>Non e&apos; un voto</b>, ed e&apos; instabile
            quando le gare sono poche: i gialli dello stesso direttore ballano da gara a gara
            di <b>1,94</b>, quindi con poche partite l&apos;etichetta puo&apos; ribaltarsi, e
            per questo il campione le sta sempre accanto.
          </p>
        </>
      )}

      {/* Blocco 3. Le ultime gare contro la media lunga: il verso lo dice il colore, che qui
          significa «sopra» o «sotto» il suo metro, come vuole il design system. */}
      {ultime.length === 0 ? null : (
        <>
          <h3 className="ref-sub">Le ultime {ultime.length}, in tutte le competizioni</h3>
          <div className="ref-table-wrap">
            <table className="ref-table ref-table-gare">
              <caption className="sr-only-heading">
                Le ultime {ultime.length} gare dirette da {nome}, con il confronto sulla media
              </caption>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Risultato</th>
                  <th scope="col">Partita</th>
                  <th scope="col">Falli</th>
                  <th scope="col">Gialli</th>
                  <th scope="col">Rossi</th>
                </tr>
              </thead>
              <tbody>
                {ultime.map((g) => (
                  <tr key={`${g.quando}-${g.casa}`}>
                    <th scope="row" className="ref-data">{giorno(g.quando)}</th>
                    <td data-label="Risultato" className="ref-num">
                      {g.golCasa === null || g.golTrasferta === null
                        ? <span className="ref-campione">non consolidato</span>
                        : `${g.golCasa}-${g.golTrasferta}`}
                    </td>
                    <td data-label="Partita" className="ref-comp">
                      {g.casa} - {g.trasferta}
                      <span className="ref-campione">{g.competizione} {g.stagione}</span>
                    </td>
                    <td data-label="Falli" className="ref-num">{cifra(g.falli, 0)}</td>
                    <td data-label="Gialli" className="ref-num">{cifra(g.gialli, 0)}</td>
                    <td data-label="Rossi" className="ref-num">{cifra(g.rossi, 0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3} className="ref-piede">
                    Media delle ultime {ultime.length}, e scarto sulle{" "}
                    {gare(medieLunghe.partite)} che abbiamo
                  </th>
                  {([
                    { nome: "Falli", ora: mediaDi(valoriUltime.falli), sempre: medieLunghe.falli },
                    {
                      nome: "Gialli", ora: mediaDi(valoriUltime.gialli),
                      sempre: medieLunghe.gialli,
                    },
                    { nome: "Rossi", ora: mediaDi(valoriUltime.rossi), sempre: medieLunghe.rossi },
                  ] as const).map((v) => {
                    const scarto = v.ora === null || v.sempre === null ? null : v.ora - v.sempre;
                    const verso = scarto === null || Math.abs(scarto) < SCARTO_MUTO ? ""
                      : scarto > 0 ? " is-sopra" : " is-sotto";
                    return (
                      <td key={v.nome} data-label={`${v.nome}, media delle ultime`}
                        className={`ref-num${verso}`}>
                        {cifra(v.ora, 2)}
                        {/* Uno scarto sotto la soglia muta non si scrive: «+0,00» occupa una
                            riga per dire che non e' successo niente. */}
                        {scarto === null || Math.abs(scarto) < SCARTO_MUTO ? null : (
                          <span className="ref-scarto">
                            {scarto >= 0 ? "+" : "−"}{decimale(Math.abs(scarto), 2)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="dossier-src">
            Il verde dice sopra la sua media, il mattone sotto: e&apos; un verso, non un
            giudizio. Cinque gare spostano poco, e uno scarto sotto <b>0,05</b> resta
            inchiostro perche&apos; non si distingue dal rumore. Il parziale del primo tempo
            non compare: nel nostro livello dati quella colonna e&apos; vuota su tutte e{" "}
            <b>9.384</b> le gare con arbitro osservato, e non lo inventiamo.
          </p>
        </>
      )}

      {/* Blocco 4. Le gare della stessa lega e stagione della scheda che si sta leggendo. */}
      {daElencare.length === 0 ? null : (
        <ArbitroGare gare={daElencare} dentro={quiEOra} />
      )}
    </>
  );
}
