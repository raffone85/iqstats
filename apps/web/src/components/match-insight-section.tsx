import Link from "next/link";

import { articoloDiPercentuale } from "@/lib/italiano";
import type { CSSProperties } from "react";

import type { ContoDelleLetture } from "@/server/iqstats/consuntivo";
import type { Contesto } from "@/server/iqstats/contesto-gara";
import type { Convergenza, MatchIntelligence, Segnale } from "@/server/iqstats/match-intelligence";
import {
  CONSUNTIVO_DI_MERCATO, MERCATI_DI_GOL, type EventoProbabile,
} from "@/server/iqstats/projection/eventi-probabili";
import type { LetturaForte, LettureDellaGara } from "@/server/iqstats/projection/letture-forti";
import { FAMIGLIE } from "./match-projection-section";

/**
 * Che cosa vede IQstatS in questa gara, in un blocco solo.
 *
 * **Perche' esiste.** Fino al 3 settembre 2026 la testa del dossier erano quattro pannelli
 * di pari rango - «Il quadro della gara», «Che cosa dice la gara», «Dove il modello dice
 * qualcosa» e la sintesi del valore - che rispondevano a tre domande vicine con quattro
 * riquadri identici. Chi apriva la pagina non sapeva quale fosse la risposta: le leggeva
 * tutte, o nessuna.
 *
 * **Non calcola niente.** Ogni numero qui dentro arriva gia' fatto da chi lo sa fare:
 * `contestoDiGara` per il verdetto e gli attesi, `matchIntelligence` per i segnali e il
 * candidato di valore, `lettureForti` per l'ordine delle letture. Questo componente decide
 * soltanto **in che ordine si leggono** e quanto pesano sulla pagina.
 *
 * **Il valore resta separato dal segnale.** Un segnale forte su un esito che il mercato
 * prezza uguale non e' un'occasione, e un margine su una lettura fiacca non e' un segnale:
 * qui c'e' la sola riga di sintesi, e il dettaglio con quota, affidabilita' e campione vive
 * nell'area Mercati, che e' la sua.
 */

const ETICHETTA: Record<Convergenza, string> = {
  forte: "forte convergenza",
  convergenza: "convergenza",
  neutrale: "una sola lettura",
  conflitto: "letture discordi",
};

/** Quante letture stanno in vista prima che diventino un elenco da scorrere. */
const IN_VISTA = 3;

function percento(quota: number): string {
  return `${Math.round(quota * 100)}%`;
}

function soglia(numero: number): string {
  return numero.toFixed(1).replace(".", ",");
}

/** Quante letture indipendenti sostengono un segnale, e quante lo contraddicono. */
function conteggioFonti(segnale: Segnale): string {
  const pro = segnale.fonti.filter((f) => f.favorevole).length;
  const contro = segnale.fonti.filter((f) => f.contraria).length;
  if (contro > 0) {
    return `${pro} ${pro === 1 ? "lettura" : "letture"} a favore, `
      + `${contro} ${contro === 1 ? "contraria" : "contrarie"}`;
  }
  return pro > 0 ? `${pro} ${pro === 1 ? "lettura d’accordo" : "letture d’accordo"}` : "";
}

/**
 * L'area Insight esiste quando almeno una delle sue quattro voci ha qualcosa da dire.
 *
 * **Sta qui e non nella pagina**, e la pagina la chiama: la condizione dell'area e la
 * guardia del componente devono essere la stessa frase, altrimenti divergono. E' successo
 * il 3 settembre - un'intestazione senza un pannello sotto, sulla gara 209561 - perche'
 * erano scritte in due posti.
 */
export function insightHaContenuto({ contesto, dossier, forti }: {
  readonly contesto: Contesto | null;
  readonly dossier: MatchIntelligence;
  readonly forti: LettureDellaGara | null;
}): boolean {
  return contesto !== null
    || dossier.principale !== null
    || dossier.conflitti.length > 0
    || (forti !== null && forti.letture.length > 0);
}

