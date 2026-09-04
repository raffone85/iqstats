# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** IQstatS
**Identità visiva:** «campo e calce» — sostituisce «carta e campo» (bordeaux su carta
calda) il 4 settembre 2026, che a sua volta aveva sostituito «Il Cardinale» e la veste blu
«IQstatS Professional» il 14 agosto 2026.
**Category:** Analytics / football intelligence
**Percorso storico:** la cartella si chiama ancora `iqstats-professional` perché
`AGENTS.md` vi rimanda; il contenuto è stato riscritto, il nome no.

---

## Perché questo sistema

Il prodotto esiste per far capire **quanto ci si può fidare di un numero**, non solo
quale sia il numero. Da qui discendono le due regole che tengono insieme tutto il resto:

1. **Il colore dichiara un verso, non decora.** Blu e arancio compaiono solo dove un
   valore sta sopra o sotto un riferimento — media, metro di lega, forma. Dove un numero
   non ha un verso, resta inchiostro.
   **Il verde è del marchio e non dice mai un verso.** Fino al 4 settembre 2026 il verso
   era verde e mattone; quando il verde è passato al marchio, il verso è andato su blu e
   arancio, che restano distinguibili anche a chi non separa il rosso dal verde. Nello
   stesso passaggio sono uscite dal verso tre cose che non lo erano mai state: la pastiglia
   della vittoria, il segnale di gara in corso e il messaggio di operazione riuscita. Ora si
   distinguono per quanto sono piene, con la parola sempre scritta.
   **Un'eccezione sola, aggiunta il 23 agosto 2026:** le sette famiglie statistiche del
   dossier hanno una tinta ciascuna, e lì il colore dichiara **un'identità**. Regge a tre
   condizioni, tutte e tre necessarie: l'identità è **scritta** nella testata, quindi
   nessuna informazione vive solo nel colore; nessuna delle sette tinte entra negli
   intervalli del blu (224°) e dell'arancio (17°), che dicono un verso: la piu' vicina, il
   corner, sta a 28 gradi; le sette sono un
   **insieme chiuso e nominato**, non una tavolozza libera. Fuori da queste sette famiglie
   la regola non cambia.
2. **Il monospazio è la voce della provenienza, la prosa è la voce della lettura.**
   Fonte, freschezza, campione, identificativi e cifre in mono; giudizi e spiegazioni in
   prosa. Discende dal vincolo non negoziabile: ogni valore mostrato dichiara da dove
   viene e su quante gare poggia.

## Color Palette

I token vivono in `apps/web/src/app/globals.css`: `:root` per la dashboard e le pagine di
cornice, `.product-shell` per le superfici di prodotto. **Questo file non li duplica: li
spiega.** Non introdurre colori fuori da questa tabella.

| Ruolo | Hex | Token | Contrasto su carta |
|---|---|---|---|
| Calce (fondo pagina) | `#F6F7F5` | `--card-ground`, `--canvas` | — |
| Superficie (card) | `#FFFFFF` | `--card-panel`, `--surface` | — |
| Superficie tenue | `#FAFBFA` | `--card-panel-2`, `--surface-soft` | — |
| Verde campo (brand, testate) | `#0B4F35` | `--card-brand`, `--brand` | 8,95 |
| Verde forte (enfasi) | `#073B27` | `--card-brand-strong` | 11,74 |
| Verde profondo (hero) | `#05301F` | `--card-verde-deep`, `--brand-deep` | — |
| Inchiostro (testo) | `#14181A` | `--card-ink`, `--ink` | 16,63 |
| Testo secondario | `#414B4E` | `--card-ink-2`, `--ink-soft` | 8,35 |
| Testo di servizio | `#5E686B` | `--card-ink-3`, `--muted` | 5,33 |
| Blu — sopra il riferimento | `#1D4ED8` | `--card-up`, `--green` | 6,24 |
| Arancio — sotto il riferimento | `#A63709` | `--card-down`, `--amber` | 6,16 |
| Filetto | `#E2E6E2` | `--card-stroke`, `--line` | bordo, mai testo |
| Testo su verde | `#F4F8F5` | `--card-on-brand` | 8,97 su `#0B4F35` |
| Famiglia — tiri | `#8C215A` | `--fam-tiri` | 7,90 col testo chiaro sopra |
| Famiglia — tiri in porta | `#70218C` | `--fam-tiri-porta` | 8,57 |
| Famiglia — falli | `#41218C` | `--fam-falli` | 10,76 |
| Famiglia — corner | `#206C88` | `--fam-corner` | 5,50 |
| Famiglia — cartellini gialli | `#74601B` | `--fam-gialli` | 5,71 |
| Famiglia — parate | `#37701A` | `--fam-parate` | 5,61 |
| Famiglia — fuorigioco | `#3E4441` | `--fam-fuorigioco` | 9,29 |

