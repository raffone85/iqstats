/**
 * I gruppi di feature, uno per unita' di calcolo.
 *
 * Ogni gruppo e' una funzione pura che riceve l'ingresso e restituisce le sue colonne.
 * Nessun gruppo si calcola per sicurezza: chi orchestra chiama solo quelli che il
 * manifesto ha promosso per quel bersaglio.
 *
 * I nomi delle colonne sono quelli del lato che addestra, alla lettera. Se un nome
 * cambia di la', qui deve cambiare uguale: e' il test di parita' a dirlo.
 */

import { FORZA_RESTRINGIMENTO, FORZA_RESTRINGIMENTO_ARBITRO, GIORNI_CONGESTIONE, ORIZZONTI } from './contratto';
import type {
  AggregatiRosa,
  Feature,
  GaraPrecedente,
  IngressoFeature,
  Lato,
  ProfiloTiri,
} from './contratto';
import {
  campione,
  deviazione,
  differenza,
  esponenziale,
  media,
  primoNoto,
  rapporto,
} from './aggregati';

function opposto(lato: Lato): Lato {
  return lato === 'home' ? 'away' : 'home';
}

function dentroLaStagione(gare: GaraPrecedente[], stagione: number | null): GaraPrecedente[] {
  return gare.filter((gara) => gara.stagione === stagione);
}

function suQuestoLato(gare: GaraPrecedente[], lato: Lato): GaraPrecedente[] {
  return gare.filter((gara) => gara.lato === lato);
}

function prodotti(gare: GaraPrecedente[]): Array<number | null> {
  return gare.map((gara) => gara.prodotto);
}

function concessi(gare: GaraPrecedente[]): Array<number | null> {
  return gare.map((gara) => gara.concesso);
}

function giorniDa(quando: string, ultima: GaraPrecedente | undefined): number | null {
  if (!ultima) {
    return null;
  }
  const scarto = Date.parse(quando) - Date.parse(ultima.quando);
  return Number.isFinite(scarto) ? scarto / 86400000 : null;
}

/** Le medie di stagione e di lega, il restringimento e la forza relativa. */
export function gruppoBase(ingresso: IngressoFeature): Feature {
  const stagionali = dentroLaStagione(ingresso.squadra, ingresso.stagione);
  const valori = prodotti(stagionali);
  const lega = ingresso.lega;

  const stagioneMedia = media(valori);
  const stagioneCampione = campione(valori);
  const peso = stagioneCampione / (stagioneCampione + FORZA_RESTRINGIMENTO);
  const ancora = primoNoto(stagioneMedia, lega.latoMedia);
  const restringimento =
    ancora === null || lega.latoMedia === null
      ? null
      : peso * ancora + (1 - peso) * lega.latoMedia;

  return {
    lega_media: lega.media,
    lega_sd: lega.sd,
    lega_lato_media: lega.latoMedia,
    lega_lato_campione: lega.latoCampione,
    prodotto_stagione_media: stagioneMedia,
    prodotto_stagione_sd: deviazione(valori),
    prodotto_stagione_campione: stagioneCampione,
    gare_precedenti: stagionali.length,
    zeta_dalla_lega: rapporto(differenza(stagioneMedia, lega.media), lega.sd),
    baseline_lega: lega.latoMedia,
    baseline_squadra_stagione: stagioneMedia,
    baseline_restringimento: restringimento,
  };
}

/** Gli orizzonti recenti e la media esponenziale. */
export function gruppoForma(ingresso: IngressoFeature): Feature {
  const valori = prodotti(ingresso.squadra);
  const uscita: Feature = {};
  for (const orizzonte of ORIZZONTI) {
    const etichetta = 'prodotto_ultime' + String(orizzonte);
    uscita[etichetta + '_media'] = media(valori, orizzonte);
    uscita[etichetta + '_sd'] = deviazione(valori, orizzonte);
    uscita[etichetta + '_campione'] = campione(valori, orizzonte);
  }
  uscita.prodotto_ewma = esponenziale(valori);
  uscita.baseline_media_mobile = media(valori, 5);
  return uscita;
}