/**
 * Quando il verdetto non c'e', il dossier lo dichiara invece di sparire.
 *
 * Il 5 settembre 2026, su quattordici gare campionate una per campionato, **sei non
 * avevano nessuna delle quattro fonti del verdetto**: niente contesto, niente segnale
 * principale, nessun conflitto, nessuna lettura oltre la forza minima. Su quelle l'area
 * spariva, e la prima cosa che si leggeva era «Mercati»: la pagina smetteva di dire che
 * partita sarebbe stata, che e' l'unica cosa che deve dire per prima.
 *
 * Abbassare la soglia perche' un verdetto ci sia sempre era l'altra strada, ed e' scartata:
 * e' il difetto che rimproveriamo altrove, l'indice assegnato a un arbitro con una gara
 * diretta. Sotto soglia non si dichiara. Si dichiara che non si dichiara, e perche'.
 */
export function MatchSenzaVerdetto({ motivi }: { readonly motivi: readonly string[] }) {
  return (
    <section className="dossier-panel insight-panel" aria-labelledby="insight-title">
      <p className="dossier-kick">Che cosa vede IQstatS</p>
      <h2 id="insight-title" className="sr-only-heading">La lettura principale di questa gara</h2>
      <p className="insight-verdetto">Su questa gara non abbiamo un verdetto.</p>
      <ul className="insight-senza">
        {motivi.map((motivo) => <li key={motivo}>{motivo}</li>)}
      </ul>
      <p className="dossier-src">
        Il verdetto nasce dalle letture che superano la forza minima. Sotto quella soglia
        non lo dichiariamo, invece di dichiararlo debole: i capitoli qui sotto restano,
        con i numeri che abbiamo davvero.
      </p>
    </section>
  );
}

/** Le fonti di un segnale, in linea: il nome della lettura e quanto dice. */
function Fonti({ segnale }: { readonly segnale: Segnale }) {
  if (segnale.fonti.length === 0) return null;
  return (
    <ul className="insight-fonti">
      {segnale.fonti.map((f) => (
        <li
          key={f.nome}
          className={f.contraria ? "intel-contro" : f.favorevole ? "intel-pro" : undefined}
        >
          {f.nome} <b>{Math.round(f.valore * 100)}%</b>
        </li>
      ))}
    </ul>
  );
}

/**
 * Una riga di lettura forte: il verso con la sua soglia, quanto succede di solito in questa
 * lega, l'affidabilita' del bersaglio e la probabilita'. La barra e' la stessa del dossier.
 */
function Lettura({ lettura, nome, massima, homeTeam, awayTeam }: {
  readonly lettura: LetturaForte;
  readonly nome: string;
  readonly massima: number;
  readonly homeTeam: string;
  readonly awayTeam: string;
}) {
  const famiglia = FAMIGLIE[lettura.bersaglio];
  // Su una linea di lato la squadra e' gia' nominata a sinistra; su una di totale sono due,
  // e senza il nome non si saprebbe di chi e' quale numero. Il campione resta scritto.
  const squadre = lettura.squadre.length === 0 ? "" : lettura.lato === "totale"
    ? " · " + lettura.squadre
      .map((s) => `${s.lato === "casa" ? homeTeam : awayTeam} ${Math.round(s.quota)}% su ${s.gare}`)
      .join(", ")
    : lettura.squadre
      .map((s) => ` · questa squadra il ${Math.round(s.quota)}% su ${s.gare} gare`)
      .join("");
  return (
    <div
      className="dossier-1x2-row"
      style={{ "--famiglia": famiglia?.tinta ?? "var(--card-brand)" } as CSSProperties}
    >
      <span className="dossier-1x2-label">
        {lettura.verso} {soglia(lettura.soglia)} · {famiglia?.nome ?? lettura.bersaglio}
        <em className="engine-obs">
          {nome}
          {lettura.base === null
            ? " · non sappiamo quanto sia normale in questa lega"
            : ` · in questa lega succede ${articoloDiPercentuale(lettura.base)}${Math.round(lettura.base)}% delle volte`}
          {squadre}
          {" · affidabilità "}{lettura.affidabilita}/100
        </em>
      </span>
      {/* La barra segue **la probabilita'**, che e' il numero scritto qui accanto e il
          criterio con cui queste righe sono ordinate dal 6 settembre 2026. Prima seguiva la
          forza: con l'ordine nuovo la prima riga non e' piu' la piu' forte, e le barre
          sarebbero uscite disordinate rispetto ai numeri che accompagnano. */}
      <span className="dossier-bar" aria-hidden="true">
        <i style={{ width: `${Math.round((lettura.probabilita / massima) * 100)}%` }} />
      </span>
      <span className="dossier-1x2-val">{percento(lettura.probabilita)}</span>
    </div>
  );
}

