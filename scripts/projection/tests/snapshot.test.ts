/**
 * Il livello dati riproduce l'ingresso che Python ha esportato?
 *
 * Il campione di riscontro «al momento di» porta, per righe reali, l'ingresso completo
 * cosi' come il predittore lo riceve. Qui si ricostruisce quello stesso ingresso
 * partendo dalle osservazioni squadra-gara — la stessa materia che la tavola del
 * database conserva — e si confronta voce per voce.
 *
 * E' la prova che il livello dati e il lato che addestra parlano la stessa lingua, ed e'
 * anche la prova che il taglio temporale regge: nessuna riga usata qui ha un calcio
 * d'inizio successivo a quello della gara da prevedere.
 *
 * Una divergenza e' nota, misurata e dichiarata: il lato che addestra calcola le medie
 * di lega spostando di una **riga** e non di una **gara**, quindi per una delle due
 * squadre di ogni gara la media comprende la riga gemella della gara stessa. Qui la
 * gara da prevedere esce tutta, come vuole la semantica «al momento di» e come sara'
 * comunque in produzione, dove quella riga non esiste ancora. Il test verifica che
 * riaggiungendo la gemella si riottenga esattamente il numero di Python: la differenza
 * e' spiegata, non tollerata.
 *
 * Esecuzione: npm run test:snapshot
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { test } from 'node:test';

import {
  aggregatiRosaDa,
  componiIngresso,
  prima,
  profiloArbitroDa,
  riferimentiDiLega,
} from '../../../apps/web/src/server/iqstats/projection/snapshot';
import type {
  OsservazioneGiocatore,
  OsservazioneSquadraGara,
} from '../../../apps/web/src/server/iqstats/projection/snapshot';
import type {
  ProfiloDiContesto,
  ProfiloTiri,
} from '../../../apps/web/src/server/iqstats/projection/asof/contratto';

const RADICE = resolve(
  // Quattro passi: la radice del compilato e' la radice del progetto, perche' i moduli
  // del motore vivono ora in apps/web e i test restano qui.
  __dirname, '..', '..', '..', '..',
);
const ARTEFATTI = resolve(RADICE, 'models', 'output', 'artefatti');
const DATASET = resolve(RADICE, 'dataset', 'output');
const GIOCATORI = resolve(RADICE, 'harvest', 'data', 'player-stats');

/** Quante righe reali si verificano per bersaglio. */
const QUANTE = 6;
const TOLLERANZA = 1e-9;

const PROVENIENZE_AMMESSE = ['A', 'B', 'C'];

/** Le metriche del pannello che il motore usa, con la disciplina ricostruita. */
const METRICHE = [
  'ball_possession', 'passes', 'accurate_passes', 'pass_accuracy_pct', 'long_balls_total',
  'final_third_entries', 'final_third_phase_total', 'touches_in_penalty_area', 'crosses_total',
  'duels', 'ground_duels_total', 'aerial_duels_total', 'tackles', 'interceptions',
  'recoveries', 'clearances', 'dribbles_total', 'dispossessed',
  'shots_inside_box', 'shots_outside_box', 'blocked_shots', 'hit_woodwork',
  'errors_lead_to_a_shot', 'expected_goals', 'big_chances',
  'free_kicks', 'throw_ins', 'goal_kicks', 'fouled_in_final_third',
  'total_shots', 'shots_on_target', 'corner_kicks', 'fouls', 'yellow_cards', 'offsides',
  'goalkeeper_saves', 'second_yellow_red', 'red_cards_direct', 'bench_cards',
];

const CAMPI_TIRI: Array<[keyof ProfiloTiri, string]> = [
  ['totali', 'tiro_totali'],
  ['quotaInArea', 'tiro_quota_in_area'],
  ['distanzaMedia', 'tiro_distanza_media'],
  ['xgPerTiro', 'tiro_xg_per_tiro'],
  ['quotaQualita', 'tiro_quota_qualita'],
  ['quotaBloccati', 'tiro_quota_bloccati'],
  ['quotaDaFermo', 'tiro_quota_da_fermo'],
];