I due nomi `--green` e `--amber` sono rimasti dal sistema precedente e ora portano il blu e
l'arancio: il valore dice il verso, il nome no. Vanno letti come «sopra» e «sotto».

**Nessuna modalità scura.** Il tema è unico. Il ribaltamento su `prefers-color-scheme`
esisteva ed è stato rimosso: i componenti dell'identità non lo seguivano, e la cornice
finiva chiara su chiara — 30 combinazioni sotto AA sulla sola scheda squadra, invisibili
a chi ha il sistema operativo in scuro.

## Typography

- **Display (titoli, nomi, KPI):** Archivo — `--font-display`.
- **Corpo:** Inter — `--font-inter`.
- **Dati e provenienza:** IBM Plex Mono — `--font-mono`, con cifre tabellari.

Caricati da `next/font/google` in `apps/web/src/app/layout.tsx`. Archivo ha sostituito
Space Grotesk: la geometrica da interfaccia scura non regge la carta.

## Superfici e profondità

**La carta non ha ombre, ha filetti.** `--shadow-sm` e `--shadow-md` valgono `none`: la
gerarchia si costruisce con bordo da 1 px, superficie tenue e spaziatura.

### Un solo blocco ad alto contrasto per pagina, e la deroga del dossier

Un blocco ad alto contrasto è una superficie verde piena con testo chiaro sopra: la
hero della gara, il campo della porta d'ingresso, il pannello «Cosa non fa IQstatS» di
`/metodo`. **Ogni pagina ne ammette uno e uno solo**, e quell'uno è il protagonista della
pagina: ciò che deve essere letto per primo. Tutto il resto torna su carta, anche quando
sembra importante.

La regola è nata su `/metodo`, dove il pannello pieno ripetuto affaticava la lettura e
azzerava la gerarchia: se tutto grida, nulla si distingue. Il corollario pratico è che
scegliere il blocco pieno significa **decidere il protagonista della pagina**, non
decorare un riquadro. Se due candidati sembrano meritarlo, la pagina ha due argomenti e
il problema è la pagina.

**Deroga, decisa dall'utente il 23 agosto 2026 e scritta qui invece che aggirata.** Nel
dossier gara le sette famiglie statistiche portano una **fascia piena in testata**, una
per card. Con `.oggi-hero`, che resta il protagonista, la pagina passa da **uno a otto**
blocchi pieni. La deroga vale **solo lì** e a due condizioni: le fasce sono **strette**
— alte quanto una riga di titolo, non pannelli — e sono **tutte dello stesso rango**,
quindi non competono con la hero per il primo sguardo, la segmentano. Fuori dal dossier
la regola resta uno per pagina.

Il rischio noto è quello misurato su `/metodo`: sette fasce che gridano insieme
affaticano. Va riletto in pagina, non dedotto.

## La porta d'ingresso

Dal 15 agosto 2026 la pagina di accesso ha un impianto proprio, nato da un riferimento
grafico scelto dall'utente e tradotto in questo sistema: **un riquadro chiaro al centro di
un campo verde**, gerarchia verticale marcata (segno tondo, titolo grande, sottotitolo
di servizio), **campi alti 56 px** con etichetta in maiuscoletto sopra, **una sola azione
che domina** a tutta larghezza, separatore con la parola in mezzo, **due azioni secondarie
affiancate** di pari altezza. Classi `.gate-*`.

Il campo verde **è il blocco ad alto contrasto di quella pagina**, e ne esaurisce la
quota: sulla porta d'ingresso non ce ne sono altri. Dal riferimento si prendono impianto
e ritmo, **mai** i suoi colori
(verde e viola restano fuori: il verde qui è il marchio, e il viola non ha significato) e mai le sue
ombre o i suoi bagliori. Lo stacco lo dà il fondo, non un'ombra.

Le icone in questo blocco sono disegnate a tratto, monocrome, e prendono il colore del
testo che accompagnano. Non sono decorazione: se un'icona non aggiunge significato, non si
mette. Restano vietate le emoji come icone.

## Il ritmo — sei token

Dal 15 agosto 2026 il ritmo nato sulla porta d'ingresso vale su tutto il prodotto:
riquadri con raggio ampio, azione dominante alta, spaziature generose. Sei token in
`:root` di `apps/web/src/app/globals.css` lo tengono insieme. **Non si scrivono raggi,
altezze o padding di riquadro a mano: si usa un token.**