/**
 * Una riga di mercato dei gol, nella stessa forma di una lettura di famiglia.
 *
 * **Quello che cambia e' cio' che la riga sa dire di se'.** Una famiglia porta
 * l'affidabilita' del suo bersaglio e quante volte quella linea succede in quel campionato;
 * un mercato dei gol non ha ne' l'una ne' l'altra, perche' non passa dai modelli e la
 * `baseDiLega` non copre i gol. Al loro posto porta il consuntivo del suo mercato, misurato
 * il 12 settembre 2026 su 1.200 gare chiuse: senza quello starebbe in un elenco che dichiara
 * quanto regge senza sapere quanto regge lei.
 *
 * **Nessuna tinta nuova:** i quattro mercati usano la tinta di marca, perche' non sono una
 * delle sette famiglie e inventare un colore per loro vorrebbe dire uscire dalla tabella
 * dei token.
 */
function EventoDiGol({ evento, massima, homeTeam, awayTeam, campione }: {
  readonly evento: Extract<EventoProbabile, { da: "gol" }>;
  readonly massima: number;
  readonly homeTeam: string;
  readonly awayTeam: string;
  /** Le gare per lato su cui poggiano i gol attesi; `null` quando non si sa. */
  readonly campione: number | null;
}) {
  const consuntivo = CONSUNTIVO_DI_MERCATO[evento.mercato];
  const chi = evento.lato === null ? null : evento.lato === "casa" ? homeTeam : awayTeam;
  return (
    <div
      className="dossier-1x2-row"
      style={{ "--famiglia": "var(--card-brand)" } as CSSProperties}
    >
      <span className="dossier-1x2-label">
        {evento.voce.replace(".", ",")} · {MERCATI_DI_GOL[evento.mercato]}
        <em className="engine-obs">
          {chi === null ? "" : `${chi} · `}
          {campione === null
            ? "dai gol attesi delle due squadre"
            : `dai gol attesi, su ${campione} gare per lato`}
          {` · questo mercato ha reso ${consuntivo.reso.toFixed(1).replace(".", ",")}% `}
          {`su ${consuntivo.promesso.toFixed(1).replace(".", ",")}% promesso, `}
          {`${consuntivo.previsioni.toLocaleString("it-IT")} previsioni`}
        </em>
      </span>
      <span className="dossier-bar" aria-hidden="true">
        <i style={{ width: `${Math.round((evento.probabilita / massima) * 100)}%` }} />
      </span>
      <span className="dossier-1x2-val">{percento(evento.probabilita)}</span>
    </div>
  );
}

/** La chiave di riga: il bersaglio con il suo lato e la sua soglia, o il mercato con la voce. */
function chiaveDiEvento(evento: EventoProbabile): string {
  return evento.da === "famiglia"
    ? `${evento.bersaglio}-${evento.lato}-${evento.soglia}`
    : `${evento.mercato}-${evento.voce}-${evento.lato ?? "partita"}`;
}

/** Una riga dell'elenco, nella forma che la sua provenienza le consente. */
function RigaDiEvento({ evento, chi, massima, homeTeam, awayTeam, campioneGol }: {
  readonly evento: EventoProbabile;
  readonly chi: (lettura: LetturaForte) => string;
  readonly massima: number;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly campioneGol: number | null;
}) {
  return evento.da === "famiglia" ? (
    <Lettura
      lettura={evento}
      nome={chi(evento)}
      massima={massima}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
    />
  ) : (
    <EventoDiGol
      evento={evento}
      massima={massima}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      campione={campioneGol}
    />
  );
}

