import type { CSSProperties } from "react";

import type { Contesto } from "@/server/iqstats/contesto-gara";
import type { Convergenza, MatchIntelligence, Segnale } from "@/server/iqstats/match-intelligence";
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
            : ` · in questa lega succede il ${Math.round(lettura.base)}% delle volte`}
          {squadre}
          {" · affidabilità "}{lettura.affidabilita}/100
        </em>
      </span>
      <span className="dossier-bar" aria-hidden="true">
        <i style={{ width: `${Math.round((lettura.forza / massima) * 100)}%` }} />
      </span>
      <span className="dossier-1x2-val">{percento(lettura.probabilita)}</span>
    </div>
  );
}

type Props = Readonly<{
  contesto: Contesto | null;
  dossier: MatchIntelligence;
  forti: LettureDellaGara | null;
  homeTeam: string;
  awayTeam: string;
}>;

export function MatchInsightSection({ contesto, dossier, forti, homeTeam, awayTeam }: Props) {
  if (!insightHaContenuto({ contesto, dossier, forti })) return null;

  const principale = dossier.principale;
  const secondo = dossier.secondo;
  const conflitto = dossier.conflitti[0] ?? null;
  const valore = dossier.candidatoDiValore;
  const righe = forti?.letture ?? [];
  const massima = righe[0]?.forza ?? 1;
  const chi = (lettura: LetturaForte) => lettura.lato === "casa" ? homeTeam
    : lettura.lato === "trasferta" ? awayTeam : "Totale gara";

  return (
    <section className="dossier-panel insight-panel" aria-labelledby="insight-title">
      <p className="dossier-kick">Che cosa vede IQstatS</p>
      <h2 id="insight-title" className="sr-only-heading">
        La lettura principale di {homeTeam} contro {awayTeam}
      </h2>

      {/* 1. Il verdetto: la riga che si legge in cinque secondi, e chi e' dato avanti. */}
      {contesto === null ? null : (
        <>
          <p className="insight-verdetto">{contesto.titolo}</p>
          {contesto.favorito === null ? null : (
            <p className="insight-favorito">{contesto.favorito}</p>
          )}
        </>
      )}

      {/* 2, 3, 6, 7. Il segnale principale con la sua forza, l'affidabilita' e il campione:
          e' l'unico elemento che porta un numero grande, perche' e' la risposta. */}
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

      {/* 9. Le letture che reggono: le prime in vista, le altre dietro un riepilogo, perche'
          oltre la terza diventano un elenco da scorrere invece di una lettura. */}
      {righe.length === 0 ? null : (
        <>
          <p className="insight-sotto">Le letture che reggono</p>
          <div className="dossier-1x2">
            {righe.slice(0, IN_VISTA).map((lettura) => (
              <Lettura
                key={`${lettura.bersaglio}-${lettura.lato}-${lettura.soglia}`}
                lettura={lettura}
                nome={chi(lettura)}
                massima={massima}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
              />
            ))}
          </div>
          {righe.length > IN_VISTA ? (
            <details className="dossier-spiega">
              <summary>
                {righe.length - IN_VISTA === 1
                  ? "L'altra lettura che supera la forza minima"
                  : `Le altre ${righe.length - IN_VISTA} letture che superano la forza minima`}
              </summary>
              <div className="dossier-1x2">
                {righe.slice(IN_VISTA).map((lettura) => (
                  <Lettura
                    key={`${lettura.bersaglio}-${lettura.lato}-${lettura.soglia}`}
                    lettura={lettura}
                    nome={chi(lettura)}
                    massima={massima}
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
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
        In cima non c&apos;è la percentuale più alta: c&apos;è la lettura che si scosta di più
        da quanto succede di solito in questa lega, pesata per quanto quel bersaglio ci prende
        fuori campione. Un segnale è forte quando almeno tre letture indipendenti dicono la
        stessa cosa e nessuna dice il contrario; le letture tiepide non contano da nessuna
        delle due parti.
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
