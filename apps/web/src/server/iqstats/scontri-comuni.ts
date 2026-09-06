// Server-only: le due squadre misurate **contro gli stessi avversari**.
//
// **Che cosa aggiunge rispetto alle medie di squadra.** Una media di stagione porta dentro
// il calendario: chi ha gia' incontrato le prime tre sembra peggio di chi ha incontrato le
// ultime tre, e il confronto fra le due medie fa passare per differenza di gioco quella che
// e' differenza di avversari. Qui l'avversario si tiene fermo: entrano solo le gare contro
// le squadre che **entrambe** hanno affrontato, e quello che resta della differenza e' loro.
//
// **Il campo non si tiene fermo, ed e' dichiarato.** Le due squadre hanno incontrato quegli
// avversari in casa e fuori in proporzioni diverse; controllare anche il campo dimezzerebbe
// di nuovo il campione — misurato: per squadra, competizione e lato la mediana e' 19 gare —
// e questa sezione risponde alla domanda sull'avversario. Il lato del campo ha gia' la sua
// sezione, che e' `lati.ts`.
//
// **La finestra e' tutte le stagioni archiviate di quella competizione**, non la sola in
// corso. Misurato: nella stagione in corso la mediana degli avversari comuni e' **3** e il
// primo quartile **1**, cioe' a settembre la sezione non esisterebbe meta' delle volte; su
// tutte le stagioni la mediana e' **16**, il primo quartile **10**, e il **76% delle coppie**
// arriva a dieci. La pagina lo dichiara.
//
// **Una differenza si dichiara differenza solo se supera il rumore.** E' la stessa disciplina
// di `lati.ts`: lo scarto fra le due medie deve superare l'errore di entrambe messo insieme,
// altrimenti la riga si mostra senza dire chi ha fatto meglio.
import "server-only";

import { connessione } from "./lettura.ts";

/**
 * Le metriche del confronto: i gol e i sette bersagli del motore, con i nomi che il prodotto
 * usa altrove. Nessuna metrica nuova, nessun nome nuovo.
 */
const METRICHE = [
  { chiave: "gol_fatti", colonna: "goals_for", nome: "Gol fatti" },
  { chiave: "gol_subiti", colonna: "goals_against", nome: "Gol subiti" },
  { chiave: "tiri", colonna: "total_shots", nome: "Tiri" },
  { chiave: "in_porta", colonna: "shots_on_target", nome: "Tiri in porta" },
  { chiave: "corner", colonna: "corner_kicks", nome: "Corner" },
  { chiave: "falli", colonna: "fouls", nome: "Falli" },
  { chiave: "gialli", colonna: "yellow_cards", nome: "Cartellini gialli" },
  { chiave: "fuorigioco", colonna: "offsides", nome: "Fuorigioco" },
  { chiave: "parate", colonna: "goalkeeper_saves", nome: "Parate" },
] as const;

/**
 * Sotto questi avversari in comune il confronto non toglie il calendario, lo sposta.
 *
 * Cinque e' misurato: su 6.314 coppie di squadre della stessa competizione, **5.085 (81%)**
 * ne hanno almeno cinque su tutte le stagioni archiviate.
 */
const AVVERSARI_MINIMI = 5;

/** Sotto queste gare una media non e' una tendenza. E' lo stesso minimo di `lati.ts`. */
const GARE_MINIME = 5;

export interface MediaComune {
  readonly media: number;
  /** Lo scarto fra le sue gare diviso la radice del campione: quanto ballerebbe il numero. */
  readonly errore: number | null;
  readonly campione: number;
}

export interface VoceComune {
  readonly chiave: string;
  readonly nome: string;
  readonly casa: MediaComune;
  readonly fuori: MediaComune;
  /** `true` solo se lo scarto supera l'errore delle due medie messo insieme. */
  readonly diverse: boolean;
}

export interface ScontriComuni {
  /** Quanti avversari hanno affrontato entrambe. */
  readonly avversari: number;
  /** Le gare che ciascuna ha giocato contro quegli avversari. */
  readonly gareCasa: number;
  readonly gareFuori: number;
  readonly voci: readonly VoceComune[];
  /** Le metriche che il campione non regge: si dicono, non spariscono. */
  readonly assenti: readonly string[];
}

