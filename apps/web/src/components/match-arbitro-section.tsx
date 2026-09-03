import type { ReactNode } from "react";

import Link from "next/link";

import type { PosizioneFraColleghi, ProfiloArbitro } from "@/server/iqstats/referees";

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

type Props = {
  readonly profilo: ProfiloArbitro;
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
  profilo, homeTeam, awayTeam, entratoNei, scheda,
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
      </ul>

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
      <p className="dossier-src">
        <b>Non &egrave; un voto.</b> Un arbitro che fischia molto pu&ograve; aver avuto
        partite spigolose, e uno che ammonisce poco pu&ograve; aver diretto gare tranquille:
        qui si misura quello che &egrave; successo in campo, non come ha arbitrato. La
        differenza fra i due lati &egrave; una differenza fra medie, non una tendenza
        dimostrata: su {profilo.gare} gare serve poco a spostarla.{" "}
        <Link href={`/arbitri/${profilo.sourceId}`}>La scheda completa</Link> ha lo storico
        gara per gara.
      </p>
    </section>
  );
}
