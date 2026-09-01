import type { Metadata } from "next";
import Link from "next/link";

import { ProductShell } from "@/components/product-shell";

export const metadata: Metadata = {
  title: "Laboratorio dossier",
  description: "Come si legge una gara prima del fischio, fuori dal sito in produzione.",
};

function percento(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default function LaboratorioPage() {
  return (
    <ProductShell>
      <div className="oggi-backdrop" aria-hidden="true" />
      <div className="dossier">
        <Link className="dossier-back" href="/">← Home</Link>

        <article className="oggi-hero">
          <div className="oggi-hero-stadium" aria-hidden="true" />
          <div className="oggi-hero-scrim" aria-hidden="true" />
          <div className="oggi-hero-body">
            <p className="oggi-hero-comp">
              <span>Serie A · 1ª giornata · laboratorio</span>
              <span className="oggi-hero-when">Sabato 23 agosto · esempio fisso, non una gara live</span>
            </p>
            <div className="oggi-hero-teams">
              <span className="oggi-team">
                <span className="oggi-crest"><span className="oggi-crest-mono">AT</span></span>
                <span className="oggi-team-name">Atalanta</span>
              </span>
              <span className="oggi-vs">contro</span>
              <span className="oggi-team oggi-team-away">
                <span className="oggi-team-name">Bologna</span>
                <span className="oggi-crest"><span className="oggi-crest-mono">BO</span></span>
              </span>
            </div>
          </div>
        </article>

        <section className="dossier-panel contesto" aria-labelledby="quadro-title">
          <p className="dossier-kick">Il quadro della gara</p>
          <h2 id="quadro-title" className="sr-only-heading">Che gara è attesa</h2>
          <p className="contesto-titolo">
            Casa che attacca, ospite che resiste: i gol stanno nella media del campionato,
            il primo tempo è stretto, e il prezzo della vittoria di casa è un filo corto
            rispetto al modello.
          </p>
          <p className="contesto-favorito">Atalanta avanti, 58%</p>
          <p className="contesto-legenda">
            Attesi in questa gara, contro la media già osservata <b>dallo stesso lato del campo</b>.
            I tre numeri sotto non sono un pronostico chiuso: sono dove il modello si ferma
            prima di aprire i mercati.
          </p>
          <ul className="contesto-righe">
            <li className="contesto-riga">
              <span className="contesto-fam">Gol <em>· gara</em></span>
              <span className="contesto-atteso">2,64</span>
              <span className="contesto-metro">media del campionato 2,58</span>
            </li>
            <li className="contesto-riga">
              <span className="contesto-fam">Gol <em>· primo tempo</em></span>
              <span className="contesto-atteso">1,16</span>
              <span className="contesto-metro">44% del totale, quota europea dichiarata</span>
            </li>
            <li className="contesto-riga">
              <span className="contesto-fam">Entrambe <em>· segnano</em></span>
              <span className="contesto-atteso">57%</span>
              <span className="contesto-metro is-sopra">sopra la metà dei casi</span>
            </li>
          </ul>
          <p className="contesto-riserva">
            Campione: 8 gare di Atalanta in casa, 7 di Bologna fuori, 76 righe di Serie A.
            Sotto le dieci gare il numero resta ancorato alla media di lega: una sola
            serata fuori scala non diventa una forza.
          </p>
        </section>

        <section className="dossier-panel analisi" aria-labelledby="previsione-title">
          <p className="dossier-kick">Previsione</p>
          <h2 id="previsione-title" className="sr-only-heading">Quattro frasi, nate dai numeri sotto</h2>
          <p className="dossier-verdict-lead">
            Che gara è attesa fra Atalanta e Bologna.
          </p>
          <ul className="analisi-voci">
            <li>
              <span>
                Il modello dà avanti l&apos;Atalanta al 58%, il pareggio al 23%, il Bologna al 19%.
                Non è una vittoria data per chiusa: è un favorito di casa che deve ancora
                farsi il match.
              </span>
            </li>
            <li>
              <span>
                I gol stanno nella media: 2,64 attesi in novanta minuti, fascia 2–3.
                L&apos;Atalanta ne porta 1,68 dal suo lato di casa, il Bologna 0,96 da fuori.
                Entrambe segnano nel 57% dei casi del modello.
              </span>
            </li>
            <li>
              <span>
                Il primo tempo è un&apos;altra gara, più stretta: 1,16 gol attesi prima
                dell&apos;intervallo. Over 0,5 1T al 69%, Over 1,5 1T al 32%. Chi cerca il gol
                dell&apos;intervallo lo cerca in una partita che ancora non si è aperta.
              </span>
            </li>
            <li>
              <span>
                L&apos;arbitro, sul metro di questa Serie A, è in linea: 4,1 gialli contro 4,2
                dei colleghi, su 11 gare nella competizione. Non sposta i cartellini e non
                gonfia i falli. Se la fonte non lo avesse ancora nominato, tre letture di
                gioco resterebbero senza il suo peso.
              </span>
            </li>
          </ul>
          <p className="dossier-src">
            Quattro frasi, tutte nate da numeri già in pagina. Non è un pronostico chiuso
            e non dice quanto mettere.
          </p>
        </section>

        <section className="dossier-panel" aria-labelledby="primo-tempo-title">
          <p className="dossier-kick">Primo tempo</p>
          <h2 id="primo-tempo-title" className="sr-only-heading">Mercati dei 45 minuti</h2>
          <p className="dossier-verdict-lead">
            Stessa griglia dei gol di fine gara, tagliata a 45&apos;. Non è un secondo modello.
          </p>
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Gol attesi in 45&apos;</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Atalanta</span>
                  <span className="engine-exp">0,74</span>
                  <span className="engine-dettaglio">fra 0 e 1 gol · lato casa</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Bologna</span>
                  <span className="engine-exp">0,42</span>
                  <span className="engine-dettaglio">fra 0 e 1 gol · lato trasferta</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Totale 1T</span>
                  <span className="engine-exp">1,16</span>
                  <span className="engine-dettaglio">44% dei 2,64 di fine gara</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Esito 1T</p>
              <ul className="engine-ladder" aria-label="1X2 primo tempo">
                <li className="engine-step is-central">
                  <span className="engine-step-line">1</span>
                  <span className="engine-step-prob">42%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">X</span>
                  <span className="engine-step-prob">38%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">2</span>
                  <span className="engine-step-prob">20%</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Linee 1T</p>
              <ul className="engine-ladder" aria-label="Over primo tempo">
                <li className="engine-step is-central">
                  <span className="engine-step-line">Over 0,5</span>
                  <span className="engine-step-prob">69%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">Over 1,5</span>
                  <span className="engine-step-prob">32%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">Gol casa 1T</span>
                  <span className="engine-step-prob">52%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">Gol ospite 1T</span>
                  <span className="engine-step-prob">34%</span>
                </li>
              </ul>
            </li>
          </ul>
          <p className="dossier-src">
            Le osservazioni non portano i gol attesi per tempo. Il 44% è la quota europea
            tipica dei gol prima dell&apos;intervallo — poco sotto la metà, perché il secondo
            tempo è più lungo di recupero. <b>Non è la quota misurata di questa gara</b>.
          </p>
        </section>

        <section className="dossier-panel" aria-labelledby="multigol-title">
          <p className="dossier-kick">Multigol</p>
          <h2 id="multigol-title" className="sr-only-heading">Intervalli dove si concentra la gara</h2>
          <p className="dossier-verdict-lead">
            Dove cade almeno metà dei casi. Non è «quanti gol faranno»: è la fascia più densa.
          </p>
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Gara intera</p>
              <ul className="engine-ladder" aria-label="Multigol gara">
                <li className="engine-step is-central"><span className="engine-step-line">2-3</span><span className="engine-step-prob">38%</span></li>
                <li className="engine-step"><span className="engine-step-line">1-3</span><span className="engine-step-prob">61%</span></li>
                <li className="engine-step"><span className="engine-step-line">2-4</span><span className="engine-step-prob">54%</span></li>
                <li className="engine-step"><span className="engine-step-line">1-2</span><span className="engine-step-prob">34%</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Atalanta, solo i suoi gol</p>
              <ul className="engine-ladder" aria-label="Multigol Atalanta">
                <li className="engine-step is-central"><span className="engine-step-line">1-2</span><span className="engine-step-prob">52%</span></li>
                <li className="engine-step"><span className="engine-step-line">0-2</span><span className="engine-step-prob">71%</span></li>
                <li className="engine-step"><span className="engine-step-line">1-3</span><span className="engine-step-prob">64%</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Bologna, solo i suoi gol</p>
              <ul className="engine-ladder" aria-label="Multigol Bologna">
                <li className="engine-step is-central"><span className="engine-step-line">0-1</span><span className="engine-step-prob">68%</span></li>
                <li className="engine-step"><span className="engine-step-line">0-2</span><span className="engine-step-prob">86%</span></li>
                <li className="engine-step"><span className="engine-step-line">1-2</span><span className="engine-step-prob">42%</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Primo tempo</p>
              <ul className="engine-ladder" aria-label="Multigol 1T">
                <li className="engine-step is-central"><span className="engine-step-line">0-1</span><span className="engine-step-prob">58%</span></li>
                <li className="engine-step"><span className="engine-step-line">1-2</span><span className="engine-step-prob">41%</span></li>
                <li className="engine-step"><span className="engine-step-line">0-2</span><span className="engine-step-prob">84%</span></li>
              </ul>
            </li>
          </ul>
          <p className="dossier-src">
            Casa e ospite sono i gol di quella squadra, non il totale. Un 1-2 dell&apos;Atalanta
            può stare dentro un 2-3 di partita.
          </p>
        </section>

        <section className="dossier-panel" aria-labelledby="value-title">
          <p className="dossier-kick">Modello contro prezzo</p>
          <h2 id="value-title" className="sr-only-heading">Dove il modello e la quota si separano</h2>
          <p className="dossier-verdict-lead">
            Un esito sopra la soglia di tre punti. Lo scarto è p × quota − 1.
          </p>
          <div className="market-table">
            <div className="market-head" aria-hidden="true">
              <span>Esito</span>
              <span>Modello</span>
              <span>Mercato</span>
              <span>Quota</span>
            </div>
            <div className="market-row">
              <span className="market-label">Atalanta</span>
              <span className="market-val">58%</span>
              <span className="market-val">53%</span>
              <span className="market-val market-odds">1,75</span>
            </div>
            <div className="market-row">
              <span className="market-label">Pareggio</span>
              <span className="market-val">23%</span>
              <span className="market-val">26%</span>
              <span className="market-val market-odds">3,60</span>
            </div>
            <div className="market-row">
              <span className="market-label">Bologna</span>
              <span className="market-val">19%</span>
              <span className="market-val">21%</span>
              <span className="market-val market-odds">4,40</span>
            </div>
          </div>
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Atalanta, lo scarto che conta</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Modello</span>
                  <span className="engine-exp">58%</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Quota consenso</span>
                  <span className="engine-exp">1,75</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Edge</span>
                  <span className="engine-exp">+2 pt</span>
                  <span className="engine-dettaglio">sotto la soglia di 3: si dichiara, non si grida</span>
                </li>
              </ul>
            </li>
          </ul>
          <p className="dossier-src">
            Quota di consenso su 14 operatori, riportata a somma cento. Nessun bookmaker
            viene nominato. Due punti non superano la soglia: il modello è un filo più
            ottimista sulla casa, e basta. Non è un invito a giocare.
          </p>
        </section>

        <section className="dossier-panel analisi" aria-labelledby="limiti-title">
          <p className="dossier-kick">Quello che questo laboratorio non dice</p>
          <h2 id="limiti-title" className="sr-only-heading">Limiti</h2>
          <ul className="analisi-voci analisi-limiti">
            <li>
              <span>
                I due attacchi sono trattati come indipendenti: regge sui totali, ma
                sottostima i pareggi bassi. Lo 0-0 e l&apos;1-1 vanno letti come un minimo.
              </span>
            </li>
            <li>
              <span>
                Il 44% del primo tempo è una quota europea, non la misura di Atalanta–Bologna.
                Quando avremo i gol per tempo nelle osservazioni, questa riga sparisce.
              </span>
            </li>
            <li>
              <span>
                I numeri di questa pagina sono un esempio fisso, scelto per farti vedere
                il capitolo. Non arrivano dal calendario live. Il sito in produzione
                resta https://iqstats-indol.vercel.app e non contiene questa pagina.
              </span>
            </li>
          </ul>
        </section>

        <p className="dossier-note">
          Laboratorio sul ramo laboratorio-dossier. Le probabilità sono letture di un
          modello, mai certezze; nessun consiglio finanziario.
        </p>
      </div>
    </ProductShell>
  );
}