/** Il numero, o `null` se la colonna non c'era: un'assenza non diventa zero. */
function numero(valore: string | null | undefined): number | null {
  if (valore === null || valore === undefined) return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
}

/** L'errore della media: lo scarto fra le gare diviso la radice del campione. */
function errore(scarto: number | null, campione: number): number | null {
  if (scarto === null || campione < 2) return null;
  return scarto / Math.sqrt(campione);
}

interface Riga {
  readonly squadra: string;
  readonly gare: string;
  readonly avversari: string;
  readonly [colonna: string]: string | null;
}

/**
 * Il confronto sulle gare contro gli avversari comuni, o `null` se non se ne cava niente.
 *
 * Gli identificativi sono quelli della fonte, come ovunque nel livello dati.
 */
export async function scontriComuni(
  competitionSourceId: number,
  idCasa: number,
  idFuori: number,
): Promise<ScontriComuni | null> {
  const sql = connessione();
  if (sql === null) return null;

  const colonne = METRICHE.flatMap((m) => [
    `avg(o.${m.colonna})::text as m_${m.chiave}`,
    `stddev_samp(o.${m.colonna})::text as s_${m.chiave}`,
    `count(o.${m.colonna})::text as n_${m.chiave}`,
  ]).join(",\n             ");

  try {
    const righe = await sql<Riga[]>`
      with sq as (
        select id from football.teams
        where source_id in (${idCasa}::bigint, ${idFuori}::bigint)
      ),
      -- Gli avversari di ciascuna, in questa competizione. L'altra squadra non e' un
      -- avversario comune: le loro gare dirette sono il testa a testa, che sta sopra.
      loro as (
        select o.team_id, o.opponent_id
        from football.team_match_observations o
        join football.competitions c on c.id = o.competition_id
        where c.source_id = ${competitionSourceId}::bigint
          and o.team_id in (select id from sq)
          and o.opponent_id not in (select id from sq)
        group by 1, 2
      ),
      comuni as (
        select opponent_id from loro group by 1 having count(distinct team_id) = 2
      )
      select t.source_id::text as squadra,
             count(*)::text as gare,
             (select count(*) from comuni)::text as avversari,
             ${sql.unsafe(colonne)}
      from football.team_match_observations o
      join football.competitions c on c.id = o.competition_id
      join football.teams t on t.id = o.team_id
      where c.source_id = ${competitionSourceId}::bigint
        and o.team_id in (select id from sq)
        and o.opponent_id in (select opponent_id from comuni)
      group by 1
    `;
    const casa = righe.find((r) => r.squadra === String(idCasa));
    const fuori = righe.find((r) => r.squadra === String(idFuori));
    if (casa === undefined || fuori === undefined) return null;

    const avversari = Number(casa.avversari);
    if (!Number.isFinite(avversari) || avversari < AVVERSARI_MINIMI) return null;

    const voci: VoceComune[] = [];
    const assenti: string[] = [];
    for (const m of METRICHE) {
      const nCasa = Number(casa[`n_${m.chiave}`]);
      const nFuori = Number(fuori[`n_${m.chiave}`]);
      const mediaCasa = numero(casa[`m_${m.chiave}`]);
      const mediaFuori = numero(fuori[`m_${m.chiave}`]);
      if (mediaCasa === null || mediaFuori === null || nCasa < GARE_MINIME || nFuori < GARE_MINIME) {
        assenti.push(m.nome);
        continue;
      }
      const eCasa = errore(numero(casa[`s_${m.chiave}`]), nCasa);
      const eFuori = errore(numero(fuori[`s_${m.chiave}`]), nFuori);
      const rumore = (eCasa ?? 0) + (eFuori ?? 0);
      voci.push({
        chiave: m.chiave,
        nome: m.nome,
        casa: { media: mediaCasa, errore: eCasa, campione: nCasa },
        fuori: { media: mediaFuori, errore: eFuori, campione: nFuori },
        diverse: eCasa !== null && eFuori !== null && Math.abs(mediaCasa - mediaFuori) > rumore,
      });
    }
    if (voci.length === 0) return null;
    return {
      avversari,
      gareCasa: Number(casa.gare),
      gareFuori: Number(fuori.gare),
      voci,
      assenti,
    };
  } catch {
    // Un confronto che non si puo' leggere non diventa un confronto inventato.
    return null;
  }
}
