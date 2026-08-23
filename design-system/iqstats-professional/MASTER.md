# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** IQstatS
**Identità visiva:** «carta e campo» — sostituisce «Il Cardinale» (bruno e oro su fondo
scuro) e la precedente veste blu «IQstatS Professional», il 14 agosto 2026.
**Category:** Analytics / football intelligence
**Percorso storico:** la cartella si chiama ancora `iqstats-professional` perché
`AGENTS.md` vi rimanda; il contenuto è stato riscritto, il nome no.

---

## Perché questo sistema

Il prodotto esiste per far capire **quanto ci si può fidare di un numero**, non solo
quale sia il numero. Da qui discendono le due regole che tengono insieme tutto il resto:

1. **Il colore dichiara un verso, non decora.** Verde e mattone compaiono solo dove un
   valore sta sopra o sotto un riferimento — media, metro di lega, forma. Dove un numero
   non ha un verso, resta inchiostro.
   **Un'eccezione sola, aggiunta il 23 agosto 2026:** le sette famiglie statistiche del
   dossier hanno una tinta ciascuna, e lì il colore dichiara **un'identità**. Regge a tre
   condizioni, tutte e tre necessarie: l'identità è **scritta** nella testata, quindi
   nessuna informazione vive solo nel colore; nessuna delle sette tinte entra negli
   intervalli del verde (162°) e del mattone (8°), che dicono un verso; le sette sono un
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
| Carta (fondo pagina) | `#F7F6F3` | `--card-ground`, `--canvas` | — |
| Superficie (card) | `#FFFFFF` | `--card-panel`, `--surface` | — |
| Superficie tenue | `#FBFAF7` | `--card-panel-2`, `--surface-soft` | — |
| Bordeaux (brand, testate) | `#6E1522` | `--card-brand`, `--brand` | 10,84 |
| Bordeaux forte (enfasi) | `#56101B` | `--card-brand-strong` | 13,08 |
| Bordeaux profondo (hero) | `#4E0E18` | `--card-oxblood-deep`, `--brand-deep` | — |
| Inchiostro (testo) | `#1C1A17` | `--card-ink`, `--ink` | 16,07 |
| Testo secondario | `#4A443D` | `--card-ink-2`, `--ink-soft` | 8,89 |
| Testo di servizio | `#6A645C` | `--card-ink-3`, `--muted` | 5,41 |
| Verde — sopra il riferimento | `#0F6B4F` | `--card-up`, `--green` | 6,00 |
| Mattone — sotto il riferimento | `#A6321F` | `--card-down`, `--amber` | 6,27 |
| Filetto | `#E3DED4` | `--card-stroke`, `--line` | bordo, mai testo |
| Testo su bordeaux | `#FBF7F3` | `--card-on-brand` | 10,99 su `#6E1522` |
| Famiglia — tiri | `#6E1522` | `--fam-tiri` | 10,99 col testo chiaro sopra |
| Famiglia — tiri in porta | `#7A4E1D` | `--fam-tiri-porta` | 6,71 |
| Famiglia — falli | `#3E3A8C` | `--fam-falli` | 9,00 |
| Famiglia — corner | `#1F5673` | `--fam-corner` | 7,47 |
| Famiglia — cartellini gialli | `#7A5C00` | `--fam-gialli` | 5,87 |
| Famiglia — parate | `#5B3A6E` | `--fam-parate` | 8,66 |
| Famiglia — fuorigioco | `#403E3A` | `--fam-fuorigioco` | 10,01 |

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

Un blocco ad alto contrasto è una superficie bordeaux piena con testo chiaro sopra: la
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
un campo bordeaux**, gerarchia verticale marcata (segno tondo, titolo grande, sottotitolo
di servizio), **campi alti 56 px** con etichetta in maiuscoletto sopra, **una sola azione
che domina** a tutta larghezza, separatore con la parola in mezzo, **due azioni secondarie
affiancate** di pari altezza. Classi `.gate-*`.

Il campo bordeaux **è il blocco ad alto contrasto di quella pagina**, e ne esaurisce la
quota: sulla porta d'ingresso non ce ne sono altri. Dal riferimento si prendono impianto
e ritmo, **mai** i suoi colori
(verde e viola restano fuori: qui il verde significa «sopra il riferimento») e mai le sue
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

- ❌ Colore usato come decorazione: verde e mattone significano un verso, o non si usano
- ❌ Emoji come icone
- ❌ Due blocchi ad alto contrasto sulla stessa pagina
- ❌ Raggi, altezze di controllo e padding di riquadro scritti a mano invece dei sei token
- ❌ Ombre per creare gerarchia
- ❌ Testo sotto 4,5:1 (3:1 per il testo grande)
- ❌ Stati di focus invisibili
- ❌ Hover che spostano il layout
- ❌ Un secondo tema di colore

## Pre-Delivery Checklist

Verificata su tutte le pagine il 14 agosto 2026 con la sonda in `scratchpad/qa-contrasto.mjs`
e `qa-squadra.mjs` (Playwright, quattro viewport, entrambi i `color-scheme`):

- [ ] Contrasto: zero combinazioni sotto AA, misurate sullo **stack di rendering** e non
      sulla catena dei genitori — un testo sopra una foto va verificato a vista
- [ ] Nessun overflow orizzontale a 375 / 768 / 1024 / 1440 px
- [ ] Ogni elemento raggiungibile con Tab ha un anello di focus percepibile
- [ ] `prefers-reduced-motion`: ogni durata scende a 0,01 ms
- [ ] Controlli di almeno 44 × 44 px
- [ ] Nessuna emoji come icona, `cursor: pointer` su ogni elemento cliccabile
- [ ] Fonti, timestamp, campione e assenze leggibili dove si mostrano dati reali