/** Lo split di lato e la forza relativa alla lega. */
export function gruppoCasaTrasferta(ingresso: IngressoFeature): Feature {
  const stagionali = dentroLaStagione(ingresso.squadra, ingresso.stagione);
  const diLato = suQuestoLato(stagionali, ingresso.lato);
  const latoMedia = media(prodotti(diLato));
  const legaLato = ingresso.lega.latoMedia;

  return {
    prodotto_lato_media: latoMedia,
    prodotto_lato_campione: campione(prodotti(diLato)),
    baseline_squadra_lato: latoMedia,
    forza_attacco: rapporto(latoMedia, legaLato),
    scarto_dalla_lega: differenza(latoMedia, legaLato),
  };
}

/** Giorni dall'ultima gara: l'unica colonna del suo gruppo. */
export function gruppoRiposo(ingresso: IngressoFeature): Feature {
  return {
    giorni_di_riposo: giorniDa(ingresso.quando, ingresso.squadra[ingresso.squadra.length - 1]),
  };
}

/**
 * Il profilo dell'avversario e i valori concessi: quanto una squadra produce contro
 * quanto l'altra lascia produrre, sullo stesso orizzonte e sullo stesso lato.
 */
export function gruppoAvversario(ingresso: IngressoFeature): Feature {
  const uscita: Feature = {};

  const nostre = ingresso.squadra;
  const nostreStagione = dentroLaStagione(nostre, ingresso.stagione);
  const nostreDiLato = suQuestoLato(nostreStagione, ingresso.lato);
  for (const orizzonte of ORIZZONTI) {
    uscita['concesso_ultime' + String(orizzonte) + '_media'] = media(concessi(nostre), orizzonte);
  }
  uscita.concesso_stagione_media = media(concessi(nostreStagione));
  uscita.concesso_ewma = esponenziale(concessi(nostre));
  uscita.concesso_lato_media = media(concessi(nostreDiLato));

  const loro = ingresso.avversario;
  const latoLoro = opposto(ingresso.lato);
  const loroStagione = dentroLaStagione(loro, ingresso.stagione);
  const loroDiLato = suQuestoLato(loroStagione, latoLoro);

  for (const orizzonte of ORIZZONTI) {
    const etichetta = String(orizzonte);
    uscita['avv_prodotto_ultime' + etichetta + '_media'] = media(prodotti(loro), orizzonte);
    uscita['avv_concesso_ultime' + etichetta + '_media'] = media(concessi(loro), orizzonte);
  }
  uscita.avv_prodotto_stagione_media = media(prodotti(loroStagione));
  uscita.avv_concesso_stagione_media = media(concessi(loroStagione));
  uscita.avv_prodotto_ewma = esponenziale(prodotti(loro));
  uscita.avv_concesso_ewma = esponenziale(concessi(loro));
  uscita.avv_prodotto_lato_media = media(prodotti(loroDiLato));
  uscita.avv_concesso_lato_media = media(concessi(loroDiLato));
  uscita.avv_gare_precedenti = loroStagione.length;
  uscita.avv_giorni_di_riposo = giorniDa(ingresso.quando, loro[loro.length - 1]);

  const legaLato = ingresso.lega.latoMedia;
  const attacco = primoNoto(media(prodotti(nostreDiLato)), media(prodotti(nostreStagione)));
  const concesso = primoNoto(
    uscita.avv_concesso_lato_media,
    uscita.avv_concesso_stagione_media,
  );
  const forzaAttacco = rapporto(attacco, legaLato);
  const debolezza = rapporto(concesso, legaLato);
  uscita.debolezza_difesa_avversario = rapporto(uscita.avv_concesso_lato_media, legaLato);
  uscita.baseline_attacco_contro_concesso =
    legaLato === null || forzaAttacco === null || debolezza === null
      ? null
      : legaLato * forzaAttacco * debolezza;
  uscita.confronto_produce_meno_concede = differenza(
    media(prodotti(nostre), 5),
    uscita.avv_concesso_ultime5_media,
  );
  return uscita;
}