| Token | Valore | Dove si usa |
|---|---|---|
| `--r-panel` | `20px` | il riquadro che **contiene**: pannelli, gruppi, hero, stati vuoti |
| `--r-control` | `14px` | il controllo che **si tocca**: azioni, campi, righe di elenco, schede |
| `--r-inset` | `10px` | il dettaglio che **sta dentro** a un controllo: stemmi, chip, celle |
| `--h-action` | `56px` | altezza dell'azione dominante e dei campi di modulo |
| `--h-control` | `44px` | altezza minima di ogni altro controllo — è anche il minimo tattile |
| `--pad-panel` | `clamp(22px, 4vw, 34px)` | padding interno dei riquadri, elastico col viewport |

**Tre gradini di raggio e non uno di più.** Il quarto raggio non aggiunge gerarchia,
aggiunge rumore: se un elemento non è né contenitore né controllo né dettaglio, la
domanda giusta è cosa sia, non che raggio dargli.

**Le righe degli elenchi restano compatte.** Con oltre centocinquanta gare al giorno il
respiro si prende **attorno** alla lista, non dentro ogni riga: gonfiare la riga di
un'altezza d'azione significa perdere di vista la pagina. La riga usa `--r-control` per il
raggio ma tiene la sua altezza.

## Firma visiva — il filo del campione

Sotto ogni metrica della scheda squadra, un filo alto 3 px diviso in due segmenti
proporzionali alle gare **in casa** e **in trasferta** che compongono quella metrica
(`.squad-thread`, in `team-splits-section.tsx`). Diciannove e diciannove danno due metà
esatte; nove e due si vedono storti prima ancora di leggere le cifre. Il campione è
quello **effettivo della singola metrica**: un dato assente in una gara la fa uscire dal
campione, quindi il filo può risultare sbilanciato anche dove le gare giocate sono pari.

È marcato `aria-hidden`: non aggiunge informazione, la rende visibile. Le cifre restano
scritte accanto a ogni riga.

## Regole di scrittura

- Registro conversazionale, maiuscole standard, verbi attivi.
- Un'azione mantiene lo stesso nome in tutto il flusso.
- Stati vuoti ed errori orientano: dicono cosa manca e cosa fare, non si scusano.
- **Mai linguaggio di certezza, mai istruzioni di puntata, mai link a bookmaker.**
- Un'assenza si dichiara assenza e non diventa mai uno zero.

## Anti-Patterns (Do NOT Use)

- ❌ Colore usato come decorazione: blu e arancio significano un verso, o non si usano
- ❌ Il verde per dire che un numero sta sopra il riferimento: il verde è il marchio
- ❌ Emoji come icone
- ❌ Due blocchi ad alto contrasto sulla stessa pagina
- ❌ Raggi, altezze di controllo e padding di riquadro scritti a mano invece dei sei token
- ❌ Ombre per creare gerarchia
- ❌ Testo sotto 4,5:1 (3:1 per il testo grande)
- ❌ Stati di focus invisibili
- ❌ Hover che spostano il layout
- ❌ Un secondo tema di colore

## Pre-Delivery Checklist

Rimisurata il 4 settembre 2026 col passaggio a «campo e calce», con una sonda su Chrome
headless che per ogni testo visibile risale ai genitori fino al primo fondo opaco: **zero
combinazioni sotto AA** su Oggi, Partite, Squadre, Arbitri, Metodo, Accedi e sul dossier
gara, a 375 e a 1440 px. La sonda non misura un testo sopra una fotografia e lo dichiara:
quelli restano da guardare a vista. La verifica precedente è del 14 agosto 2026, con
`scratchpad/qa-contrasto.mjs` e `qa-squadra.mjs` (Playwright, quattro viewport):

- [ ] Contrasto: zero combinazioni sotto AA, misurate sullo **stack di rendering** e non
      sulla catena dei genitori — un testo sopra una foto va verificato a vista
- [ ] Nessun overflow orizzontale a 375 / 768 / 1024 / 1440 px
- [ ] Ogni elemento raggiungibile con Tab ha un anello di focus percepibile
- [ ] `prefers-reduced-motion`: ogni durata scende a 0,01 ms
- [ ] Controlli di almeno 44 × 44 px
- [ ] Nessuna emoji come icona, `cursor: pointer` su ogni elemento cliccabile
- [ ] Fonti, timestamp, campione e assenze leggibili dove si mostrano dati reali