/**
 * **Il pronostico: una riga, e la sola cosa che il dossier dichiara di giocare.**
 *
 * Fino al 6 settembre 2026 la testa del dossier rispondeva alla domanda «che partita sara'»
 * ma non a quella che la gente fa davvero, «e allora?». Al posto della risposta c'era il
 * segnale principale, che e' un'altra cosa: su Rizespor contro Alanyaspor era «Piu' di 1,5
 * fuorigioco» all'88% con **tre gare di campione**, perche' i segnali si ordinano per
 * convergenza e affidabilita' e il campione non entra mai in quell'ordine.
 *
 * **Non e' un criterio nuovo.** E' la lettura in cima, cioe' quella che la vetrina di
 * `/pronostici` sceglie gia' e che il consuntivo di `/metodo` misura: probabilita' piu'
 * alta dentro la fascia fino all'ottanta per cento, a parita' di punto il bersaglio che
 * sbaglia meno. Un secondo criterio, scelto qui e misurato da nessuna parte, sarebbe stato
 * un pronostico senza consuntivo.
 *
 * **Le due righe sotto il numero esistono per non essere banali.** La prima dice quanto ci
 * scostiamo da quello che in quel campionato succede comunque: dove lo scarto e' zero la
 * lettura e' la norma del torneo, e il pronostico lo dichiara invece di spacciarla per una
 * lettura nostra. La seconda dice quanto quella famiglia ha reso sulle gare gia' chiuse,
 * promesso contro osservato, che e' l'unica prova che il numero grande valga qualcosa.
 */
function Pronostico({ lettura, chi, resa, gare }: {
  readonly lettura: LetturaForte;
  readonly chi: string;
  readonly resa: ContoDelleLetture | null;
  readonly gare: number;
}) {
  const famiglia = FAMIGLIE[lettura.bersaglio];
  const nostra = Math.round(lettura.probabilita * 100);
  const base = lettura.base === null ? null : Math.round(lettura.base);
  return (
    <div className="insight-pronostico">
      <p className="insight-rango">Il pronostico</p>
      <div className="insight-testa">
        <b className="insight-titolo">
          {lettura.verso} {soglia(lettura.soglia)}{" "}
          {famiglia?.nome.toLowerCase() ?? lettura.bersaglio}
          <em> · {chi}</em>
        </b>
        <span className="insight-prob">{nostra}%</span>
      </div>

      <p className="insight-conv">
        {base === null
          ? "Di questa lega non sappiamo quanto sia normale: senza un metro, il numero qui accanto è tutto quello che abbiamo."
          : nostra === base
            ? `In questa lega succede ${articoloDiPercentuale(base)}${base}% delle volte: è esattamente la norma del torneo, e noi non ci aggiungiamo niente.`
            : `In questa lega succede ${articoloDiPercentuale(base)}${base}% delle volte: ci scostiamo di ${Math.abs(nostra - base)} ${Math.abs(nostra - base) === 1 ? "punto" : "punti"} ${nostra > base ? "in più" : "in meno"}.`}
        {" "}Affidabilità {lettura.affidabilita}/100.
      </p>

      <p className="insight-perche">
        {resa === null
          ? "Di questa famiglia non abbiamo ancora un consuntivo: quanto regga sulle gare chiuse non lo sappiamo."
          : `Letture di questa famiglia sulle ${gare} gare chiuse che abbiamo misurato: promesse `
            + `${(resa.probabilitaPromessa * 100).toFixed(1).replace(".", ",")}%, prese `
            + `${(resa.frequenzaOsservata * 100).toFixed(1).replace(".", ",")}% su ${resa.letture}.`}
      </p>
    </div>
  );
}