// ------------------------------------------------------------------ lettura

function leggiCsv(percorso: string): Array<Record<string, string>> {
  const testo = readFileSync(percorso, 'utf8');
  const righe = testo.split('\n');
  const intestazione = righe[0].replace('\r', '').split(',');
  const uscita: Array<Record<string, string>> = [];
  for (let indice = 1; indice < righe.length; indice += 1) {
    const riga = righe[indice].replace('\r', '');
    if (riga.length === 0) {
      continue;
    }
    const celle = riga.split(',');
    const voce: Record<string, string> = {};
    for (let colonna = 0; colonna < intestazione.length; colonna += 1) {
      voce[intestazione[colonna]] = celle[colonna] === undefined ? '' : celle[colonna];
    }
    uscita.push(voce);
  }
  return uscita;
}

function numeroDa(testo: string | undefined): number | null {
  if (testo === undefined || testo === '') {
    return null;
  }
  const valore = Number(testo);
  return Number.isFinite(valore) ? valore : null;
}

/** L'istante nella forma che Python esporta: ISO con la Z e senza frazioni di secondo. */
function istanteDa(riga: Record<string, string>): string {
  const grezzo = riga.calcio_dinizio !== '' ? riga.calcio_dinizio : riga.data;
  const quando = new Date(grezzo);
  return quando.toISOString().replace('.000Z', 'Z');
}

function profiloTiriDa(riga: Record<string, string> | undefined): ProfiloTiri | null {
  if (riga === undefined) {
    return null;
  }
  const profilo: Record<string, number | null> = {};
  for (const coppia of CAMPI_TIRI) {
    profilo[coppia[0] as string] = numeroDa(riga[coppia[1]]);
  }
  return profilo as unknown as ProfiloTiri;
}

interface Archivio {
  readonly righe: OsservazioneSquadraGara[];
  readonly perGara: Map<string, OsservazioneSquadraGara>;
  readonly perSquadra: Map<number, OsservazioneSquadraGara[]>;
  readonly perAllenatore: Map<number, OsservazioneSquadraGara[]>;
  readonly perStagione: Map<string, OsservazioneSquadraGara[]>;
  readonly perArbitro: Map<number, OsservazioneSquadraGara[]>;
  readonly stagioneDi: Map<number, string>;
}

