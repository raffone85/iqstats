# PowerStats — seconda ricognizione, 4 settembre 2026 (solo calcio)

Complemento di `ricognizione-powerstats-e-biofootballbet.md` (29 agosto). Quella descriveva
il perimetro visibile allora; questa entra dove la prima si era fermata — Statistiche in
tutte le sue sezioni, Confronto, Classifiche, scheda squadra, scheda giocatore, scheda
arbitro — e registra **struttura, comportamento e difetti misurati**.

**Regola che vale su tutto il documento** (`AGENTS.md`): PowerStats è ispirazione
funzionale. Qui non si copiano testi, etichette, colori, marchi, asset né formule. Le frasi
fra virgolette identificano un elemento, non sono materiale da riusare.

**Sessione**: account dell'utente, **piano gratuito**. Solo calcio, come chiesto.

---

## 1. Che cosa non ho potuto vedere, e perché

- **Le otto schede degli Expected**: `?view=gol` e sorelle rispondono «Serve il piano PRO».
  L'unica vista libera è `view=centro`, che su due gare di ieri provate dice «Referto
  dettagliato non ancora disponibile per questa partita».
- **La Verifica** di una gara finita: chiede un token, e il conto era a zero — «Il prossimo
  token gratis arriva tra 1g 00:11:23».
- **La schedina generata**: il Generatore chiede 1 token e ne restava 1. **Non l'ho speso**:
  è una risorsa dell'utente e la decisione è sua.
- **L'assistente AI**: il pannello si apre e si richiude subito, resta una pagina vuota.

Tutto il resto è stato navigato.

---

## 2. Struttura vera della navigazione

Tre livelli, non uno:

1. **Sport** in cima: calcio, tennis, basket, fantacalcio.
2. **Barra fissa in basso**, quattro destinazioni: Statistiche · Expected · Generatore ·
   Classifiche.
3. Dentro Statistiche, **quattro sezioni** con la loro barra: **Squadre · Giocatori ·
   Arbitri · Calendario**, e sotto ciascuna **fino a quattro sotto-schede**.

La ricognizione di agosto leggeva nove voci in fila; sono invece 4 sezioni × sotto-schede:

| Sezione | Sotto-schede |
| --- | --- |
| Squadre | Cerca · Confronto · Classifiche · Preferiti |
| Giocatori | Cerca · Confronto · Classifiche · Preferiti |
| Arbitri | Cerca · Classifiche · Preferiti (niente Confronto) |
| Calendario | Per giornata · Per squadra · Preferiti |

In cima a tutta la sezione, un **selettore lega + stagione** («Serie A · 2026-27») che
cambia il contesto di tutte e quattro.

**Indirizzi**: `/calcio?section=squadre|giocatori|arbitri|calendario`, `/?section=generatore`,
`/expected?league=…&fixtureId=…&view=…&date=…`. La finestra sta nell'URL, non in uno stato
nascosto: lo stesso principio adottato per il nostro selettore di stagione.

**Fonte dati**: i loghi arrivano da `cdn.sportmonks.com`, quindi il provider è SportMonks.

### 2.1 Dashboard

Toggle **Calendario / Campionati**. Il calendario ha navigazione giorno per giorno con
«Scegli una data», ricerca squadra, filtri Tutte · Live · Da giocare · Finite, e le gare
raggruppate per campionato. La riga cambia faccia con lo stato: lucchetto se l'Expected è
bloccato, `LIVE` con punteggio in corso, `FT` con punteggio e pulsante **Verifica** se
finita. Accanto al nome della lega può comparire un triangolo di avviso: copertura limitata.

**Campionati** elenca **40 competizioni raggruppate per paese** con la bandiera, incluse le
tre coppe europee e le due sudamericane. Aprendo una lega si ottiene il calendario **per
giornata** (‹ Giornata 3 ›) con le gare raggruppate per giorno.

---

## 3. Scheda squadra — la parte più densa

