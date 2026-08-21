/**
 * Dalle osservazioni conservate all'ingresso del calcolo delle feature.
 *
 * Il predittore non interroga niente: riceve una gara per volta, gia' composta. Questo
 * modulo e' il pezzo che la compone, e sta qui accanto al calcolo perche' e' la stessa
 * materia — funzioni pure su righe gia' lette, nessun accesso a rete o disco. Chi le
 * righe le legge davvero e' `projection-store.ts`, che dipende dal database.
 *
 * Tre regole che questo modulo non negozia.
 *
 * **Si legge soltanto prima del calcio d'inizio.** Il taglio temporale e' compito di chi
 * interroga, ma qui non si fa nulla che possa rimetterlo in discussione: nessuna riga
 * viene cercata, ordinata o completata a partire dalla gara da prevedere.
 *
 * **Un'assenza resta un'assenza.** Una metrica senza provenienza ammessa e' `null`, e
 * resta `null` fino in fondo. Le primitive che mediano sanno gia' che cosa farne.
 *
 * **L'aritmetica e' quella del lato che addestra.** Medie, deviazione e media
 * esponenziale non si riscrivono qui: si riusano da `asof/aggregati`, che il test di
 * parita' verifica cifra per cifra contro Python.
 */

import { campione, deviazione, esponenziale, media } from './asof/aggregati';
import type {
  AggregatiRosa,
  GaraPrecedente,
  IngressoFeature,
  Lato,
  ProfiloArbitro,
  ProfiloDiContesto,
  ProfiloTiri,
  RiferimentiDiLega,
} from './asof/contratto';

/**
 * Una riga di osservazione squadra-gara, come esce dalla tavola.
 *
 * Le metriche arrivano gia' filtrate per provenienza: chi legge applica la politica
 * dichiarata nel registro prima di consegnare, esattamente come fa il lato che addestra
 * prima di qualunque media.
 */
export interface OsservazioneSquadraGara {
  readonly matchId: number;
  readonly stagione: number | null;
  readonly teamId: number;
  readonly opponentId: number;
  readonly lato: Lato;
  readonly quando: string;
  readonly refereeId: number | null;
  readonly allenatoreId: number | null;
  readonly turno: number | null;
  readonly derby: boolean | null;
  readonly retiFatte: number | null;
  readonly retiSubite: number | null;
  /** Le metriche prodotte dalla squadra in quella gara. */
  readonly prodotte: ProfiloDiContesto;
  /** Le stesse metriche, prodotte dall'avversario in quella gara. */
  readonly concesse: ProfiloDiContesto;
  readonly tiri: ProfiloTiri | null;
  readonly tiriConcessi: ProfiloTiri | null;
}

/** Le statistiche di un giocatore in una gara gia' giocata. */
export interface OsservazioneGiocatore {
  readonly matchId: number;
  readonly quando: string;
  /** Posizione nella risposta della fonte: serve a riprodurre l'ordine di prima apparizione. */
  readonly ordinale: number;
  readonly giocatoreId: number;
  readonly minuti: number;
  readonly totalShots: number | null;
  readonly shotsOnTarget: number | null;
  readonly fouls: number | null;
  readonly yellowCard: number | null;
  readonly redCard: number | null;
  readonly saves: number | null;
}

/**
 * Le gare anteriori a quella da prevedere, nell'ordine dichiarato dal contratto.
 *
 * L'ordine e' per istante del calcio d'inizio e, a parita' di istante, per
 * identificativo: due gare cominciate insieme hanno comunque un ordine, ed e' lo stesso
 * nei due linguaggi, altrimenti le finestre mobili non coincidono.
 *
 * **Questa funzione e' l'unica autorita' sul taglio temporale.** Chi legge dal database
 * puo' restringere in SQL per non trascinare l'archivio intero, ma quel filtro e' un
 * soprainsieme: la condizione esatta si applica qui, una volta sola, per tutti.
 *
 * La gara da prevedere non entra mai, in nessuna forma: ne' la sua riga, ne' quella
 * dell'altra squadra, che porterebbe dentro cio' che e' successo dopo il fischio.
 */