function costruisciArchivio(): Archivio {
  const osservazioni = leggiCsv(join(DATASET, 'osservazioni.csv'));
  const tiri = leggiCsv(join(DATASET, 'tiri.csv'));
  const perTiri = new Map<string, Record<string, string>>();
  for (const riga of tiri) {
    perTiri.set(riga.event_id + '|' + riga.lato, riga);
  }

  const grezze = new Map<string, Record<string, string>>();
  for (const riga of osservazioni) {
    grezze.set(riga.event_id + '|' + riga.lato, riga);
  }

  const righe: OsservazioneSquadraGara[] = [];
  for (const riga of osservazioni) {
    const lato = riga.lato === 'home' ? 'home' : 'away';
    const altro = lato === 'home' ? 'away' : 'home';
    const gemella = grezze.get(riga.event_id + '|' + altro);
    const prodotte: ProfiloDiContesto = {};
    const concesse: ProfiloDiContesto = {};
    for (const metrica of METRICHE) {
      prodotte[metrica] = notoDa(riga, metrica);
      concesse[metrica] = gemella === undefined ? null : notoDa(gemella, metrica);
    }
    righe.push({
      matchId: Number(riga.event_id),
      stagione: numeroDa(riga.season_id),
      teamId: Number(riga.team_id),
      opponentId: Number(riga.opponent_id),
      lato,
      quando: istanteDa(riga),
      refereeId: numeroDa(riga.referee_id),
      allenatoreId: numeroDa(riga.coach_id),
      turno: numeroDa(riga.round_number),
      derby: riga.derby === '' ? null : riga.derby === '1',
      retiFatte: numeroDa(riga.gol_fatti),
      retiSubite: numeroDa(riga.gol_subiti),
      prodotte,
      concesse,
      tiri: profiloTiriDa(perTiri.get(riga.event_id + '|' + lato)),
      tiriConcessi: profiloTiriDa(perTiri.get(riga.event_id + '|' + altro)),
    });
  }

  const perGara = new Map<string, OsservazioneSquadraGara>();
  const perSquadra = new Map<number, OsservazioneSquadraGara[]>();
  const perAllenatore = new Map<number, OsservazioneSquadraGara[]>();
  const perStagione = new Map<string, OsservazioneSquadraGara[]>();
  const perArbitro = new Map<number, OsservazioneSquadraGara[]>();
  const stagioneDi = new Map<number, string>();
  for (let indice = 0; indice < righe.length; indice += 1) {
    const riga = righe[indice];
    const grezza = osservazioni[indice];
    perGara.set(riga.matchId + '|' + riga.lato, riga);
    aggiungi(perSquadra, riga.teamId, riga);
    if (riga.allenatoreId !== null) {
      aggiungi(perAllenatore, riga.allenatoreId, riga);
    }
    const chiave = grezza.league_id + '|' + grezza.season_id;
    stagioneDi.set(riga.matchId, chiave);
    const elenco = perStagione.get(chiave);
    if (elenco === undefined) {
      perStagione.set(chiave, [riga]);
    } else {
      elenco.push(riga);
    }
    if (riga.refereeId !== null) {
      aggiungi(perArbitro, riga.refereeId, riga);
    }
  }
  return { righe, perGara, perSquadra, perAllenatore, perStagione, perArbitro, stagioneDi };
}

function aggiungi(
  mappa: Map<number, OsservazioneSquadraGara[]>,
  chiave: number,
  riga: OsservazioneSquadraGara,
): void {
  const elenco = mappa.get(chiave);
  if (elenco === undefined) {
    mappa.set(chiave, [riga]);
  } else {
    elenco.push(riga);
  }
}

/** Il valore di una metrica, ma solo se la provenienza e' ammessa. */
function notoDa(riga: Record<string, string>, metrica: string): number | null {
  const provenienza = riga[metrica + '__p'];
  if (provenienza === undefined || PROVENIENZE_AMMESSE.indexOf(provenienza) < 0) {
    return null;
  }
  return numeroDa(riga[metrica]);
}

// ------------------------------------------------------------------ giocatori

function giocatoriDi(
  archivio: Archivio,
  teamId: number,
  quando: string,
  matchId: number,
  stagione: number | null,
): OsservazioneGiocatore[] {
  const tutte = archivio.perSquadra.get(teamId);
  if (tutte === undefined) {
    return [];
  }
  const precedenti = prima(tutte, quando, matchId).filter(
    (riga) => riga.stagione === stagione,
  );
  const uscita: OsservazioneGiocatore[] = [];
  for (const gara of precedenti) {
    const payload = leggiGiocatori(gara.matchId);
    if (payload === null) {
      continue;
    }
    let ordinale = 0;
    for (const voce of payload) {
      if (Number(voce.team_id) !== teamId) {
        ordinale += 1;
        continue;
      }
      const minuti = voce.minutes_played;
      if (minuti === null || minuti === undefined) {
        ordinale += 1;
        continue;
      }
      uscita.push({
        matchId: gara.matchId,
        quando: gara.quando,
        ordinale,
        giocatoreId: Number(voce.player_id),
        minuti: Number(minuti),
        totalShots: campoNumerico(voce.total_shots),
        shotsOnTarget: campoNumerico(voce.shots_on_target),
        fouls: campoNumerico(voce.fouls),
        yellowCard: campoNumerico(voce.yellow_card),
        redCard: campoNumerico(voce.red_card),
        saves: campoNumerico(voce.saves),
      });
      ordinale += 1;
    }
  }
  return uscita;
}

function campoNumerico(valore: unknown): number | null {
  return typeof valore === 'number' && Number.isFinite(valore) ? valore : null;
}

