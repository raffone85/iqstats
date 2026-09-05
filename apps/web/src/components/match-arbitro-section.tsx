import type { ReactNode } from "react";

import Link from "next/link";

import {
  PRECEDENTI_PER_CONFRONTO,
  PRECEDENTI_PER_MEDIA,
  type ArbitroControLeSquadre,
  type ArbitroControSquadra,
  type PosizioneFraColleghi,
  type ProfiloArbitro,
} from "@/server/iqstats/referees";

/**
 * L'arbitro designato, e come pesa su questa gara.
 *
 * **Quando il modello gira, non e' un fattore da aggiungere: e' gia' dentro il numero.**
 * Misurato sugli artefatti di produzione: il modello dei cartellini gialli ha ottantacinque
 * ingressi e sedici sono dell'arbitro, quello dei falli ottantatre di cui sedici, e perfino
 * quello dei tiri ne porta uno. Chi legge deve saperlo, altrimenti somma a mente una
 * severita' che il motore ha gia' contato.
 *
 * **Ma sotto un ripiego il modello non gira, e allora l'arbitro nel numero non c'e'.** Per
 * questo la frase e' condizionata a `entratoNei`, che la pagina calcola dall'esito vero del
 * motore: dire «e' gia' dentro il numero» dove non lo e' sarebbe la peggiore delle
 * invenzioni, perche' e' un'affermazione di metodo.
 *
 * **I numeri sono i nostri.** La fonte pubblica le sue medie di carriera e il piano dice di
 * non usarle: qui ogni valore esce dalle nostre osservazioni, con il campione accanto e il
 * metro dei colleghi della stessa competizione.
 *
 * **La posizione si dice come posizione.** Nessun indice centrato su cento e nessuna fascia
 * decisa a tavolino: si dice quanti colleghi fischia piu' di lui, su quanti.
 */
function decimale(valore: number, cifre: number): string {
  return valore.toFixed(cifre).replace(".", ",");
}

/** Quanto una media si stacca dal metro, in percentuale, con il verso. */
function scarto(valore: number, metro: number): string | null {
  if (metro <= 0) return null;
  const quota = Math.round(((valore - metro) / metro) * 100);
  if (quota === 0) return "in linea con i colleghi";
  return `${quota > 0 ? "+" : ""}${quota}% rispetto ai colleghi`;
}

function Posizione({ posizione, cosa }: {
  readonly posizione: PosizioneFraColleghi | null;
  readonly cosa: string;
}) {
  if (posizione === null) return null;
  const quota = Math.round(posizione.quota * 100);
  const lettura = quota >= 60 ? `${cosa} più del ${quota}% dei colleghi`
    : quota <= 40 ? `${cosa} meno del ${100 - quota}% dei colleghi`
      : `${cosa} in linea con i colleghi`;
  return (
    <span className="engine-obs">
      {lettura}, su {posizione.colleghi} con almeno cinque gare
    </span>
  );
}

function Voce({ nome, valore, metro, cifre, posizione, cosa }: {
  readonly nome: string;
  readonly valore: number;
  readonly metro: number;
  readonly cifre: number;
  readonly posizione?: PosizioneFraColleghi | null;
  readonly cosa?: string;
}) {
  const distanza = scarto(valore, metro);
  return (
    <li className="engine-split">
      <span className="engine-who">
        {nome}
        {posizione === undefined ? null : <Posizione posizione={posizione} cosa={cosa ?? ""} />}
      </span>
      <span className="engine-exp">
        {decimale(valore, cifre)}
        <span className="engine-obs">a gara</span>
        <span className="engine-obs">
          metro della competizione {decimale(metro, cifre)}
          {distanza === null ? "" : ` · ${distanza}`}
        </span>
      </span>
    </li>
  );
}