type Props = Readonly<{
  contesto: Contesto | null;
  dossier: MatchIntelligence;
  forti: LettureDellaGara | null;
  homeTeam: string;
  awayTeam: string;
  /** Quanto ha reso finora la famiglia della lettura in cima, dal consuntivo. */
  resa: ContoDelleLetture | null;
  /** Su quante gare chiuse poggia quella resa. */
  gareDelConsuntivo: number;
  /** Le letture e i mercati dei gol ammessi, gia' ordinati da `eventiProbabili`. */
  eventi: readonly EventoProbabile[];
  /** Le gare per lato su cui poggiano i gol attesi; `null` dove i mercati non ci sono. */
  campioneGol: number | null;
}>;

export function MatchInsightSection(
  {
    contesto, dossier, forti, homeTeam, awayTeam, resa, gareDelConsuntivo, eventi,
    campioneGol,
  }: Props,
) {
  if (!insightHaContenuto({ contesto, dossier, forti })) return null;

  const principale = dossier.principale;
  const secondo = dossier.secondo;
  const conflitto = dossier.conflitti[0] ?? null;
  const valore = dossier.candidatoDiValore;
  const righe = forti?.letture ?? [];
  // La barra si scala sulla riga piu' alta dell'elenco mostrato, che dal 12 settembre 2026
  // puo' essere un mercato dei gol: scalare ancora sulle sole letture avrebbe dato barre
  // piene oltre il bordo dove il multigol sta sopra la prima famiglia.
  const massima = eventi[0]?.probabilita ?? righe[0]?.probabilita ?? 1;
  const chi = (lettura: LetturaForte) => lettura.lato === "casa" ? homeTeam
    : lettura.lato === "trasferta" ? awayTeam : "Totale gara";

  return (
    <section className="dossier-panel insight-panel" aria-labelledby="insight-title">
      <p className="dossier-kick">Che cosa vede IQstatS</p>
      <h2 id="insight-title" className="sr-only-heading">
        La lettura principale di {homeTeam} contro {awayTeam}
      </h2>

      {/* 0. Il pronostico: la cosa che si legge per prima, perche' e' la domanda vera.
             **Non e' piu' la prima riga dell'elenco.** Quella era la piu' probabile, e la
             piu' probabile e' quasi sempre la norma del campionato: su 1.200 gare chiuse il
             suo scarto mediano dalla lega era +0,5 punti. Adesso e' `consigliato`, che deve
             staccarsi di almeno cinque punti; dove non c'e', si dichiara. */}
      {righe.length === 0 ? null : forti?.consigliato == null ? (
        <p className="insight-riserva">
          Nessuna lettura di questa gara si stacca abbastanza dalla norma del campionato:
          niente pronostico, e le letture restano qui sotto.
        </p>
      ) : (
        <Pronostico
          lettura={forti.consigliato}
          chi={chi(forti.consigliato)}
          resa={resa}
          gare={gareDelConsuntivo}
        />
      )}

      {/* 1. Il verdetto: la riga che si legge in cinque secondi, e chi e' dato avanti. */}
      {contesto === null ? null : (
        <>
          <p className="insight-verdetto">{contesto.titolo}</p>
          {contesto.favorito === null ? null : (
            <p className="insight-favorito">{contesto.favorito}</p>
          )}
        </>
      )}

      {/* 2, 3, 6, 7. Il segnale principale con la sua forza, l'affidabilita' e il campione.
          **Non e' piu' il numero grande della pagina**: quello e' il pronostico, sopra. I
          segnali si ordinano per convergenza e affidabilita', e il campione non entra in
          quell'ordine: qui puo' arrivare in cima una lettura su tre gare, lo dice la riga
          del campione, e per questo non sta al posto della risposta. */}
      {principale === null ? null : (
        <div className={`insight-segnale intel-${principale.convergenza}`}>
          <p className="insight-rango">Segnale principale</p>
          <div className="insight-testa">
            <b className="insight-titolo">{principale.titolo}</b>
            <span className="insight-prob">{Math.round(principale.probabilita)}%</span>
          </div>
          <p className="insight-conv">
            {ETICHETTA[principale.convergenza]}
            {conteggioFonti(principale) === "" ? "" : `, ${conteggioFonti(principale)}`}
            {principale.mercato === null
              ? " · il mercato non quota questo esito"
              : ` · il mercato lo prezza ${Math.round(principale.mercato)}%`}
          </p>
          <Fonti segnale={principale} />
          <p className="insight-perche">
            {principale.perche}{" "}
            {principale.affidabilita === null
              ? "Su questa lettura l’affidabilità non è misurata."
              : `Affidabilità misurata ${Math.round(principale.affidabilita)}.`}
            {principale.campione === null ? "" : ` Campione: ${principale.campione} gare.`}
          </p>
        </div>
      )}

      {/* 4. Il secondo segnale, compatto: stessa sostanza, meno peso in pagina. */}
      {secondo === null ? null : (
        <div className={`insight-secondario intel-${secondo.convergenza}`}>
          <p className="insight-rango">Secondo segnale</p>
          <div className="insight-testa">
            <b className="insight-titolo-2">{secondo.titolo}</b>
            <span className="insight-prob-2">{Math.round(secondo.probabilita)}%</span>
          </div>
          <p className="insight-conv">
            {ETICHETTA[secondo.convergenza]}
            {conteggioFonti(secondo) === "" ? "" : `, ${conteggioFonti(secondo)}`}
            {secondo.affidabilita === null
              ? " · affidabilità non misurata"
              : ` · affidabilità ${Math.round(secondo.affidabilita)}`}
            {secondo.campione === null ? "" : ` · ${secondo.campione} gare`}
          </p>
        </div>
      )}

      {/* 8. Il conflitto si dichiara: sceglierne una e tacere l'altra sarebbe la cosa piu'
          facile e la meno onesta. */}
      {conflitto === null ? null : (
        <div className="insight-secondario intel-conflitto">
          <p className="insight-rango">Letture discordi</p>
          <div className="insight-testa">
            <b className="insight-titolo-2">{conflitto.titolo}</b>
            <span className="insight-prob-2">{Math.round(conflitto.probabilita)}%</span>
          </div>
          <p className="insight-conv">{conteggioFonti(conflitto)}</p>
        </div>
      )}

      {/* 5. Il valore, se c'e': una riga sola, e dice dove sta il resto. Non si ricalcola
          niente - `candidatoDiValore` e' gia' scelto dal Value Engine. */}
      {valore !== null && valore.edge !== null ? (
        <p className="insight-valore">
          <b>Candidato di valore, separato dal segnale:</b> {valore.label}, dove diamo{" "}
          {Math.round(valore.probability)}% contro il{" "}
          {Math.round(valore.marketProbability ?? 0)}% che prezza il mercato.{" "}
          {valore.solida
            ? "Il margine è positivo e l’affidabilità supera la soglia misurata."
            : "L’affidabilità non basta a dichiararlo solido."}{" "}
          <span className="insight-rimando">Quota, margine e campione stanno in Mercati.</span>
        </p>
      ) : null}

      {/* Gli attesi che reggono il verdetto: previsione di questa gara contro la media gia'
          osservata sulle squadre di questo campionato, dallo stesso lato del campo. */}
      {contesto === null || contesto.tessere.length === 0 ? null : (
        <>
          <p className="insight-sotto">Da dove viene</p>
          <ul className="contesto-righe">
            {contesto.tessere.map((t) => (
              <li
                className="contesto-riga"
                key={t.bersaglio}
                style={{ "--famiglia": FAMIGLIE[t.bersaglio]?.tinta } as CSSProperties}
              >
                <span className="contesto-fam">
                  {FAMIGLIE[t.bersaglio]?.nome ?? t.nome}
                  <em> · {t.soggetto}</em>
                </span>
                <span className="contesto-atteso">{t.atteso}</span>
                <span className={`contesto-metro${t.verso === 1 ? " is-sopra" : t.verso === -1 ? " is-sotto" : ""}`}>
                  {t.metro === null
                    ? "senza un metro con cui confrontarlo"
                    : `media del campionato ${t.metro}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 9. Gli eventi piu' probabili: le prime righe in vista, le altre dietro un
          riepilogo, perche' oltre la terza diventano un elenco da scorrere invece di una
          lettura.

          **Dal 12 settembre 2026 questa lista non e' piu' di sole famiglie.** Accanto alle
          letture dei sette bersagli stanno i quattro mercati dei gol che hanno superato il
          consuntivo di `consuntivo-gol.ts`: multigol di partita, gol totali, multigol di
          squadra e doppia chance. Fuori l'esito 1X2, che promette 58,8% e rende 46,4%, e
          gol/nogol a -3,8: lo stesso metro per cui i falli non salgono in cima.

          **Non e' una seconda lista.** Le stesse letture di prima, piu' i gol, nello stesso
          ordine per probabilita': una lista nuova accanto a questa avrebbe mostrato due
          volte le stesse righe. */}
      {eventi.length === 0 ? null : (
        <>
          <p className="insight-sotto">Gli eventi più probabili</p>
          <div className="dossier-1x2">
            {eventi.slice(0, IN_VISTA).map((evento) => (
              <RigaDiEvento
                key={chiaveDiEvento(evento)}
                evento={evento}
                chi={chi}
                massima={massima}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                campioneGol={campioneGol}
              />
            ))}
          </div>
          {eventi.length > IN_VISTA ? (
            <details className="dossier-spiega">
              <summary>
                {eventi.length - IN_VISTA === 1
                  ? "L’altro evento che il modello sa misurare"
                  : `Gli altri ${eventi.length - IN_VISTA} eventi che il modello sa misurare`}
              </summary>
              <div className="dossier-1x2">
                {eventi.slice(IN_VISTA).map((evento) => (
                  <RigaDiEvento
                    key={chiaveDiEvento(evento)}
                    evento={evento}
                    chi={chi}
                    massima={massima}
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                    campioneGol={campioneGol}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}

      {/* La riserva del quadro e i limiti delle letture: un'assenza si dichiara assenza. */}
      {contesto === null ? null : <p className="insight-riserva">{contesto.riserva}</p>}

      <p className="dossier-src">
        In cima c&apos;è la lettura più probabile <b>dentro la fascia fino all&apos;ottanta
        per cento</b>, dove promesso e reso quasi coincidono: 74,6% promesso contro 73,8%
        reso su 2.204 letture. Sopra quella soglia il modello promette 82,4% e rende 78,9% su
        660 letture. Misurato su 1.200 gare chiuse, 599 con almeno una lettura, sette famiglie
        su sette. <b>I falli restano fuori dalla cima</b>: promettono 67,9% e rendono 57,5%,
        dieci punti e mezzo dove le altre sei famiglie stanno entro 3,3, e si leggono nella
        card della loro famiglia. A parità di punto percentuale viene prima il bersaglio che
        sbaglia meno. È lo stesso criterio della
        vetrina in <Link href="/pronostici">Pronostici</Link>, e il suo consuntivo — prese e
        sbagliate — sta in <Link href="/metodo#consuntivo-title">Metodo</Link>. Un segnale è
        forte quando almeno tre letture indipendenti dicono la stessa cosa e nessuna dice il
        contrario; le letture tiepide non contano da nessuna delle due parti.
        {forti !== null && forti.senzaMisura.length > 0 ? (
          <>
            {" "}Restano fuori{" "}
            {forti.senzaMisura.map((t) => FAMIGLIE[t]?.nome ?? t).join(", ")}: non sappiamo
            quanto reggono.
          </>
        ) : null}
        {righe.some((r) => r.squadre.length > 0) ? (
          <>
            {" "}Le percentuali di squadra contano tutte le stagioni archiviate di questa
            competizione, dal lato che quella squadra gioca qui: una finestra più larga di
            quella della lega, che è la stagione in corso.
          </>
        ) : null}
        {" "}Niente qui è un consiglio di gioco: sono frequenze misurate e probabilità del
        modello, con accanto quanto reggono.
      </p>
    </section>
  );
}