const cartelleGiocatori: string[] = existsSync(GIOCATORI) ? readdirSync(GIOCATORI) : [];
const cacheGiocatori = new Map<number, Array<Record<string, unknown>> | null>();

function leggiGiocatori(matchId: number): Array<Record<string, unknown>> | null {
  const gia = cacheGiocatori.get(matchId);
  if (gia !== undefined) {
    return gia;
  }
  for (const cartella of cartelleGiocatori) {
    const percorso = join(GIOCATORI, cartella, String(matchId) + '.json');
    if (!existsSync(percorso)) {
      continue;
    }
    const payload = JSON.parse(readFileSync(percorso, 'utf8')) as {
      player_stats?: Array<Record<string, unknown>>;
    };
    const righe = payload.player_stats === undefined ? [] : payload.player_stats;
    cacheGiocatori.set(matchId, righe);
    return righe;
  }
  cacheGiocatori.set(matchId, null);
  return null;
}

// ------------------------------------------------------------------ confronto

function vicini(ottenuto: number | null, atteso: number | null, dove: string): void {
  if (atteso === null || atteso === undefined) {
    assert.equal(ottenuto, null, dove + ': atteso assente, ottenuto ' + String(ottenuto));
    return;
  }
  assert.notEqual(ottenuto, null, dove + ': atteso ' + String(atteso) + ', ottenuto assente');
  const scarto = Math.abs((ottenuto as number) - atteso);
  const relativo = Math.abs(atteso) > 1 ? scarto / Math.abs(atteso) : scarto;
  assert.ok(
    relativo <= TOLLERANZA,
    dove + ': atteso ' + String(atteso) + ', ottenuto ' + String(ottenuto),
  );
}

interface Prova {
  event_id: number;
  lato: 'home' | 'away';
  ingresso: Record<string, unknown>;
}

function riscontri(): Array<{ target: string; prove: Prova[] }> {
  const trovati: Array<{ target: string; prove: Prova[] }> = [];
  for (const nome of readdirSync(ARTEFATTI)) {
    if (!nome.endsWith('-riscontro-asof.json')) {
      continue;
    }
    const documento = JSON.parse(readFileSync(join(ARTEFATTI, nome), 'utf8')) as {
      target: string;
      prove: Prova[];
    };
    trovati.push({ target: documento.target, prove: documento.prove.slice(0, QUANTE) });
  }
  return trovati;
}

const archivio = costruisciArchivio();
const casi = riscontri();

/**
 * Quanti confronti sono stati fatti davvero.
 *
 * Un test che salta in silenzio e' peggio di un test che non c'e': dice verde e non ha
 * guardato niente. Questi contatori esistono per rendere impossibile quel silenzio.
 */
const contati = { gare: 0, arbitri: 0, rose: 0, campiRosa: 0, contesto: 0 };

test('l\'archivio delle osservazioni e i campioni di riscontro esistono', () => {
  assert.ok(archivio.righe.length > 0, 'nessuna osservazione letta');
  assert.equal(casi.length, 7, 'attesi sette campioni di riscontro');
});