export function anteriore(
  quandoGara: string,
  matchIdGara: number,
  quando: string,
  matchId: number,
): boolean {
  if (matchIdGara === matchId) {
    return false;
  }
  if (quandoGara !== quando) {
    return quandoGara < quando;
  }
  return matchIdGara < matchId;
}

export function prima(
  righe: readonly OsservazioneSquadraGara[],
  quando: string,
  matchId: number,
): OsservazioneSquadraGara[] {
  const dentro = righe.filter(
    (riga) => anteriore(riga.quando, riga.matchId, quando, matchId),
  );
  dentro.sort((sinistra, destra) => {
    if (sinistra.quando !== destra.quando) {
      return sinistra.quando < destra.quando ? -1 : 1;
    }
    return sinistra.matchId - destra.matchId;
  });
  return dentro;
}

function valore(profilo: ProfiloDiContesto, metrica: string): number | null {
  const grezzo = profilo[metrica];
  if (grezzo === undefined || grezzo === null || !Number.isFinite(grezzo)) {
    return null;
  }
  return grezzo;
}

/** Tre punti, uno o zero. Ignoto se una delle due reti non e' nota. */
function puntiDa(fatte: number | null, subite: number | null): number | null {
  if (fatte === null || subite === null) {
    return null;
  }
  if (fatte > subite) {
    return 3;
  }
  return fatte === subite ? 1 : 0;
}

/** Una riga di osservazione letta dal lato di un bersaglio. */
export function garaPrecedenteDa(
  riga: OsservazioneSquadraGara,
  target: string,
): GaraPrecedente {
  return {
    eventId: riga.matchId,
    quando: riga.quando,
    stagione: riga.stagione,
    lato: riga.lato,
    prodotto: valore(riga.prodotte, target),
    concesso: valore(riga.concesse, target),
    punti: puntiDa(riga.retiFatte, riga.retiSubite),
    retiFatte: riga.retiFatte,
    retiSubite: riga.retiSubite,
    tiri: riga.tiri,
    tiriConcessi: riga.tiriConcessi,
    contesto: riga.prodotte,
    contestoConcesso: riga.concesse,
  };
}

/**
 * Le medie della competizione «al momento di», dentro la stagione.
 *
 * Le espulsioni sono la somma dei rossi diretti e delle seconde ammonizioni, e valgono
 * solo se entrambi i conteggi sono noti: sommare un numero a un'assenza darebbe un
 * numero, che e' esattamente l'errore che la politica di provenienza esiste per evitare.
 */
export function riferimentiDiLega(
  righe: readonly OsservazioneSquadraGara[],
  target: string,
  lato: Lato,
): RiferimentiDiLega {
  const valori: Array<number | null> = [];
  const delLato: Array<number | null> = [];
  const falli: Array<number | null> = [];
  const ammoniti: Array<number | null> = [];
  const espulsioni: Array<number | null> = [];

  for (const riga of righe) {
    const valoreDelTarget = valore(riga.prodotte, target);
    valori.push(valoreDelTarget);
    if (riga.lato === lato) {
      delLato.push(valoreDelTarget);
    }
    falli.push(valore(riga.prodotte, 'fouls'));
    ammoniti.push(valore(riga.prodotte, 'yellow_cards'));
    const diretti = valore(riga.prodotte, 'red_cards_direct');
    const seconde = valore(riga.prodotte, 'second_yellow_red');
    espulsioni.push(diretti === null || seconde === null ? null : diretti + seconde);
  }

  return {
    media: media(valori),
    sd: deviazione(valori),
    latoMedia: media(delLato),
    latoCampione: campione(delLato),
    falli: media(falli),
    ammoniti: media(ammoniti),
    espulsioni: media(espulsioni),
  };
}