Tre blocchi, in quest'ordine:

**Stato di forma · ultime 5**, su tre righe: **Totale, Casa, Trasferta**. Ogni gara è lo
stemma dell'avversario con un pastiglia V/N/P sopra. Nessun numero: solo il verso.

**Medie a partita**, quattro famiglie a scomparsa e **23 metriche**, ognuna disegnata come
una **barra bicolore** con il valore di casa a sinistra, quello di trasferta a destra e la
**media al centro sotto**:

| Famiglia | Metriche |
| --- | --- |
| Attacco (8) | Gol Fatti, Tiri Totali, Tiri in Porta, Tiri in Area, Tiri Fuori Area, Attacchi Pericolosi, Attacchi, Grandi Occasioni |
| Possesso & Passaggi (3) | Possesso Palla, Passaggi Chiave, Corner Fatti |
| Difesa (7) | Gol Subiti, Tiri Totali Subiti, Tiri in Porta Subiti, Tiri in Area Subiti, Tiri Fuori Area Subiti, Corner Subiti, Parate |
| Disciplina (5) | Cartellini, Falli Fatti, Falli Subiti, Fuorigioco a Favore, Fuorigioco Contro |

Una **freccia ↓** accanto alla metrica segnala quelle dove meno è meglio. È un'idea buona e
costa una riga.

**Storico partite**: filtro Tutte · Casa · Trasferta, un selettore **«Mostra»** che sceglie
quale metrica affiancare al risultato, e le gare con giornata, avversario e punteggio.

---

## 4. Confronto fra due squadre — e l'analisi generata

Due selettori, CASA e TRASFERTA, ciascuno con ricerca. Dettaglio curato: **la squadra già
scelta compare disabilitata nell'altro selettore**.

Scelte le due, escono le 23 metriche affiancate e poi **«Analisi del Confronto»**: un testo
lungo in sei blocchi — Panoramica generale, Confronto offensivo, Confronto difensivo,
Controllo e dinamiche di gioco, Fattori tattici decisivi, Scenario previsto — che chiude
dichiarando il campione: «basata su 2 partite per Atalanta e 2 partite per Bologna».

**È la funzione più ambiziosa del prodotto, ed è anche quella che sbaglia di più.** Su
Atalanta-Bologna, il 4 settembre, il testo contraddice la tabella che gli sta sopra:

| Nel testo | Nella tabella | |
| --- | --- | --- |
| Bologna «15.0 tiri/partita» | 16.0 | incoerente |
| Bologna «2.0 grandi occasioni» | 1.0 | incoerente |
| Bologna «1.5 parate» | 1.0 | incoerente |
| possesso «58.5% vs 49.0%» | 58% e 49% | precisione inventata |
| «standard tecnici elevati (88.0% vs 90.5%)» | non esiste | metrica senza fonte in pagina |

E due errori di calcolo puri: «1.50 gol/partita contro 0.00 (**+0.0%**)» — la variazione da
zero non è definita, e non è zero; «subendo 0.50 contro 1.00 (**-100.0%**)» — è −50%.
Infine numeri annunciati come fatti che nessun dato in pagina sostiene: il fattore campo che
«aumenta l'efficacia offensiva del 10-15%» e «influenza positivamente le decisioni arbitrali
marginali».

**Lezione per noi**: la forma è desiderabile — un verdetto in prosa che lega i numeri — ma
va costruita **dagli stessi numeri mostrati**, con una prova che lo sorvegli. È quello che
già facciamo in «Come si presentano», dove il confronto in parole nasce dalle cifre della
tabella e un test lo controlla.

---

## 5. Classifiche — il controllo migliore del prodotto

Un selettore **«Come contare i numeri»** a due livelli:

- **Media a partita** → Tutte · In casa · In trasferta
- **Totale stagione** → (stesse tre)