for (const caso of casi) {
  const target = caso.target;

  test('storia, arbitro e rosa coincidono con Python su ' + target, () => {
    for (const prova of caso.prove) {
      const riga = archivio.perGara.get(prova.event_id + '|' + prova.lato);
      assert.ok(riga !== undefined, 'riga assente per ' + String(prova.event_id));
      const ingresso = prova.ingresso;
      const quando = ingresso.quando as string;
      const dove = target + ' ' + String(prova.event_id) + ' ' + prova.lato;

      const squadra = prima(
        archivio.perSquadra.get(riga.teamId) ?? [], quando, riga.matchId,
      );
      const avversario = prima(
        archivio.perSquadra.get(riga.opponentId) ?? [], quando, riga.matchId,
      );
      const allenatore = riga.allenatoreId === null
        ? []
        : prima(archivio.perAllenatore.get(riga.allenatoreId) ?? [], quando, riga.matchId);

      // Il taglio temporale, prima di tutto il resto.
      for (const elenco of [squadra, avversario, allenatore]) {
        for (const gara of elenco) {
          assert.ok(
            gara.quando < quando || (gara.quando === quando && gara.matchId < riga.matchId),
            dove + ': una gara usata non e\' anteriore al calcio d\'inizio',
          );
          assert.notEqual(gara.matchId, riga.matchId, dove + ': la gara stessa e\' entrata');
        }
      }

      const stagione = archivio.stagioneDi.get(riga.matchId);
      const dellaLega = stagione === undefined
        ? []
        : prima(archivio.perStagione.get(stagione) ?? [], quando, riga.matchId);
      const dellArbitro = riga.refereeId === null
        ? null
        : prima(archivio.perArbitro.get(riga.refereeId) ?? [], quando, riga.matchId);

      const materiale = {
        quando,
        lato: riga.lato,
        stagione: riga.stagione,
        turno: riga.turno,
        derby: riga.derby === null ? null : (riga.derby ? 1 : 0),
        squadra,
        avversario,
        allenatore,
        allenatoreConLaSquadra: ingresso.allenatoreConLaSquadra as number | null,
        lega: dellaLega,
        arbitro: dellArbitro,
        giocatori: giocatoriDi(archivio, riga.teamId, quando, riga.matchId, riga.stagione),
      };
      const composto = componiIngresso(materiale, target);

      // --- la storia, gara per gara
      for (const nome of ['squadra', 'avversario', 'allenatore']) {
        const attese = ingresso[nome] as Array<Record<string, unknown>>;
        const ottenute = composto[nome as 'squadra'];
        assert.equal(
          ottenute.length, attese.length, dove + ': numero di gare in ' + nome,
        );
        for (let indice = 0; indice < attese.length; indice += 1) {
          const attesa = attese[indice];
          const ottenuta = ottenute[indice];
          contati.gare += 1;
          assert.equal(ottenuta.eventId, attesa.eventId, dove + ': ordine in ' + nome);
          assert.equal(ottenuta.quando, attesa.quando, dove + ': istante in ' + nome);
          assert.equal(ottenuta.lato, attesa.lato, dove + ': lato in ' + nome);
          vicini(ottenuta.prodotto, attesa.prodotto as number | null, dove + ' prodotto');
          vicini(ottenuta.concesso, attesa.concesso as number | null, dove + ' concesso');
          vicini(ottenuta.punti, attesa.punti as number | null, dove + ' punti');
          vicini(ottenuta.retiFatte, attesa.retiFatte as number | null, dove + ' retiFatte');
          vicini(ottenuta.retiSubite, attesa.retiSubite as number | null, dove + ' retiSubite');
          const tiriAttesi = attesa.tiri as Record<string, number | null> | undefined;
          if (tiriAttesi !== undefined) {
            for (const coppia of CAMPI_TIRI) {
              const campo = coppia[0] as string;
              vicini(
                (ottenuta.tiri as unknown as Record<string, number | null>)[campo],
                tiriAttesi[campo],
                dove + ' tiri.' + campo,
              );
            }
          }
          const contestoAtteso = attesa.contesto as Record<string, number | null> | undefined;
          if (contestoAtteso !== undefined) {
            for (const metrica of Object.keys(contestoAtteso)) {
              contati.contesto += 1;
              vicini(
                (ottenuta.contesto as ProfiloDiContesto)[metrica] ?? null,
                contestoAtteso[metrica],
                dove + ' contesto.' + metrica,
              );
            }
          }
        }
      }

      // --- il profilo dell'arbitro
      const arbitroAtteso = ingresso.arbitro as Record<string, number | null> | null;
      if (arbitroAtteso !== null) {
        const ottenuto = composto.arbitro as unknown as Record<string, number | null>;
        assert.ok(ottenuto !== null, dove + ': profilo arbitro assente');
        contati.arbitri += 1;
        for (const campo of Object.keys(arbitroAtteso)) {
          vicini(ottenuto[campo], arbitroAtteso[campo], dove + ' arbitro.' + campo);
        }
      }

      // --- la rosa
      const rosaAttesa = ingresso.rosa as Record<string, number | null> | null;
      if (rosaAttesa !== null && materiale.giocatori.length > 0) {
        const ottenuta = composto.rosa as Record<string, number | null>;
        contati.rose += 1;
        for (const campo of Object.keys(rosaAttesa)) {
          if (ottenuta[campo] === undefined) {
            continue;
          }
          contati.campiRosa += 1;
          vicini(ottenuta[campo], rosaAttesa[campo], dove + ' rosa.' + campo);
        }
      }
    }
  });

  test('le medie di lega di ' + target + ' differiscono solo per la riga gemella', () => {
    for (const prova of caso.prove) {
      const riga = archivio.perGara.get(prova.event_id + '|' + prova.lato);
      assert.ok(riga !== undefined);
      const ingresso = prova.ingresso;
      const quando = ingresso.quando as string;
      const dove = target + ' ' + String(prova.event_id) + ' ' + prova.lato;
      const attesa = ingresso.lega as Record<string, number | null>;
      const stagione = archivio.stagioneDi.get(riga.matchId);
      const dellaLega = stagione === undefined
        ? []
        : prima(archivio.perStagione.get(stagione) ?? [], quando, riga.matchId);

      const stretta = riferimentiDiLega(dellaLega, target, riga.lato);
      // Il lato di campo separa le due righe della stessa gara in gruppi diversi: li'
      // la gemella non entra mai, e i due numeri devono coincidere sempre.
      vicini(stretta.latoMedia, attesa.latoMedia, dove + ' lega.latoMedia');
      vicini(stretta.latoCampione, attesa.latoCampione, dove + ' lega.latoCampione');

      // Sulle medie non separate per lato, riaggiungere la gemella deve riprodurre
      // esattamente il numero di Python: la differenza e' quella riga e nient'altro.
      const altro = riga.lato === 'home' ? 'away' : 'home';
      const gemella = archivio.perGara.get(riga.matchId + '|' + altro);
      const conGemella = gemella === undefined
        ? dellaLega
        : dellaLega.concat([gemella]);
      const larga = riferimentiDiLega(conGemella, target, riga.lato);
      const spiegata = vicinoOppure(stretta.media, larga.media, attesa.media);
      assert.ok(spiegata, dove + ' lega.media: ne\' stretta ne\' con la gemella');
      assert.ok(
        vicinoOppure(stretta.falli, larga.falli, attesa.falli),
        dove + ' lega.falli: ne\' stretta ne\' con la gemella',
      );
      assert.ok(
        vicinoOppure(stretta.ammoniti, larga.ammoniti, attesa.ammoniti),
        dove + ' lega.ammoniti: ne\' stretta ne\' con la gemella',
      );
    }
  });
}

function vicinoOppure(
  stretta: number | null,
  larga: number | null,
  atteso: number | null,
): boolean {
  if (atteso === null) {
    return stretta === null;
  }
  const vicino = (valore: number | null): boolean => {
    if (valore === null) {
      return false;
    }
    const scarto = Math.abs(valore - atteso);
    const relativo = Math.abs(atteso) > 1 ? scarto / Math.abs(atteso) : scarto;
    return relativo <= TOLLERANZA;
  };
  return vicino(stretta) || vicino(larga);
}

test('i confronti sono stati fatti davvero, non saltati', () => {
  assert.ok(contati.gare > 200, 'gare confrontate: ' + String(contati.gare));
  assert.ok(contati.arbitri > 20, 'profili arbitro confrontati: ' + String(contati.arbitri));
  assert.ok(contati.rose > 20, 'rose confrontate: ' + String(contati.rose));
  assert.ok(contati.campiRosa > 200, 'campi di rosa confrontati: ' + String(contati.campiRosa));
  assert.ok(contati.contesto > 500, 'metriche di contesto confrontate: '
    + String(contati.contesto));
});
