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
  { id: "primo-tempo", nome: "Primo tempo" },
  { id: "multigol", nome: "Multigol" },
  { id: "mercati", nome: "Mercati" },
  { id: "arbitro", nome: "Arbitro" },
  { id: "trend", nome: "Trend" },
  { id: "quote", nome: "Quote" },
  { id: "value", nome: "Value" },
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
            descrizione="Tre numeri prima dei mercati: totale, primo tempo, entrambe. Ancorati alla media dello stesso lato."
          />
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
              <span className="contesto-fam">
                Gol <em>· gara</em>
              </span>
              <span className="contesto-atteso">2,64</span>
              <span className="contesto-metro">media del campionato 2,58</span>
            </li>
            <li className="contesto-riga">
              <span className="contesto-fam">
                Gol <em>· primo tempo</em>
              </span>
              <span className="contesto-atteso">1,16</span>
              <span className="contesto-metro">44% del totale, quota europea dichiarata</span>
            </li>
            <li className="contesto-riga">
              <span className="contesto-fam">
                Entrambe <em>· segnano</em>
              </span>
              <span className="contesto-atteso">57%</span>
              <span className="contesto-metro is-sopra">sopra la metà dei casi</span>
            </li>
          </ul>
          <p className="contesto-riserva">
            Campione: 8 gare di Atalanta in casa, 7 di Bologna fuori, 76 righe di Serie A.
            Sotto le dieci gare il numero resta ancorato alla media di lega: una sola
            serata fuori scala non diventa una forza. Segnale: medio.
          </p>
        </section>

        <section className="dossier-panel analisi" aria-labelledby="previsione">
          <DossierCapitolo
            id="previsione"
            nome="Previsione"
            descrizione="Quattro frasi nate dai numeri sotto. Non è un pronostico chiuso e non dice quanto mettere."
          />
          <p className="dossier-verdict-lead">Che gara è attesa fra Atalanta e Bologna.</p>
          <ol className="analisi-voci">
            <li>
              <span className="analisi-titoletto">Esito</span>{" "}
              <span>
                Il modello dà avanti l'Atalanta al 58%, il pareggio al 23%, il Bologna al 19%.
                Non è una vittoria data per chiusa: è un favorito di casa che deve ancora
                farsi il match. In 1T lo scarto si stringe (42-38-20): i primi 45 minuti
                non decidono da soli.
              </span>
            </li>
            <li>
              <span className="analisi-titoletto">Gol</span>{" "}
              <span>
                I gol stanno nella media: 2,64 attesi in novanta minuti, fascia 2–3.
                L'Atalanta ne porta 1,68 dal suo lato di casa, il Bologna 0,96 da fuori.
                Entrambe segnano nel 57% dei casi del modello. Over 2,5 al 51%:
                non è un match che si apre da solo.
              </span>
            </li>
            <li>
              <span className="analisi-titoletto">Primo tempo</span>{" "}
              <span>
                Il primo tempo è un'altra gara, più stretta: 1,16 gol attesi prima
                dell'intervallo (44% del totale). Over 0,5 1T al 69%, Over 1,5 1T al 32%.
                Frequenza 0 gol 1T 31%, 1 gol 38%, 2+ 31%. Chi cerca il gol
                dell'intervallo lo cerca in una partita che ancora non si è aperta.
              </span>
            </li>
            <li>
              <span className="analisi-titoletto">Arbitro</span>{" "}
              <span>
                L'arbitro, sul metro di questa Serie A, è in linea: 4,1 gialli contro 4,2
                dei colleghi, su 11 gare nella competizione. Non sposta i cartellini e non
                gonfia i falli. Se la fonte non lo avesse ancora nominato, tre letture di
                gioco resterebbero senza il suo peso.
              </span>
            </li>
          </ol>
          <p className="dossier-src">
            Quattro frasi, tutte nate da numeri già in pagina. Non è un pronostico chiuso.
          </p>
        </section>

        <section className="dossier-panel" aria-labelledby="primo-tempo">
          <DossierCapitolo
            id="primo-tempo"
            nome="Primo tempo"
            descrizione="Stessa griglia dei gol di fine gara, tagliata a 45'. Quota europea 44%, non misura di questa coppia."
          />
          <p className="dossier-verdict-lead">
            1,16 gol attesi prima dell'intervallo. Casa 0,74, ospite 0,42.
          </p>
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Gol attesi in 45'</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Atalanta</span>
                  <span className="engine-exp">0,74</span>
                  <span className="engine-dettaglio">fra 0 e 1 gol · lato casa · 44% di 1,68</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Bologna</span>
                  <span className="engine-exp">0,42</span>
                  <span className="engine-dettaglio">fra 0 e 1 gol · lato trasferta · 44% di 0,96</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Totale 1T</span>
                  <span className="engine-exp">1,16</span>
                  <span className="engine-dettaglio">44% dei 2,64 di fine gara</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Frequenza gol 1T</p>
              <ul className="engine-ladder" aria-label="Distribuzione gol primo tempo">
                <li className="engine-step">
                  <span className="engine-step-line">0 gol</span>
                  <span className="engine-step-prob">31%</span>
                </li>
                <li className="engine-step is-central">
                  <span className="engine-step-line">1 gol</span>
                  <span className="engine-step-prob">38%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">2 gol</span>
                  <span className="engine-step-prob">22%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">3+</span>
                  <span className="engine-step-prob">9%</span>
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
            tipica dei gol prima dell'intervallo — poco sotto la metà, perché il secondo
            tempo è più lungo di recupero. <b>Non è la quota misurata di questa gara</b>.
          </p>
        </section>

        <section className="dossier-panel" aria-labelledby="multigol">
          <DossierCapitolo
            id="multigol"
            nome="Multigol"
            descrizione="Intervalli dove cade almeno metà dei casi. Gara, squadra, primo tempo."
          />
          <p className="dossier-verdict-lead">
            Fascia più densa di gara: 2–3. Casa 1–2. Ospite 0–1. Primo tempo 0–1.
          </p>
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Gara intera</p>
              <ul className="engine-ladder" aria-label="Multigol gara">
                <li className="engine-step is-central">
                  <span className="engine-step-line">2-3</span>
                  <span className="engine-step-prob">38%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">1-3</span>
                  <span className="engine-step-prob">61%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">2-4</span>
                  <span className="engine-step-prob">54%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">1-2</span>
                  <span className="engine-step-prob">34%</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Atalanta, solo i suoi gol</p>
              <ul className="engine-ladder" aria-label="Multigol Atalanta">
                <li className="engine-step is-central">
                  <span className="engine-step-line">1-2</span>
                  <span className="engine-step-prob">52%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">0-2</span>
                  <span className="engine-step-prob">71%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">1-3</span>
                  <span className="engine-step-prob">64%</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Bologna, solo i suoi gol</p>
              <ul className="engine-ladder" aria-label="Multigol Bologna">
                <li className="engine-step is-central">
                  <span className="engine-step-line">0-1</span>
                  <span className="engine-step-prob">68%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">0-2</span>
                  <span className="engine-step-prob">86%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">1-2</span>
                  <span className="engine-step-prob">42%</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Primo tempo</p>
              <ul className="engine-ladder" aria-label="Multigol 1T">
                <li className="engine-step is-central">
                  <span className="engine-step-line">0-1</span>
                  <span className="engine-step-prob">58%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">1-2</span>
                  <span className="engine-step-prob">41%</span>
                </li>
                <li className="engine-step">
                  <span className="engine-step-line">0-2</span>
                  <span className="engine-step-prob">84%</span>
                </li>
              </ul>
            </li>
          </ul>
          <p className="dossier-src">
            Casa e ospite sono i gol di quella squadra, non il totale. Un 1-2 dell'Atalanta
            può stare dentro un 2-3 di partita.
          </p>
        </section>

        <section className="dossier-panel" aria-labelledby="mercati">
          <DossierCapitolo
            id="mercati"
            nome="Mercati statistici"
            descrizione="Tiri, corner, falli, cartellini. Atteso di gara contro media di lega sullo stesso lato."
          />
          <p className="dossier-verdict-lead">
            Tiri sopra la media, corner in linea, cartellini senza rumore.
          </p>
          <ul className="engine-rows">
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
                  <span className="engine-dettaglio">lega fuori 4,1 · in linea</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Totale</span>
                  <span className="engine-exp">9,9</span>
                  <span className="engine-dettaglio">lega 9,3</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Corner</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Atalanta</span>
                  <span className="engine-exp">6,4</span>
                  <span className="engine-dettaglio">lega casa 5,8</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Bologna</span>
                  <span className="engine-exp">3,9</span>
                  <span className="engine-dettaglio">lega fuori 4,2</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Totale</span>
                  <span className="engine-exp">10,3</span>
                  <span className="engine-dettaglio">over 9,5 al 56%</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Falli</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Atalanta</span>
                  <span className="engine-exp">12,1</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Bologna</span>
                  <span className="engine-exp">13,4</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Totale</span>
                  <span className="engine-exp">25,5</span>
                  <span className="engine-dettaglio">lega 24,8 · in linea</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Cartellini gialli</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Atalanta</span>
                  <span className="engine-exp">1,8</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Bologna</span>
                  <span className="engine-exp">2,3</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Totale</span>
                  <span className="engine-exp">4,1</span>
                  <span className="engine-dettaglio">lega 4,2 · over 4,5 al 41%</span>
                </li>
              </ul>
            </li>
          </ul>
          <p className="dossier-src">
            Interazione squadra × avversario × lato, poi ancora alla media di lega se il
            campione è sotto le dieci gare. Nessuna chiamata extra all'API: snapshot già in cache.
          </p>
        </section>

        <section className="dossier-panel" aria-labelledby="arbitro">
          <DossierCapitolo
            id="arbitro"
            nome="Arbitro"
            descrizione="Media dell'uomo in mezzo contro i colleghi della stessa Serie A."
          />
          <p className="dossier-verdict-lead">In linea. Non sposta i mercati dei cartellini.</p>
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">11 gare in questa competizione</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Gialli / gara</span>
                  <span className="engine-exp">4,1</span>
                  <span className="engine-dettaglio">colleghi 4,2</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Falli / gara</span>
                  <span className="engine-exp">24,9</span>
                  <span className="engine-dettaglio">colleghi 24,8</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Rigori</span>
                  <span className="engine-exp">0,18</span>
                  <span className="engine-dettaglio">colleghi 0,22 · campione piccolo</span>
                </li>
              </ul>
            </li>
          </ul>
          <p className="dossier-src">
            Senza designazione queste tre righe spariscono. Non si inventa un nome.
          </p>
        </section>

        <section className="dossier-panel" aria-labelledby="trend">
          <DossierCapitolo
            id="trend"
            nome="Trend recenti"
            descrizione="Ultime cinque dallo stesso lato. Una serie corta non batte la media di stagione."
          />
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Atalanta, ultime 5 in casa</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Gol fatti</span>
                  <span className="engine-exp">1,8</span>
                  <span className="engine-dettaglio">stagione casa 1,68</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Gol subiti</span>
                  <span className="engine-exp">0,8</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Over 2,5</span>
                  <span className="engine-exp">3/5</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Bologna, ultime 5 fuori</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Gol fatti</span>
                  <span className="engine-exp">0,8</span>
                  <span className="engine-dettaglio">stagione fuori 0,96</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Gol subiti</span>
                  <span className="engine-exp">1,4</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Over 2,5</span>
                  <span className="engine-exp">2/5</span>
                </li>
              </ul>
            </li>
          </ul>
          <p className="dossier-src">
            Il trend recente è un correttivo, non un secondo modello. Se diverge dalla
            stagione resta dichiarato, non assorbito.
          </p>
        </section>

        <section className="dossier-panel" aria-labelledby="quote">
          <DossierCapitolo
            id="quote"
            nome="Quote a confronto"
            descrizione="Consenso su 14 operatori, riportato a somma cento. Nessun bookmaker nominato."
          />
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
          <p className="dossier-verdict-lead" style={{ marginTop: "1.25rem" }}>
            Stesso confronto sul primo tempo.
          </p>
          <div className="market-table">
            <div className="market-head" aria-hidden="true">
              <span>1T</span>
              <span>Modello</span>
              <span>Mercato</span>
              <span>Quota</span>
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
          <p className="dossier-src">Quote di consenso, non il miglior prezzo.</p>
        </section>

        <section className="dossier-panel" aria-labelledby="value">
          <DossierCapitolo
            id="value"
            nome="Modello contro prezzo"
            descrizione="Edge = probabilità × quota − 1. Soglia dichiarata: tre punti."
          />
          <p className="dossier-verdict-lead">
            Un esito vicino alla soglia. Lo scarto si dichiara, non si grida.
          </p>
          <ul className="engine-rows">
            <li className="engine-row">
              <p className="engine-metric">Atalanta 90'</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Modello</span>
                  <span className="engine-exp">58%</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Quota</span>
                  <span className="engine-exp">1,75</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Edge</span>
                  <span className="engine-exp">+1,5 pt</span>
                  <span className="engine-dettaglio">sotto 3: si vede, non si gioca da qui</span>
                </li>
              </ul>
            </li>
            <li className="engine-row">
              <p className="engine-metric">Over 0,5 1T</p>
              <ul className="engine-splits">
                <li className="engine-split">
                  <span className="engine-who">Modello</span>
                  <span className="engine-exp">69%</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Quota</span>
                  <span className="engine-exp">1,42</span>
                </li>
                <li className="engine-split">
                  <span className="engine-who">Edge</span>
                  <span className="engine-exp">−2 pt</span>
                  <span className="engine-dettaglio">il mercato è già lì</span>
                </li>
              </ul>
            </li>
          </ul>
          <p className="dossier-src">
            Due punti non superano la soglia. Il modello è un filo più ottimista sulla casa,
            e basta. Non è un invito a giocare.
          </p>
        </section>

        <section className="dossier-panel analisi" aria-labelledby="limiti">
          <p className="dossier-kick">Quello che questo laboratorio non dice</p>
          <h2 id="limiti" className="sr-only-heading">
            Limiti
          </h2>
          <ul className="analisi-voci analisi-limiti">
            <li>
              <span>
                I due attacchi sono trattati come indipendenti: regge sui totali, ma
                sottostima i pareggi bassi. Lo 0-0 e l'1-1 vanno letti come un minimo.
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