Sotto, le stesse quattro famiglie, e dentro ciascuna una metrica per accordion: Attacco apre
Gol Fatti, Tiri Totali, Tiri in Porta, Grandi Occasioni, Corner, Attacchi Pericolosi. Aperta
una metrica, esce la classifica completa a 20 righe: posizione con medaglia colorata per le
prime tre, stemma, nome, valore a destra.

Sono tre livelli di accordion prima del dato. Molto ordinato, ma anche molti tocchi.

---

## 6. Scheda giocatore — qui il campione si dichiara

659 giocatori in Serie A, con ricerca e tre filtri: squadra, ruolo, nazionalità. Badge di
ruolo colorato (POR/DIF/CEN/ATT).

Aperta la scheda: filtro **Tutte · Casa · Trasferta** in cima, foto, squadra, nazionalità,
altezza, tre tessere grandi — **Presenze, Gol, Assist** — e poi tre categorie con colonne
**TOTALE** e **MEDIA**:

- Attacco: Tiri Totali, Tiri in Porta, Grandi Occasioni Create, Passaggi Chiave, Dribbling Riusciti
- Difesa: Contrasti, Intercetti, Duelli Vinti, Parate, Gol Subiti
- Disciplina: Falli Commessi, Falli Subiti

Due cose che fanno la differenza e che le schede squadra **non** hanno: la riga **«2 partite
giocate»** sopra la tabella, e una legenda **«Sopra la media · In media · Sotto la media»**
che colora ogni valore rispetto al metro del campionato. È lo stesso principio del metro di
competizione che abbiamo appena introdotto nel ritmo per tempo.

---

## 7. Scheda arbitro — indici normalizzati e una nota di cautela

Tre **indici a base 100**: Indice Disciplinare, Indice Rigori, Indice Generale, con la scala
dichiarata sotto: **sotto 80 permissivo, intorno a 100 nella media, oltre 120 severo**.

Poi **Medie a partita** (Cartellini Gialli, Cartellini Rossi, Falli Fischiati, Rigori
Assegnati, ciascuno diviso casa/trasferta), **Analisi** in cinque blocchi (Disciplina,
Severità, Gestione casa·trasferta, Rigori, Cartellini) e **Storico partite**.

L'analisi chiude con la riga giusta: «Ha diretto solo 1 partite: campione limitato, i dati
vanno interpretati con cautela.»

**Ma la cautela arriva dopo aver già concluso.** Sullo stesso arbitro, con **una** gara
diretta, il testo dice: «Ammonisce di più le squadre di casa (3.00 vs 0.00 gialli/partita
agli ospiti): **una differenza degna di nota**». Con n=1 non è una differenza, è una partita.
E i tre indici valgono tutti esattamente **100 · NELLA MEDIA**: un indice che su campione
uno restituisce il valore neutro non sta misurando, sta riempiendo una casella.

Un difetto di etichetta nella stessa scheda: «Falli Fischiati — CASA 13.00, TRASFERTA 11.00,
**MEDIA 24.00**». Ventiquattro è la somma, non la media.

**Per noi vale il confronto**: il nostro pannello arbitro non dichiara nulla sotto 4
precedenti, e da 4 a 7 mette l'etichetta di campione limitato **prima** della frase, non
dopo. E la nostra scelta di non usare indici 0-100 esce rafforzata.

---

## 8. Calendario e Generatore

**Calendario**: Per giornata · Per squadra · Preferiti, ricerca squadra, filtro «Tutti gli
esiti», e una pillola **«In programma 360»** che salta alle gare future. Le gare stanno
sotto l'intestazione della giornata.

**Generatore**: sette controlli — periodo, campionati (con il conto «13/13 · 18 partite»),
mercati (9 su 9), quote «Le nostre» o «Solo mercato», numero di eventi, quota obiettivo con
etichetta di rischio, interruttore «un solo esito per partita». Un «Come funziona» in sei
punti e, sotto la quota, la frase che resta il pezzo meglio scritto del sito: «Con 4 eventi a
quota 10.00, ogni evento vale in media ≈ 1.78 (circa 56% di probabilità ciascuno)».
Dall'onboarding si apprende che ogni evento generato ha un tasto **«Sostituisci»** e che la
schedina si può **salvare**.