/** Punti e reti accumulati nella stagione, e lo scarto con l'avversario. */
export function gruppoClassifica(ingresso: IngressoFeature): Feature {
  const nostre = dentroLaStagione(ingresso.squadra, ingresso.stagione);
  const loro = dentroLaStagione(ingresso.avversario, ingresso.stagione);

  const punti = media(nostre.map((gara) => gara.punti));
  const fatte = media(nostre.map((gara) => gara.retiFatte));
  const subite = media(nostre.map((gara) => gara.retiSubite));
  const differenzaReti = differenza(fatte, subite);

  const puntiLoro = media(loro.map((gara) => gara.punti));
  const fatteLoro = media(loro.map((gara) => gara.retiFatte));
  const subiteLoro = media(loro.map((gara) => gara.retiSubite));

  return {
    classifica_punti_media: punti,
    classifica_reti_fatte_media: fatte,
    classifica_reti_subite_media: subite,
    classifica_differenza_media: differenzaReti,
    classifica_delta_punti: differenza(punti, puntiLoro),
    classifica_delta_differenza: differenza(differenzaReti, differenza(fatteLoro, subiteLoro)),
  };
}

/** Turno, derby e gare ravvicinate. */
export function gruppoContesto(ingresso: IngressoFeature): Feature {
  const limite = Date.parse(ingresso.quando) - GIORNI_CONGESTIONE * 86400000;
  let recenti = 0;
  for (const gara of ingresso.squadra) {
    if (Date.parse(gara.quando) >= limite) {
      recenti += 1;
    }
  }
  return {
    contesto_turno: ingresso.turno,
    contesto_derby: ingresso.derby,
    contesto_gare_recenti: recenti,
  };
}

/**
 * Il profilo dell'arbitro, ristretto verso la lega quanto piu' lo storico e' povero.
 *
 * Un arbitro sconosciuto non blocca la previsione: prende il prior della competizione,
 * e il record dichiara che il profilo non c'era.
 */
export function gruppoArbitro(ingresso: IngressoFeature): Feature {
  const forza = FORZA_RESTRINGIMENTO_ARBITRO;
  const profilo = ingresso.arbitro === undefined ? null : ingresso.arbitro;
  const lega = ingresso.lega;
  const conteggio = profilo ? profilo.campione : 0;
  const peso = conteggio / (conteggio + forza);

  // Senza prior di lega non si restringe verso nulla, e il profilo non si usa: lo dice
  // il lato che addestra, dove la stessa operazione propaga l'assenza. Il valore grezzo
  // dell'arbitro non e' un ripiego accettabile, perche' non e' confrontabile fra leghe.
  function ristretto(valore: number | null, prior: number | null): number | null {
    if (prior === null) {
      return null;
    }
    const partenza = valore === null ? prior : valore;
    return peso * partenza + (1 - peso) * prior;
  }

  const prodottoMedia = ristretto(profilo ? profilo.prodottoMedia : null, lega.media);
  const falliMedia = ristretto(profilo ? profilo.falliMedia : null, lega.falli);
  const ammonitiMedia = ristretto(profilo ? profilo.ammonitiMedia : null, lega.ammoniti);
  const qualita = profilo ? rapporto(profilo.campione, profilo.gareViste) : null;
  const deviazioneArbitro = profilo && profilo.prodottoSd !== null ? profilo.prodottoSd : lega.sd;

  return {
    arbitro_campione: conteggio,
    arbitro_gare_viste: profilo ? profilo.gareViste : null,
    arbitro_disponibile: profilo ? 1 : 0,
    arbitro_qualita_storia: qualita === null ? 0 : qualita,
    arbitro_prodotto_media: prodottoMedia,
    arbitro_prodotto_lato_media: ristretto(
      profilo ? profilo.prodottoLatoMedia : null,
      lega.latoMedia,
    ),
    arbitro_prodotto_ewma: ristretto(profilo ? profilo.prodottoEwma : null, lega.media),
    arbitro_prodotto_sd: deviazioneArbitro,
    arbitro_falli_media: falliMedia,
    arbitro_ammoniti_media: ammonitiMedia,
    arbitro_espulsioni_media: ristretto(
      profilo ? profilo.espulsioniMedia : null,
      lega.espulsioni,
    ),
    arbitro_cartellini_per_fallo: rapporto(ammonitiMedia, falliMedia),
    arbitro_scarto_dalla_lega: differenza(prodottoMedia, lega.media),
    arbitro_severita_ammoniti: differenza(ammonitiMedia, lega.ammoniti),
    arbitro_severita_falli: differenza(falliMedia, lega.falli),
  };
}

