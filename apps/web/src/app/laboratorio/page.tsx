import type { Metadata } from "next";
import Link from "next/link";

import { DossierCapitoli, DossierCapitolo } from "@/components/dossier-capitoli";
import { ProductShell } from "@/components/product-shell";

export const metadata: Metadata = {
  title: "Laboratorio dossier",
  description: "Come si legge una gara prima del fischio, fuori dal sito in produzione.",
};

const CAPITOLI = [
  { id: "quadro", nome: "Quadro" },
  { id: "previsione", nome: "Previsione" },
  { id: "primo-tempo", nome: "1° tempo" },
  { id: "secondo-tempo", nome: "2° tempo" },
  { id: "over", nome: "Over" },
  { id: "tiri", nome: "Tiri" },
  { id: "multigol", nome: "Multigol" },
  { id: "mercati", nome: "Mercati" },
  { id: "arbitro", nome: "Arbitro" },
  { id: "trend", nome: "Trend" },
  { id: "quote", nome: "Quote" },
  { id: "value", nome: "Value" },
  { id: "consigli", nome: "Consigli" },
] as const;

export default function LaboratorioPage() {
  return (
    <ProductShell>
      <div className="oggi-backdrop" aria-hidden="true" />
      <div className="dossier">
        <Link className="dossier-back" href="/">
          ← Home
        </Link>

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
                <span className="oggi-crest">
                  <span className="oggi-crest-mono">AT</span>
                </span>
                <span className="oggi-team-name">Atalanta</span>
              </span>
              <span className="oggi-vs">contro</span>
              <span className="oggi-team oggi-team-away">
                <span className="oggi-team-name">Bologna</span>
                <span className="oggi-crest">
                  <span className="oggi-crest-mono">BO</span>
                </span>
              </span>
            </div>
          </div>
        </article>

        <DossierCapitoli capitoli={CAPITOLI} />

        <section className="dossier-panel contesto" aria-labelledby="quadro">
          <DossierCapitolo
            id="quadro"
            nome="Il quadro della gara"
            descrizione="Prima dei mercati: dove stanno i gol, in quale tempo, e chi deve farsi il match."
          />
          <p className="contesto-titolo">
            Casa che attacca, ospite che resiste. I gol stanno nella media. Il primo tempo
            è stretto. Il secondo tempo porta il resto. Il prezzo della vittoria di casa
            è un filo corto rispetto al modello.
          </p>
          <p className="contesto-favorito">Atalanta avanti, 58%</p>
          <p className="contesto-legenda">
            Attesi in questa gara, contro la media già osservata <b>dallo stesso lato del campo</b>.
          </p>
          <ul className="contesto-righe">
            <li className="contesto-riga">
              <span className="contesto-fam">Gol <em>· gara</em></span>
              <span className="contesto-atteso">2,64</span>
              <span className="contesto-metro">lega 2,58 · fascia 2–3</span>
            </li>
            <li className="contesto-riga">
              <span className="contesto-fam">Gol <em>· 1° tempo</em></span>
              <span className="contesto-atteso">1,16</span>
              <span className="contesto-metro">44% del totale</span>
            </li>
            <li className="contesto-riga">
              <span className="contesto-fam">Gol <em>· 2° tempo</em></span>
              <span className="contesto-atteso">1,48</span>
              <span className="contesto-metro">56% del totale · qui si apre</span>
            </li>
            <li className="contesto-riga">
              <span className="contesto-fam">Entrambe <em>· segnano</em></span>
              <span className="contesto-atteso">57%</span>
              <span className="contesto-metro is-sopra">sopra la metà</span>
            </li>
          </ul>
          <p className="contesto-riserva">
            Campione: 8 gare Atalanta casa, 7 Bologna fuori, 76 righe di Serie A.
            Sotto le dieci gare il numero resta ancorato alla media di lega. Segnale: medio.
          </p>
        </section>

        <section className="dossier-panel analisi" aria-labelledby="previsione">
          <DossierCapitolo
            id="previsione"
            nome="Previsione"
            descrizione="Quattro frasi nate dai numeri sotto. Non è un pronostico chiuso."
          />
          <p className="dossier-verdict-lead">Che gara è attesa fra Atalanta e Bologna.</p>
          <ol className="analisi-voci">
            <li>
              <span className="analisi-titoletto">Esito</span>{" "}
              <span>
                Atalanta 58%, pareggio 23%, Bologna 19%. Favorito di casa che deve ancora
                farsi il match. In 1T lo scarto si stringe (42-38-20).
              </span>
            </li>
            <li>
              <span className="analisi-titoletto">Gol</span>{" "}
              <span>
                2,64 attesi, fascia 2–3. Casa 1,68, ospite 0,96. Entrambe 57%.
                Over 2,5 al 51%: non è un match che si apre da solo.
              </span>
            </li>
            <li>
              <span className="analisi-titoletto">Tempi</span>{" "}
              <span>
                1T stretto (1,16). 2T più carico (1,48). Over 0,5 2T al 77%:
                se un gol arriva tardi, è il capitolo dove il modello lo mette.
              </span>
            </li>
            <li>
              <span className="analisi-titoletto">Tiri</span>{" "}
              <span>
                14,8 tiri attesi, 9,9 in porta. L'Atalanta porta il volume
                (8,9 / 6,1). Il Bologna fuori resta sotto la media di lato.
              </span>
            </li>
          </ol>
        </section>

        <section className="dossier-panel" aria-labelledby="primo-tempo">
          <DossierCapitolo
            id="primo-tempo"
            nome="Primo tempo"
            descrizione="Stessa griglia dei gol, tagliata a 45'. Quota europea 44%."
          />
          <p className="dossier-verdict-lead">1,16 gol attesi. Casa 0,74, ospite 0,42.</p>
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Gol attesi in 45'</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Atalanta</span>
                  <span className="engine-exp">0,74</span>
                  <span className="engine-dettaglio">44% di 1,68 · lato casa</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Bologna</span>
                  <span className="engine-exp">0,42</span>
                  <span className="engine-dettaglio">44% di 0,96 · lato fuori</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Totale 1T</span>
                  <span className="engine-exp">1,16</span>
                  <span className="engine-dettaglio">44% dei 2,64</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Frequenza gol 1T</p>
              <ul className="engine-ladder" aria-label="Distribuzione 1T">
                <li className="engine-step"><span className="engine-step-line">0</span><span className="engine-step-prob">31%</span></li>
                <li className="engine-step is-central"><span className="engine-step-line">1</span><span className="engine-step-prob">38%</span></li>
                <li className="engine-step"><span className="engine-step-line">2</span><span className="engine-step-prob">22%</span></li>
                <li className="engine-step"><span className="engine-step-line">3+</span><span className="engine-step-prob">9%</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Esito 1T</p>
              <ul className="engine-ladder" aria-label="1X2 1T">
                <li className="engine-step is-central"><span className="engine-step-line">1</span><span className="engine-step-prob">42%</span></li>
                <li className="engine-step"><span className="engine-step-line">X</span><span className="engine-step-prob">38%</span></li>
                <li className="engine-step"><span className="engine-step-line">2</span><span className="engine-step-prob">20%</span></li>
              </ul>
            </li>
          </ul>
          <p className="dossier-src">Il 44% è quota europea, non misura di questa coppia.</p>
        </section>

        <section className="dossier-panel" aria-labelledby="secondo-tempo">
          <DossierCapitolo
            id="secondo-tempo"
            nome="Secondo tempo"
            descrizione="Il resto della gara: 56% dei gol attesi. Stesso modello, altra metà."
          />
          <p className="dossier-verdict-lead">
            1,48 gol dopo l'intervallo. Qui il modello mette il peso, non nel primo tempo.
          </p>
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Gol attesi dal 46'</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Atalanta</span>
                  <span className="engine-exp">0,94</span>
                  <span className="engine-dettaglio">56% di 1,68</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Bologna</span>
                  <span className="engine-exp">0,54</span>
                  <span className="engine-dettaglio">56% di 0,96</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Totale 2T</span>
                  <span className="engine-exp">1,48</span>
                  <span className="engine-dettaglio">56% dei 2,64</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Frequenza gol 2T</p>
              <ul className="engine-ladder" aria-label="Distribuzione 2T">
                <li className="engine-step"><span className="engine-step-line">0</span><span className="engine-step-prob">23%</span></li>
                <li className="engine-step is-central"><span className="engine-step-line">1</span><span className="engine-step-prob">34%</span></li>
                <li className="engine-step"><span className="engine-step-line">2</span><span className="engine-step-prob">27%</span></li>
                <li className="engine-step"><span className="engine-step-line">3+</span><span className="engine-step-prob">16%</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Linee 2T</p>
              <ul className="engine-ladder" aria-label="Over 2T">
                <li className="engine-step is-central"><span className="engine-step-line">Over 0,5</span><span className="engine-step-prob">77%</span></li>
                <li className="engine-step"><span className="engine-step-line">Over 1,5</span><span className="engine-step-prob">43%</span></li>
                <li className="engine-step"><span className="engine-step-line">Gol casa 2T</span><span className="engine-step-prob">61%</span></li>
                <li className="engine-step"><span className="engine-step-line">Gol ospite 2T</span><span className="engine-step-prob">42%</span></li>
              </ul>
            </li>
          </ul>
          <p className="dossier-src">
            Il 56% è il complemento del 44% europeo. Il secondo tempo è più lungo di recupero:
            non è «più spettacolo», è più minuti.
          </p>
        </section>

        <section className="dossier-panel" aria-labelledby="over">
          <DossierCapitolo
            id="over"
            nome="Over e under"
            descrizione="Scale di fine gara, primo tempo, secondo tempo. Trend ultime 5 sullo stesso lato."
          />
          <p className="dossier-verdict-lead">
            Over 2,5 di fine gara è un coin flip. Over 0,5 del secondo tempo no.
          </p>
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Fine gara</p>
              <ul className="engine-ladder" aria-label="Over 90">
                <li className="engine-step"><span className="engine-step-line">Over 0,5</span><span className="engine-step-prob">93%</span></li>
                <li className="engine-step"><span className="engine-step-line">Over 1,5</span><span className="engine-step-prob">74%</span></li>
                <li className="engine-step is-central"><span className="engine-step-line">Over 2,5</span><span className="engine-step-prob">51%</span></li>
                <li className="engine-step"><span className="engine-step-line">Over 3,5</span><span className="engine-step-prob">28%</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Primo tempo</p>
              <ul className="engine-ladder" aria-label="Over 1T">
                <li className="engine-step is-central"><span className="engine-step-line">Over 0,5</span><span className="engine-step-prob">69%</span></li>
                <li className="engine-step"><span className="engine-step-line">Over 1,5</span><span className="engine-step-prob">32%</span></li>
                <li className="engine-step"><span className="engine-step-line">Under 1,5</span><span className="engine-step-prob">68%</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Secondo tempo</p>
              <ul className="engine-ladder" aria-label="Over 2T">
                <li className="engine-step is-central"><span className="engine-step-line">Over 0,5</span><span className="engine-step-prob">77%</span></li>
                <li className="engine-step"><span className="engine-step-line">Over 1,5</span><span className="engine-step-prob">43%</span></li>
                <li className="engine-step"><span className="engine-step-line">Under 1,5</span><span className="engine-step-prob">57%</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Trend over 2,5 · ultime 5 stesso lato</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Atalanta casa</span>
                  <span className="engine-exp">3/5</span>
                  <span className="engine-dettaglio">stagione casa 52%</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Bologna fuori</span>
                  <span className="engine-exp">2/5</span>
                  <span className="engine-dettaglio">stagione fuori 46%</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Incrocio</span>
                  <span className="engine-exp">medio</span>
                  <span className="engine-dettaglio">non tira da solo l'over 2,5</span>
                </li>
              </ul>
            </li>
          </ul>
          <p className="dossier-src">
            Il trend recente è un correttivo. Tre su cinque in casa non battono la media di stagione.
          </p>
        </section>

        <section className="dossier-panel" aria-labelledby="tiri">
          <DossierCapitolo
            id="tiri"
            nome="Tiri e tiri in porta"
            descrizione="Volume e qualità. Due mercati diversi, stessa gara."
          />
          <p className="dossier-verdict-lead">
            L'Atalanta porta i tiri. Il Bologna fuori ne concede, e ne tira pochi.
          </p>
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Tiri totali</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Atalanta</span>
                  <span className="engine-exp">8,9</span>
                  <span className="engine-dettaglio">lega casa 7,4 · sopra</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Bologna</span>
                  <span className="engine-exp">5,9</span>
                  <span className="engine-dettaglio">lega fuori 6,4 · sotto</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Totale</span>
                  <span className="engine-exp">14,8</span>
                  <span className="engine-dettaglio">over 13,5 al 58%</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Tiri in porta</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Atalanta</span>
                  <span className="engine-exp">6,1</span>
                  <span className="engine-dettaglio">lega casa 5,2 · segnale medio</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Bologna</span>
                  <span className="engine-exp">3,8</span>
                  <span className="engine-dettaglio">lega fuori 4,1</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Totale</span>
                  <span className="engine-exp">9,9</span>
                  <span className="engine-dettaglio">over 9,5 al 54% · over 8,5 al 63%</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Conversione attesa</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Casa, gol / tiri in porta</span>
                  <span className="engine-exp">28%</span>
                  <span className="engine-dettaglio">1,68 su 6,1</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Ospite</span>
                  <span className="engine-exp">25%</span>
                  <span className="engine-dettaglio">0,96 su 3,8</span>
                </li>
              </ul>
            </li>
          </ul>
          <p className="dossier-src">
            Tiri e tiri in porta arrivano dagli artefatti del motore già in cache, non da una
            chiamata nuova. Over sulle linee è Poisson sul totale atteso.
          </p>
        </section>

        <section className="dossier-panel" aria-labelledby="multigol">
          <DossierCapitolo
            id="multigol"
            nome="Multigol"
            descrizione="Intervalli dove cade almeno metà dei casi."
          />
          <p className="dossier-verdict-lead">Gara 2–3. Casa 1–2. Ospite 0–1. 1T 0–1. 2T 0–2.</p>
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Gara</p>
              <ul className="engine-ladder" aria-label="Multigol gara">
                <li className="engine-step is-central"><span className="engine-step-line">2-3</span><span className="engine-step-prob">38%</span></li>
                <li className="engine-step"><span className="engine-step-line">1-3</span><span className="engine-step-prob">61%</span></li>
                <li className="engine-step"><span className="engine-step-line">2-4</span><span className="engine-step-prob">54%</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Atalanta</p>
              <ul className="engine-ladder" aria-label="Multigol AT">
                <li className="engine-step is-central"><span className="engine-step-line">1-2</span><span className="engine-step-prob">52%</span></li>
                <li className="engine-step"><span className="engine-step-line">0-2</span><span className="engine-step-prob">71%</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Bologna</p>
              <ul className="engine-ladder" aria-label="Multigol BO">
                <li className="engine-step is-central"><span className="engine-step-line">0-1</span><span className="engine-step-prob">68%</span></li>
                <li className="engine-step"><span className="engine-step-line">0-2</span><span className="engine-step-prob">86%</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Secondo tempo</p>
              <ul className="engine-ladder" aria-label="Multigol 2T">
                <li className="engine-step is-central"><span className="engine-step-line">0-2</span><span className="engine-step-prob">84%</span></li>
                <li className="engine-step"><span className="engine-step-line">1-2</span><span className="engine-step-prob">61%</span></li>
              </ul>
            </li>
          </ul>
        </section>

        <section className="dossier-panel" aria-labelledby="mercati">
          <DossierCapitolo
            id="mercati"
            nome="Altri mercati"
            descrizione="Corner, falli, cartellini. Atteso contro media di lato."
          />
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Corner</p>
              <ul className="engine-splits">
                <li className="engine-split"><span className="engine-who">Atalanta</span><span className="engine-exp">6,4</span></li>
                <li className="engine-split"><span className="engine-who">Bologna</span><span className="engine-exp">3,9</span></li>
                <li className="engine-split"><span className="engine-who">Totale</span><span className="engine-exp">10,3</span><span className="engine-dettaglio">over 9,5 al 56%</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Falli</p>
              <ul className="engine-splits">
                <li className="engine-split"><span className="engine-who">Atalanta</span><span className="engine-exp">12,1</span></li>
                <li className="engine-split"><span className="engine-who">Bologna</span><span className="engine-exp">13,4</span></li>
                <li className="engine-split"><span className="engine-who">Totale</span><span className="engine-exp">25,5</span><span className="engine-dettaglio">lega 24,8</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Gialli</p>
              <ul className="engine-splits">
                <li className="engine-split"><span className="engine-who">Atalanta</span><span className="engine-exp">1,8</span></li>
                <li className="engine-split"><span className="engine-who">Bologna</span><span className="engine-exp">2,3</span></li>
                <li className="engine-split"><span className="engine-who">Totale</span><span className="engine-exp">4,1</span><span className="engine-dettaglio">over 4,5 al 41%</span></li>
              </ul>
            </li>
          </ul>
        </section>

        <section className="dossier-panel" aria-labelledby="arbitro">
          <DossierCapitolo
            id="arbitro"
            nome="Arbitro"
            descrizione="Media dell'uomo in mezzo contro i colleghi della stessa Serie A."
          />
          <p className="dossier-verdict-lead">In linea. Non sposta i cartellini.</p>
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">11 gare in questa competizione</p>
              <ul className="engine-splits">
                <li className="engine-split"><span className="engine-who">Gialli / gara</span><span className="engine-exp">4,1</span><span className="engine-dettaglio">colleghi 4,2</span></li>
                <li className="engine-split"><span className="engine-who">Falli / gara</span><span className="engine-exp">24,9</span><span className="engine-dettaglio">colleghi 24,8</span></li>
                <li className="engine-split"><span className="engine-who">Rigori</span><span className="engine-exp">0,18</span><span className="engine-dettaglio">campione piccolo</span></li>
              </ul>
            </li>
          </ul>
        </section>

        <section className="dossier-panel" aria-labelledby="trend">
          <DossierCapitolo
            id="trend"
            nome="Trend recenti"
            descrizione="Ultime cinque dallo stesso lato."
          />
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Atalanta, ultime 5 in casa</p>
              <ul className="engine-splits">
                <li className="engine-split"><span className="engine-who">Gol fatti</span><span className="engine-exp">1,8</span><span className="engine-dettaglio">stagione 1,68</span></li>
                <li className="engine-split"><span className="engine-who">Tiri in porta</span><span className="engine-exp">6,4</span></li>
                <li className="engine-split"><span className="engine-who">Over 2,5</span><span className="engine-exp">3/5</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Bologna, ultime 5 fuori</p>
              <ul className="engine-splits">
                <li className="engine-split"><span className="engine-who">Gol fatti</span><span className="engine-exp">0,8</span><span className="engine-dettaglio">stagione 0,96</span></li>
                <li className="engine-split"><span className="engine-who">Tiri in porta</span><span className="engine-exp">3,5</span></li>
                <li className="engine-split"><span className="engine-who">Over 2,5</span><span className="engine-exp">2/5</span></li>
              </ul>
            </li>
          </ul>
        </section>

        <section className="dossier-panel" aria-labelledby="quote">
          <DossierCapitolo
            id="quote"
            nome="Quote a confronto"
            descrizione="Consenso su 14 operatori, somma cento. Nessun bookmaker nominato."
          />
          <div className="market-table">
            <div className="market-head" aria-hidden="true">
              <span>Esito</span><span>Modello</span><span>Mercato</span><span>Quota</span>
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
          <p className="dossier-verdict-lead" style={{ marginTop: "1.25rem" }}>Primo tempo</p>
          <div className="market-table">
            <div className="market-head" aria-hidden="true">
              <span>1T</span><span>Modello</span><span>Mercato</span><span>Quota</span>
            </div>
            <div className="market-row">
              <span className="market-label">1 · 1T</span>
              <span className="market-val">42%</span>
              <span className="market-val">40%</span>
              <span className="market-val market-odds">2,35</span>
            </div>
            <div className="market-row">
              <span className="market-label">X · 1T</span>
              <span className="market-val">38%</span>
              <span className="market-val">41%</span>
              <span className="market-val market-odds">2,30</span>
            </div>
            <div className="market-row">
              <span className="market-label">2 · 1T</span>
              <span className="market-val">20%</span>
              <span className="market-val">19%</span>
              <span className="market-val market-odds">4,80</span>
            </div>
          </div>
        </section>

        <section className="dossier-panel" aria-labelledby="value">
          <DossierCapitolo
            id="value"
            nome="Modello contro prezzo"
            descrizione="Edge = probabilità × quota − 1. Soglia: tre punti."
          />
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Atalanta 90'</p>
              <ul className="engine-splits">
                <li className="engine-split"><span className="engine-who">Modello</span><span className="engine-exp">58%</span></li>
                <li className="engine-split"><span className="engine-who">Quota</span><span className="engine-exp">1,75</span></li>
                <li className="engine-split"><span className="engine-who">Edge</span><span className="engine-exp">+1,5 pt</span><span className="engine-dettaglio">sotto soglia</span></li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Over 0,5 2T</p>
              <ul className="engine-splits">
                <li className="engine-split"><span className="engine-who">Modello</span><span className="engine-exp">77%</span></li>
                <li className="engine-split"><span className="engine-who">Quota</span><span className="engine-exp">1,28</span></li>
                <li className="engine-split"><span className="engine-who">Edge</span><span className="engine-exp">−1 pt</span><span className="engine-dettaglio">il mercato è già lì</span></li>
              </ul>
            </li>
          </ul>
        </section>

        <section className="dossier-panel analisi" aria-labelledby="consigli">
          <DossierCapitolo
            id="consigli"
            nome="Lettura finale"
            descrizione="Cosa tiene, cosa non tiene. Non è una schedina e non dice quanto mettere."
          />
          <p className="dossier-verdict-lead">Tre cose che questa gara sostiene. Due che non sostiene.</p>
          <ol className="analisi-voci">
            <li>
              <span className="analisi-titoletto">Tiene · Atalanta 1-2 gol</span>{" "}
              <span>
                52% sul solo attacco di casa. È la fascia più densa dei suoi gol,
                non del totale. Segnale medio, campione di 8 gare in casa.
              </span>
            </li>
            <li>
              <span className="analisi-titoletto">Tiene · Over 0,5 secondo tempo</span>{" "}
              <span>
                77% dal modello. Il peso dei gol sta dopo l'intervallo, non prima.
                Il mercato lo sa già (edge negativo): è una lettura di gioco, non un value.
              </span>
            </li>
            <li>
              <span className="analisi-titoletto">Tiene · tiri in porta casa sopra 5,5</span>{" "}
              <span>
                6,1 attesi contro 5,2 di lega sullo stesso lato. È il volume, non il gol.
                Se cerchi un mercato di tiro, è questo il lato, non il Bologna fuori.
              </span>
            </li>
            <li>
              <span className="analisi-titoletto">Non tiene · Over 3,5 gara</span>{" "}
              <span>
                28%. La fascia densa è 2–3. Chi forza il match aperto lo fa contro il modello.
              </span>
            </li>
            <li>
              <span className="analisi-titoletto">Non tiene · Bologna a vincere</span>{" "}
              <span>
                19% a 90', 20% in 1T. L'ospite resiste, non ribalta. Multigol ospite 0-1 al 68%.
              </span>
            </li>
          </ol>
          <p className="dossier-src">
            Lettura, non consiglio finanziario. Nessuna quota è un invito a giocare.
          </p>
        </section>

        <section className="dossier-panel analisi" aria-labelledby="limiti">
          <p className="dossier-kick">Quello che questo laboratorio non dice</p>
          <h2 id="limiti" className="sr-only-heading">Limiti</h2>
          <ul className="analisi-voci analisi-limiti">
            <li>
              <span>
                I due attacchi sono indipendenti: regge sui totali, sottostima i pareggi bassi.
              </span>
            </li>
            <li>
              <span>
                44% / 56% sui tempi è quota europea, non la misura di Atalanta–Bologna.
              </span>
            </li>
            <li>
              <span>
                Pagina di esempio fisso. Produzione intatta: https://iqstats-indol.vercel.app
              </span>
            </li>
          </ul>
        </section>

        <p className="dossier-note">
          Laboratorio sul ramo laboratorio-dossier. Probabilità, non certezze.
        </p>
      </div>
    </ProductShell>
  );
}