---

## 9. Comportamenti trasversali

- **Onboarding a passi in ogni sezione**, con puntini di avanzamento, «Salta / Indietro /
  Avanti», e l'elemento della pagina evidenziato. Ogni passo è **una frase che dice a cosa
  serve quella cosa**. Sette passi per Statistiche, sette per il Generatore. È il modo più
  economico che ho visto per spiegare un prodotto dall'interno.
- **Due modali all'ingresso**: promozione degli Expected e installazione della webapp. Sono
  due interruzioni prima di qualunque contenuto.
- **Monetizzazione a token e piani**: token separati per Expected e per Generatore, uno
  gratis a settimana con conto alla rovescia, piani PRO e PLUS, «la prima settimana costa
  solo 1€». Il muro compare come modale sulla gara, come pagina piena su `view=gol`, e come
  modale sul pulsante Genera.

---

## 10. Che cosa prendere e che cosa no

**Da prendere** (idee, non codice):

1. **Il selettore «come contare i numeri»**: media a partita o totale stagione, per tutte /
   casa / trasferta, in un controllo solo. Copre in un colpo domande che oggi noi spargiamo
   fra sezioni diverse.
2. **La freccia «meno è meglio»** accanto alle metriche difensive e disciplinari.
3. **La forma di stato «Totale / Casa / Trasferta»** con l'avversario visibile, non solo la
   striscia V-N-P.
4. **Il confronto diretto fra due squadre** come pagina a sé, non solo dentro il dossier di
   una gara.
5. **L'onboarding a passi con una frase per sezione**: spiegare dentro il prodotto invece che
   in una pagina «metodo» separata.
6. **La disabilitazione della squadra già scelta** nel secondo selettore: piccolo, corretto.
7. **Il tasto «Sostituisci»** su un elemento proposto: dà controllo senza rifare tutto.

**Da non prendere:**

1. **Numeri nel testo che non coincidono con la tabella sopra.** Se una frase cita un valore,
   deve essere lo stesso valore mostrato.
2. **Percentuali di variazione da zero** e differenze calcolate male.
3. **Medie che sono somme.**
4. **Indici normalizzati che su campione uno restituiscono il valore neutro.**
5. **Zeri al posto dei dati mancanti**: «Passaggi Chiave CASA 0.00» su una gara in casa
   dell'Inter è quasi certamente un campo vuoto diventato zero. Da noi è vietato.
6. **Due decimali su due partite** senza dire che sono due partite: le schede squadra e le
   classifiche mostrano `4.00` e `2.5` senza campione accanto, mentre le schede giocatore e
   arbitro il campione lo dichiarano. Incoerenza interna.
7. **La cautela dopo la conclusione.** «Differenza degna di nota» e poi, in fondo, «campione
   limitato». L'ordine giusto è l'inverso, o meglio: sotto soglia non si dichiara.
8. **«1 partite»**: il plurale non concordato compare in più punti.

---

## 11. Dove tocca il nostro lavoro

- Il **metro di competizione** introdotto nel ritmo per tempo (`aefeff1f`) è lo stesso
  principio del «sopra / in / sotto la media» delle schede giocatore, applicato però a tutte
  le letture e non solo a una legenda colorata.
- La **scala di affidabilità** (`6760984f`) risolve esattamente l'incoerenza del punto 10.6:
  da noi il campione sta accanto al numero **in ogni sezione**, con la stessa scala.
- Il **selettore di finestra** (`094a3fd9`) è parente del loro «come contare i numeri», ma
  sull'asse del tempo invece che su quello del lato. I due assi sono componibili: è la strada
  naturale se si vuole ampliare il controllo.