/**
 * Il profilo dell'arbitro prima di questa gara.
 *
 * Le due righe di una gara condividono l'arbitro: si aggrega **per gara**, facendo la
 * media dei due lati, e solo dopo si media sulle gare. Mediare direttamente sulle righe
 * darebbe lo stesso numero solo quando entrambi i lati sono noti, e un numero diverso
 * ogni volta che uno dei due manca.
 *
 * `campione` conta le gare con valore noto, `gareViste` tutte le gare dirette: il loro
 * rapporto dice quanto di quella storia e' davvero misurato.
 */
export function profiloArbitroDa(
  righe: readonly OsservazioneSquadraGara[],
  target: string,
  lato: Lato,
): ProfiloArbitro {
  interface PerGara {
    quando: string;
    casa: number | null;
    via: number | null;
    falliCasa: number | null;
    falliVia: number | null;
    ammonitiCasa: number | null;
    ammonitiVia: number | null;
    espulsioniCasa: number | null;
    espulsioniVia: number | null;
  }

  const perGara = new Map<number, PerGara>();
  for (const riga of righe) {
    let voce = perGara.get(riga.matchId);
    if (voce === undefined) {
      voce = {
        quando: riga.quando,
        casa: null, via: null,
        falliCasa: null, falliVia: null,
        ammonitiCasa: null, ammonitiVia: null,
        espulsioniCasa: null, espulsioniVia: null,
      };
      perGara.set(riga.matchId, voce);
    }
    const diretti = valore(riga.prodotte, 'red_cards_direct');
    const seconde = valore(riga.prodotte, 'second_yellow_red');
    const espulsi = diretti === null || seconde === null ? null : diretti + seconde;
    if (riga.lato === 'home') {
      voce.casa = valore(riga.prodotte, target);
      voce.falliCasa = valore(riga.prodotte, 'fouls');
      voce.ammonitiCasa = valore(riga.prodotte, 'yellow_cards');
      voce.espulsioniCasa = espulsi;
    } else {
      voce.via = valore(riga.prodotte, target);
      voce.falliVia = valore(riga.prodotte, 'fouls');
      voce.ammonitiVia = valore(riga.prodotte, 'yellow_cards');
      voce.espulsioniVia = espulsi;
    }
  }

  const gare = Array.from(perGara.entries());
  gare.sort((sinistra, destra) => {
    if (sinistra[1].quando !== destra[1].quando) {
      return sinistra[1].quando < destra[1].quando ? -1 : 1;
    }
    return sinistra[0] - destra[0];
  });

  const perProdotto: Array<number | null> = [];
  const perLato: Array<number | null> = [];
  const perFalli: Array<number | null> = [];
  const perAmmoniti: Array<number | null> = [];
  const perEspulsioni: Array<number | null> = [];
  for (const coppia of gare) {
    const voce = coppia[1];
    perProdotto.push(media([voce.casa, voce.via]));
    perLato.push(lato === 'home' ? voce.casa : voce.via);
    perFalli.push(media([voce.falliCasa, voce.falliVia]));
    perAmmoniti.push(media([voce.ammonitiCasa, voce.ammonitiVia]));
    perEspulsioni.push(media([voce.espulsioniCasa, voce.espulsioniVia]));
  }

  return {
    campione: campione(perProdotto),
    gareViste: gare.length,
    prodottoMedia: media(perProdotto),
    prodottoSd: deviazione(perProdotto),
    prodottoEwma: esponenziale(perProdotto),
    prodottoLatoMedia: media(perLato),
    falliMedia: media(perFalli),
    ammonitiMedia: media(perAmmoniti),
    espulsioniMedia: media(perEspulsioni),
  };
}

/** Le metriche del giocatore che hanno un corrispettivo fra i bersagli di squadra. */
const METRICHE_GIOCATORE: ReadonlyArray<readonly [keyof OsservazioneGiocatore, string]> = [
  ['totalShots', 'total_shots'],
  ['shotsOnTarget', 'shots_on_target'],
  ['fouls', 'fouls'],
  ['yellowCard', 'yellow_cards'],
  ['redCard', 'red_cards'],
  ['saves', 'goalkeeper_saves'],
];