/** La storia dell'allenatore, con la stessa forma di quella di squadra. */
export function gruppoAllenatore(ingresso: IngressoFeature): Feature {
  const gare = ingresso.allenatore === undefined ? [] : ingresso.allenatore;
  const conLaSquadra =
    ingresso.allenatoreConLaSquadra === undefined ? null : ingresso.allenatoreConLaSquadra;
  return {
    allenatore_prodotto_media: media(prodotti(gare)),
    allenatore_concesso_media: media(concessi(gare)),
    allenatore_campione: campione(prodotti(gare)),
    allenatore_prodotto_ewma: esponenziale(prodotti(gare)),
    allenatore_gare_con_la_squadra: conLaSquadra,
    allenatore_disponibile: gare.length > 0 || conLaSquadra !== null ? 1 : 0,
  };
}

/** Gli aggregati di rosa arrivano gia' calcolati: qui si copiano, non si ricalcolano. */
export function gruppoGiocatori(ingresso: IngressoFeature): Feature {
  const rosa: AggregatiRosa = ingresso.rosa === undefined || ingresso.rosa === null
    ? {}
    : ingresso.rosa;
  const uscita: Feature = {};
  for (const colonna of Object.keys(rosa)) {
    const valore = rosa[colonna];
    uscita[colonna] = valore === undefined ? null : valore;
  }
  return uscita;
}

const CAMPI_SPAZIALI: Array<[keyof ProfiloTiri, string]> = [
  ['totali', 'totali'],
  ['quotaInArea', 'quota_in_area'],
  ['distanzaMedia', 'distanza_media'],
  ['xgPerTiro', 'xg_per_tiro'],
  ['quotaQualita', 'quota_qualita'],
  ['quotaBloccati', 'quota_bloccati'],
  ['quotaDaFermo', 'quota_da_fermo'],
];

/** Il profilo dei tiri, mediato sulle gare precedenti della stagione. */
export function gruppoSpaziale(ingresso: IngressoFeature): Feature {
  const stagionali = dentroLaStagione(ingresso.squadra, ingresso.stagione);
  const uscita: Feature = {};
  for (const coppia of CAMPI_SPAZIALI) {
    const campo = coppia[0];
    const etichetta = coppia[1];
    uscita['spaziale_' + etichetta] = media(
      stagionali.map((gara) => (gara.tiri ? gara.tiri[campo] : null)),
    );
    uscita['spaziale_' + etichetta + '_concesso'] = media(
      stagionali.map((gara) => (gara.tiriConcessi ? gara.tiriConcessi[campo] : null)),
    );
  }
  return uscita;
}

export type NomeGruppo =
  | 'base'
  | 'forma'
  | 'casa_trasferta'
  | 'riposo'
  | 'avversario'
  | 'classifica'
  | 'contesto'
  | 'arbitro'
  | 'allenatore'
  | 'giocatori'
  | 'spaziale';

export const GRUPPI: Record<NomeGruppo, (ingresso: IngressoFeature) => Feature> = {
  base: gruppoBase,
  forma: gruppoForma,
  casa_trasferta: gruppoCasaTrasferta,
  riposo: gruppoRiposo,
  avversario: gruppoAvversario,
  classifica: gruppoClassifica,
  contesto: gruppoContesto,
  arbitro: gruppoArbitro,
  allenatore: gruppoAllenatore,
  giocatori: gruppoGiocatori,
  spaziale: gruppoSpaziale,
};