/** Gli anni coperti dai precedenti: «2024» oppure «2023-2026». */
function arcoDeiPrecedenti(dal: string | null, al: string | null): string | null {
  if (dal === null || al === null) return null;
  const primo = dal.slice(0, 4);
  const ultimo = al.slice(0, 4);
  return primo === ultimo ? primo : `${primo}-${ultimo}`;
}

/**
 * Come ha diretto **questa** squadra, con il campione davanti al numero.
 *
 * Tre gradini, e il campione decide quale: sotto quattro precedenti si dice solo quanti sono
 * - una media su tre gare non e' una tendenza, e' un aneddoto - da quattro la media compare
 * dichiarata come campione limitato, da otto si puo' confrontare con quanto quell'arbitro
 * mostra di solito a una squadra.
 */
function ControSquadra({ nome, dati, abituale }: {
  readonly nome: string;
  readonly dati: ArbitroControSquadra;
  readonly abituale: number;
}) {
  const arco = arcoDeiPrecedenti(dati.dal, dati.al);
  const lati = [
    dati.inCasa.gare > 0 ? `${dati.inCasa.gare} in casa` : null,
    dati.inTrasferta.gare > 0 ? `${dati.inTrasferta.gare} fuori` : null,
  ].filter((v) => v !== null).join(" · ");
  const differenza = dati.gialli === null ? null : dati.gialli - abituale;

  return (
    <li className="engine-split">
      <span className="engine-who">
        {nome}
        <span className="engine-obs">
          {dati.precedenti === 0
            ? "nessuna gara sua con questo arbitro"
            : `${dati.precedenti} ${dati.precedenti === 1 ? "precedente" : "precedenti"}`
              + (lati === "" ? "" : ` · ${lati}`) + (arco === null ? "" : ` · ${arco}`)}
        </span>
      </span>
      <span className="engine-exp">
        {dati.gialli === null ? (
          <span className="engine-obs">
            {dati.precedenti === 0
              ? "niente da leggere"
              : `sotto ${PRECEDENTI_PER_MEDIA} precedenti non se ne fa una media`}
          </span>
        ) : (
          <>
            {decimale(dati.gialli, 2)}
            <span className="engine-obs">gialli a gara, a questa squadra</span>
            <span className="engine-obs">
              {dati.precedenti >= PRECEDENTI_PER_CONFRONTO && differenza !== null
                ? `contro i ${decimale(abituale, 2)} che mostra di solito a una squadra · `
                  + `${differenza > 0 ? "+" : ""}${decimale(differenza, 2)}`
                : "campione limitato: è quello che è successo, non una tendenza"}
            </span>
          </>
        )}
      </span>
    </li>
  );
}

/**
 * La lettura in parole, solo per le squadre che hanno il campione per reggerla.
 *
 * Sotto `PRECEDENTI_PER_CONFRONTO` non si scrive nessuna frase: il numero sta gia' nella
 * riga sopra con il suo campione, e una frase discorsiva su quattro gare peserebbe piu' di
 * quanto il dato valga.
 */
function frasiDeiPrecedenti(
  dati: ArbitroControLeSquadre,
  homeTeam: string,
  awayTeam: string,
): readonly string[] {
  return [[dati.casa, homeTeam] as const, [dati.trasferta, awayTeam] as const]
    .filter(([squadra]) =>
      squadra.gialli !== null && squadra.precedenti >= PRECEDENTI_PER_CONFRONTO)
    .map(([squadra, nome]) =>
      `Nei ${squadra.precedenti} precedenti con ${nome} ha mostrato `
      + `${decimale(squadra.gialli ?? 0, 2)} gialli a gara, contro i `
      + `${decimale(dati.abituale.gialli, 2)} che mostra di solito a una squadra.`);
}