/** Sotto questa soglia di minuti un per novanta minuti non e' un tasso, e' un caso. */
const MIN_MINUTI = 90;
const TITOLARI = 11;
const CONCENTRAZIONE = 3;

/**
 * Gli aggregati di rosa «al momento di»: con chi la squadra sta giocando.
 *
 * Si guarda alle sole gare precedenti dentro la stessa stagione. La formazione della gara
 * da prevedere non entra: non esiste ancora, e quella scesa in campo sarebbe un dato
 * della gara stessa.
 *
 * Una metrica assente per un giocatore vale zero, non ignoto: e' la stessa convenzione
 * del lato che addestra, ed e' dichiarata li' come qui. I minuti no: un giocatore senza
 * minuti non entra affatto.
 *
 * **L'ordine a parita' di minuti e' dichiarato.** Il lato che addestra usa l'ordine di
 * prima apparizione nel flusso della fonte; qui si riproduce con `ordinale`, che la
 * tavola conserva proprio per questo.
 */
export function aggregatiRosaDa(
  righe: readonly OsservazioneGiocatore[],
): AggregatiRosa {
  interface Accumulo {
    primaApparizione: number;
    minuti: number;
    valori: Record<string, number>;
  }

  const ordinate = righe.slice();
  ordinate.sort((sinistra, destra) => {
    if (sinistra.quando !== destra.quando) {
      return sinistra.quando < destra.quando ? -1 : 1;
    }
    if (sinistra.matchId !== destra.matchId) {
      return sinistra.matchId - destra.matchId;
    }
    return sinistra.ordinale - destra.ordinale;
  });

  const accumulo = new Map<number, Accumulo>();
  let ultimaGara: number | null = null;
  let ultima = new Map<number, number>();
  let apparizioni = 0;
  const gareViste = new Set<number>();

  for (const riga of ordinate) {
    if (riga.matchId !== ultimaGara) {
      ultimaGara = riga.matchId;
      ultima = new Map<number, number>();
    }
    gareViste.add(riga.matchId);
    let voce = accumulo.get(riga.giocatoreId);
    if (voce === undefined) {
      voce = { primaApparizione: apparizioni, minuti: 0, valori: {} };
      apparizioni += 1;
      for (const coppia of METRICHE_GIOCATORE) {
        voce.valori[coppia[1]] = 0;
      }
      accumulo.set(riga.giocatoreId, voce);
    }
    voce.minuti += riga.minuti;
    for (const coppia of METRICHE_GIOCATORE) {
      const grezzo = riga[coppia[0]];
      voce.valori[coppia[1]] += typeof grezzo === 'number' && Number.isFinite(grezzo)
        ? grezzo
        : 0;
    }
    if (riga.minuti > 0) {
      ultima.set(riga.giocatoreId, riga.minuti);
    }
  }

  const ordinati = Array.from(accumulo.entries());
  ordinati.sort((sinistra, destra) => {
    if (destra[1].minuti !== sinistra[1].minuti) {
      return destra[1].minuti - sinistra[1].minuti;
    }
    return sinistra[1].primaApparizione - destra[1].primaApparizione;
  });
  const titolari = ordinati.slice(0, TITOLARI);

  const uscita: Record<string, number | null> = {};
  uscita.giocatori_rosa_usata = ordinati.length;
  uscita.giocatori_gare_precedenti = gareViste.size;
  uscita.giocatori_minuti_titolari = titolari.length === 0
    ? null
    : titolari.reduce((somma, voce) => somma + voce[1].minuti, 0) / titolari.length;

  for (const coppia of METRICHE_GIOCATORE) {
    const metrica = coppia[1];
    let tassi = 0;
    let quanti = 0;
    for (const voce of titolari) {
      if (voce[1].minuti < MIN_MINUTI) {
        continue;
      }
      tassi += (voce[1].valori[metrica] / voce[1].minuti) * 90;
      quanti += 1;
    }
    uscita['giocatori_' + metrica + '_titolari_per90'] = quanti === 0 ? null : tassi;

    let totale = 0;
    const singoli: number[] = [];
    for (const voce of ordinati) {
      totale += voce[1].valori[metrica];
      singoli.push(voce[1].valori[metrica]);
    }
    singoli.sort((sinistra, destra) => destra - sinistra);
    let primi = 0;
    for (let indice = 0; indice < Math.min(CONCENTRAZIONE, singoli.length); indice += 1) {
      primi += singoli[indice];
    }
    uscita['giocatori_' + metrica + '_quota_primi'] = totale > 0 ? primi / totale : null;
  }

  const minutiUltima = Array.from(ultima.values()).reduce((somma, m) => somma + m, 0);
  if (ultima.size === 0 || minutiUltima <= 0) {
    uscita.giocatori_stabilita = null;
    uscita.giocatori_minuti_nuovi = null;
    return uscita;
  }

  // Il confronto e' con l'accumulo cosi' com'e', ultima gara compresa: il lato che
  // addestra fa esattamente questo, e scontare l'ultima darebbe un altro numero.
  const insieme = new Set(titolari.map((voce) => voce[0]));

  let stabili = 0;
  let nuovi = 0;
  for (const voce of ultima.entries()) {
    if (insieme.has(voce[0])) {
      stabili += voce[1];
    }
    const accumulato = accumulo.get(voce[0]);
    if (accumulato === undefined || accumulato.minuti < MIN_MINUTI) {
      nuovi += voce[1];
    }
  }
  uscita.giocatori_stabilita = stabili / minutiUltima;
  uscita.giocatori_minuti_nuovi = nuovi / minutiUltima;
  return uscita;
}

