/**
 * Da quante gare una squadra non fa una cosa, e quanto spesso quella cosa le succede.
 *
 * **Il ritardo da solo non e' una lettura, ed e' il motivo per cui qui ce ne sono due.**
 * «Non tiene la porta inviolata da 9 gare» sembra molto finche' non si sa che le riesce
 * una volta su dieci: allora nove e' normale. E sembra poco finche' non si sa che le
 * riesce una volta su due: allora nove e' un'anomalia. Il ritardo si mostra sempre
 * accanto alla sua quota storica, o non si mostra.
 *
 * **Un ritardo lungo non rende l'evento piu' probabile.** Ogni gara e' una prova nuova, e
 * le precedenti non le devono niente. La sezione lo scrive in pagina, non solo qui: e' la
 * lettura sbagliata piu' comune di questo numero, e lasciarla implicita sarebbe suggerirla.
 *
 * **Si guarda un solo lato del campo.** Un ritardo che mescola casa e trasferta conta due
 * popolazioni diverse: la stessa disciplina della forma e del metro di lega.
 *
 * Zero interrogazioni nuove: sono le righe che il motore legge gia' per proiettare.
 */
import type { Lato } from './asof/contratto';
import type { OsservazioneSquadraGara } from './snapshot';

/** Sotto questo campione non si dichiara nessuna quota: sarebbe un aneddoto. */
const CAMPIONE_MINIMO = 6;

export interface Ritardo {
  /** L'evento, come si legge in pagina. */
  readonly evento: string;
  /** Da quante gare non succede. Zero vuol dire che e' successo nell'ultima. */
  readonly gare: number;
  /** Su quante gare poggia la quota storica. */
  readonly campione: number;
  /** Quante volte su cento succede, su quel campione. */
  readonly quota: number;
}

interface Evento {
  readonly nome: string;
  /** `null` quando la riga non sa rispondere: quella gara non entra nel conto. */
  readonly accade: (riga: OsservazioneSquadraGara) => boolean | null;
}

const EVENTI: readonly Evento[] = [
  {
    nome: "Chiude senza subire gol",
    accade: (r) => (r.retiSubite === null ? null : r.retiSubite === 0),
  },
  {
    nome: "Va a segno",
    accade: (r) => (r.retiFatte === null ? null : r.retiFatte > 0),
  },
  {
    nome: "Segnano entrambe",
    accade: (r) => (r.retiFatte === null || r.retiSubite === null
      ? null
      : r.retiFatte > 0 && r.retiSubite > 0),
  },
  {
    nome: "La gara supera i 2,5 gol",
    accade: (r) => (r.retiFatte === null || r.retiSubite === null
      ? null
      : r.retiFatte + r.retiSubite > 2),
  },
];

/** Le gare di un lato, dalla piu' recente alla piu' vecchia. */
function recenti(
  righe: readonly OsservazioneSquadraGara[],
  lato: Lato,
): readonly OsservazioneSquadraGara[] {
  return righe
    .filter((r) => r.lato === lato)
    .slice()
    // Gli istanti sono ISO normalizzati: l'ordine lessicografico e' quello temporale.
    .sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0));
}

/**
 * I ritardi di una squadra su un lato, dal piu' lungo al piu' corto.
 *
 * Un evento entra solo se ha un campione decente **e** se e' gia' successo almeno una
 * volta: «non succede da 30 gare su 30» non e' un ritardo, e' un evento che non abbiamo
 * mai visto, e chiamarlo ritardo suggerirebbe che sia in arrivo.
 */
export function ritardiDi(
  righe: readonly OsservazioneSquadraGara[],
  lato: Lato,
): readonly Ritardo[] {
  const ordinate = recenti(righe, lato);
  const fuori: Ritardo[] = [];

  for (const evento of EVENTI) {
    const risposte = ordinate.map(evento.accade);
    const note = risposte.filter((v): v is boolean => v !== null);
    if (note.length < CAMPIONE_MINIMO) continue;

    const volte = note.filter(Boolean).length;
    if (volte === 0) continue;

    // Quante gare note sono passate dall'ultima volta che e' successo.
    let gare = 0;
    for (const risposta of risposte) {
      if (risposta === null) continue;
      if (risposta) break;
      gare += 1;
    }

    fuori.push({
      evento: evento.nome,
      gare,
      campione: note.length,
      quota: (volte / note.length) * 100,
    });
  }

  return fuori.sort((a, b) => b.gare - a.gare);
}