type Props = {
  readonly profilo: ProfiloArbitro;
  /**
   * I precedenti dell'arbitro con le due squadre, `null` quando non ne ha con nessuna delle
   * due o quando il livello dati non risponde.
   */
  readonly controLeSquadre?: ArbitroControLeSquadre | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
  /**
   * I bersagli in cui gli ingressi dell'arbitro sono entrati davvero, gia' tradotti in
   * italiano. Vuoto quando nessuno di quelli che li portano e' stato previsto dal suo
   * modello: allora la sezione **non** puo' dire che l'arbitro e' dentro il numero.
   */
  readonly entratoNei: readonly string[];
  /**
   * La scheda per stagione e competizione, con le ultime gare e l'elenco della competizione
   * di questa gara. Sta **dentro** questa sezione e non in un pannello a parte: e' lo
   * stesso arbitro, e due riquadri di fila sullo stesso soggetto si leggono come due
   * argomenti diversi.
   */
  readonly scheda?: ReactNode;
};

export function MatchArbitroSection({
  profilo, homeTeam, awayTeam, entratoNei, scheda, controLeSquadre = null,
}: Props) {
  const sbilancioFalli = profilo.falliControCasa - profilo.falliControTrasferta;
  const sbilancioGialli = profilo.gialliControCasa - profilo.gialliControTrasferta;

  return (
    <section className="dossier-panel" aria-labelledby="arbitro-gara-title">
      <p className="dossier-kick">L&apos;arbitro, con i nostri numeri</p>
      <h2 id="arbitro-gara-title" className="squad-section-title">
        {profilo.nome}, e quanto pesa su questa gara
      </h2>

      {entratoNei.length > 0 ? (
        <p className="dossier-src">
          <b>Non &egrave; un fattore da aggiungere: &egrave; gi&agrave; dentro il numero.</b> Il
          modello dei cartellini gialli ha <b>85 ingressi e 16 sono dell&apos;arbitro</b>, quello
          dei falli 83 di cui 16, e perfino quello dei tiri ne porta uno. In questa gara &egrave;
          entrato in <b>{entratoNei.join(", ")}</b>: quegli attesi hanno gi&agrave; contato che a
          dirigere &egrave; lui, e quello che segue serve a capire <i>come</i> l&apos;ha contato,
          non a sommarlo di nuovo a mente.
        </p>
      ) : (
        <p className="dossier-src">
          <b>In questa gara l&apos;arbitro non &egrave; dentro gli attesi.</b> I bersagli che
          portano i suoi ingressi &mdash; falli, cartellini gialli e tiri in porta &mdash; qui
          non sono stati previsti dal loro modello: il valore viene da un ripiego, e un ripiego
          l&apos;arbitro non lo guarda. Quello che segue resta <b>che cosa &egrave; successo
          nelle gare che ha diretto</b>, ma non spiega i numeri che leggi pi&ugrave; sopra e
          <b> non va sommato a mente</b> a quelli.
        </p>
      )}

      <ul className="engine-rows">
        <li className="engine-row">
          <p className="engine-metric">Quanto fischia e quanto ammonisce</p>
          <ul className="engine-splits">
            <Voce
              nome="Falli"
              valore={profilo.media.falli}
              metro={profilo.metro.falli}
              cifre={1}
              posizione={profilo.posizioneFalli}
              cosa="fischia"
            />
            <Voce
              nome="Cartellini gialli"
              valore={profilo.media.gialli}
              metro={profilo.metro.gialli}
              cifre={2}
              posizione={profilo.posizioneGialli}
              cosa="ammonisce"
            />
            <Voce
              nome="Espulsioni"
              valore={profilo.media.rossi}
              metro={profilo.metro.rossi}
              cifre={2}
            />
          </ul>
        </li>

        <li className="engine-row">
          <p className="engine-metric">Da che parte pende</p>
          <ul className="engine-splits">
            <li className="engine-split">
              <span className="engine-who">
                Falli contro {homeTeam}
                <span className="engine-obs">
                  contro {awayTeam} {decimale(profilo.falliControTrasferta, 1)}
                </span>
              </span>
              <span className="engine-exp">
                {decimale(profilo.falliControCasa, 1)}
                <span className="engine-obs">
                  differenza {decimale(Math.abs(sbilancioFalli), 1)}
                </span>
              </span>
            </li>
            <li className="engine-split">
              <span className="engine-who">
                Gialli a {homeTeam}
                <span className="engine-obs">
                  a {awayTeam} {decimale(profilo.gialliControTrasferta, 2)}
                </span>
              </span>
              <span className="engine-exp">
                {decimale(profilo.gialliControCasa, 2)}
                <span className="engine-obs">
                  differenza {decimale(Math.abs(sbilancioGialli), 2)}
                </span>
              </span>
            </li>
          </ul>
        </li>

        {/* **Un fatto storico, non una previsione.** Le gare attraversano stagioni e
            competizioni perche' altrimenti il campione sarebbe zero, e il campione sta
            davanti al numero, non dopo. */}
        {controLeSquadre === null ? null : (
          <li className="engine-row">
            <p className="engine-metric">Come ha diretto queste due squadre</p>
            <ul className="engine-splits">
              <ControSquadra
                nome={homeTeam}
                dati={controLeSquadre.casa}
                abituale={controLeSquadre.abituale.gialli}
              />
              <ControSquadra
                nome={awayTeam}
                dati={controLeSquadre.trasferta}
                abituale={controLeSquadre.abituale.gialli}
              />
            </ul>
          </li>
        )}
      </ul>

      {controLeSquadre === null ? null : (
        <p className="dossier-src">
          {frasiDeiPrecedenti(controLeSquadre, homeTeam, awayTeam).map((frase) => (
            <span key={frase}>{frase} </span>
          ))}
          <b>Sono gare gi&agrave; giocate, non una previsione.</b> Un incontro fra un arbitro e una
          squadra si ripete poche volte - in tutto il nostro archivio il massimo &egrave;
          dodici - e con i gialli che variano di quasi due per gara, un campione cos&igrave;
          non separa la tendenza dal caso: dice che cosa &egrave; successo, e basta. La media
          dell&apos;arbitro con cui si confronta &egrave; quella che mostra <b>a una
          squadra</b> su tutte le {controLeSquadre.abituale.lati} righe che gli abbiamo
          osservato, non la sua media di gara, che vale il doppio.
        </p>
      )}

      {scheda ?? null}

      <p className="dossier-src">
        Tutto su <b>{profilo.gare} gare</b> dirette in {profilo.competizione}
        {profilo.finestra === "stagione" ? " in questa stagione" : ""}, di cui abbiamo
        entrambe le squadre: con una riga sola falli e cartellini della gara sarebbero
        dimezzati senza che si veda. I numeri sono calcolati sulle <b>nostre</b> osservazioni,
        non sulle medie di carriera che la fonte pubblica, e il metro &egrave; la media dei
        direttori della stessa competizione
        {profilo.finestra === "stagione" ? " in questa stagione" : ""} con almeno cinque gare.
      </p>
      {/* La cautela sul senso dei numeri vale su ogni arbitro ed e' sempre la stessa: sta a
          un tocco, sotto la riga che dichiara campione e metro, che invece resta in pagina. */}
      <details className="dossier-spiega">
        <summary>Che cosa non dicono questi numeri</summary>
        <p className="dossier-src">
        <b>Non &egrave; un voto.</b> Un arbitro che fischia molto pu&ograve; aver avuto
        partite spigolose, e uno che ammonisce poco pu&ograve; aver diretto gare tranquille:
        qui si misura quello che &egrave; successo in campo, non come ha arbitrato. La
        differenza fra i due lati &egrave; una differenza fra medie, non una tendenza
        dimostrata: su {profilo.gare} gare serve poco a spostarla.{" "}
        <Link href={`/arbitri/${profilo.sourceId}`}>La scheda completa</Link> ha lo storico
        gara per gara.
        </p>
      </details>
    </section>
  );
}