/** Tutto cio' che serve per comporre l'ingresso di una riga squadra-gara. */
export interface MaterialeDellaGara {
  /** Il calcio d'inizio della gara da prevedere. */
  readonly quando: string;
  readonly lato: Lato;
  readonly stagione: number | null;
  readonly turno: number | null;
  readonly derby: number | null;
  /** Gare precedenti della squadra, dalla piu' vecchia alla piu' recente. */
  readonly squadra: readonly OsservazioneSquadraGara[];
  readonly avversario: readonly OsservazioneSquadraGara[];
  /** Gare precedenti dell'allenatore, in qualunque squadra. */
  readonly allenatore: readonly OsservazioneSquadraGara[];
  readonly allenatoreConLaSquadra: number | null;
  /** Tutte le righe della competizione nella stagione, anteriori al calcio d'inizio. */
  readonly lega: readonly OsservazioneSquadraGara[];
  /** Le righe delle gare dirette dall'arbitro, anteriori al calcio d'inizio. */
  readonly arbitro: readonly OsservazioneSquadraGara[] | null;
  /** Le statistiche per giocatore delle gare precedenti della squadra, nella stagione. */
  readonly giocatori: readonly OsservazioneGiocatore[];
}

/**
 * L'ingresso del calcolo delle feature per un bersaglio.
 *
 * Il materiale si legge una volta sola per gara e si compone sette volte, una per
 * bersaglio: cambia quale metrica diventa `prodotto`, non quali righe si guardano.
 */
export function componiIngresso(
  materiale: MaterialeDellaGara,
  target: string,
): IngressoFeature {
  return {
    quando: materiale.quando,
    lato: materiale.lato,
    stagione: materiale.stagione,
    turno: materiale.turno,
    derby: materiale.derby,
    squadra: materiale.squadra.map((riga) => garaPrecedenteDa(riga, target)),
    avversario: materiale.avversario.map((riga) => garaPrecedenteDa(riga, target)),
    allenatore: materiale.allenatore.map((riga) => garaPrecedenteDa(riga, target)),
    allenatoreConLaSquadra: materiale.allenatoreConLaSquadra,
    lega: riferimentiDiLega(materiale.lega, target, materiale.lato),
    arbitro: materiale.arbitro === null
      ? null
      : profiloArbitroDa(materiale.arbitro, target, materiale.lato),
    rosa: aggregatiRosaDa(materiale.giocatori),
  };
}
