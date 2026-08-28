// Server-only: l'area Arbitri, letta dalle osservazioni squadra-gara.
//
// **Le medie sono nostre.** La fonte pubblica anche le sue, per gara e di carriera: non si
// usano. Qui ogni numero esce dalle righe che abbiamo raccolto, con il campione dichiarato
// accanto, perche' un numero che non sappiamo ricostruire non lo sappiamo nemmeno spiegare.
//
// **Il metro non e' una scala inventata.** Un arbitro si giudica contro i colleghi della
// **sua** competizione, e la sua posizione si dice come posizione: «fischia piu' falli
// dell'82% degli arbitri di questa competizione». Nessuna soglia arbitraria, nessun indice
// centrato su cento: la scala e' la distribuzione vera, e cambia con lei.
//
// **Una gara conta solo se abbiamo entrambe le righe.** Falli e cartellini di una gara sono
// la somma dei due lati: con una riga sola il totale sarebbe dimezzato e nessuno se ne
// accorgerebbe. Le gare a meta' restano fuori dal conto, e il campione lo dichiara.
import "server-only";

import { connessione } from "./lettura.ts";

/** Sotto questo campione un arbitro non entra nel metro: poche gare non fanno una tendenza. */
const GARE_MINIME = 5;

/**
 * Le colonne su cui si puo' ordinare, scritte una per una.
 *
 * La metrica arriva dai parametri dell'indirizzo, quindi non puo' finire in una stringa
 * SQL cosi' com'e': il tipo la vincola quando si compila, questa tabella anche quando gira.
 */
const COLONNA_ORDINE = {
  falli: "a.falli",
  gialli: "a.gialli",
  rossi: "a.rossi",
} as const;

export type MetricaArbitro = keyof typeof COLONNA_ORDINE;

export interface MediaDiGara {
  readonly falli: number;
  readonly gialli: number;
  readonly rossi: number;
}

export interface PosizioneFraColleghi {
  /** Quanti colleghi della stessa competizione fischia piu' di lui, da 0 a 1. */
  readonly quota: number;
  /** Quanti arbitri compongono il metro. */
  readonly colleghi: number;
}

export interface RigaStorico {
  readonly matchSourceId: number | null;
  readonly quando: string;
  readonly casa: string;
  readonly trasferta: string;
  readonly falli: number;
  readonly gialli: number;
  readonly rossi: number;
}

export interface ProfiloArbitro {
  readonly sourceId: number;
  readonly nome: string;
  readonly paese: string | null;
  readonly competizione: string;
  readonly competitionSourceId: number | null;
  readonly gare: number;
  readonly media: MediaDiGara;
  /** Falli fischiati contro la squadra di casa e contro l'ospite: due numeri, non uno. */
  readonly falliControCasa: number;
  readonly falliControTrasferta: number;
  readonly gialliControCasa: number;
  readonly gialliControTrasferta: number;
  /** La media della competizione, sullo stesso campione minimo. */
  readonly metro: MediaDiGara;
  readonly posizioneFalli: PosizioneFraColleghi | null;
  readonly posizioneGialli: PosizioneFraColleghi | null;
  /** Il calcio d'inizio dell'ultima gara che entra in queste medie, `null` senza storico. */
  readonly ultima: string | null;
  readonly storico: readonly RigaStorico[];
}

export interface RigaClassifica {
  readonly sourceId: number;
  readonly nome: string;
  readonly paese: string | null;
  readonly gare: number;
  readonly falli: number;
  readonly gialli: number;
  readonly rossi: number;
}

export interface CompetizioneConArbitri {
  readonly sourceId: number;
  readonly nome: string;
  readonly paese: string | null;
  readonly arbitri: number;
  readonly gare: number;
  /**
   * Il calcio d'inizio dell'ultima gara che entra in questi conti.
   *
   * Non e' la data del livello dati: le 29 competizioni non arrivano tutte allo stesso
   * giorno, e la piu' ferma e' indietro di tre mesi rispetto alla piu' aggiornata. Una data
   * sola per tutte sarebbe vera come massimo e falsa come copertura.
   */
  readonly ultima: string;
}

/**
 * Le gare complete di ogni arbitro, una riga per gara.
 *
 * `having count(*) = 2` e' il filtro che tiene il conto onesto: la gara entra solo quando
 * ci sono tutte e due le squadre.
 */
const PER_GARA = `
  select o.referee_id, o.competition_id, o.match_id,
         min(o.kickoff_at) as quando,
         sum(o.fouls) as falli,
         sum(o.yellow_cards) as gialli,
         sum(coalesce(o.red_cards_direct, 0) + coalesce(o.second_yellow_red, 0)) as rossi,
         sum(o.fouls) filter (where o.side = 'home') as falli_casa,
         sum(o.fouls) filter (where o.side = 'away') as falli_trasferta,
         sum(o.yellow_cards) filter (where o.side = 'home') as gialli_casa,
         sum(o.yellow_cards) filter (where o.side = 'away') as gialli_trasferta
  from football.team_match_observations o
  where o.referee_id is not null and o.fouls is not null and o.yellow_cards is not null
  group by 1, 2, 3
  having count(*) = 2
`;

interface RigaProfilo {
  readonly source_id: string;
  readonly name: string;
  readonly country_name: string | null;
  readonly competizione: string;
  readonly competition_source_id: string | null;
  readonly gare: string;
  readonly falli: string;
  readonly gialli: string;
  readonly rossi: string;
  readonly falli_casa: string;
  readonly falli_trasferta: string;
  readonly gialli_casa: string;
  readonly gialli_trasferta: string;
  readonly metro_falli: string | null;
  readonly metro_gialli: string | null;
  readonly metro_rossi: string | null;
  readonly colleghi: string | null;
  readonly sotto_falli: string | null;
  readonly sotto_gialli: string | null;
}

interface RigaStoricoDb {
  readonly match_source_id: string | null;
  readonly kickoff_at: string;
  readonly casa: string;
  readonly trasferta: string;
  readonly falli: string;
  readonly gialli: string;
  readonly rossi: string;
}

function numero(valore: string | null): number {
  return valore === null ? 0 : Number(valore);
}

/** Il profilo di un arbitro, o `null` se non lo conosciamo o non ha gare complete. */
export async function profiloArbitro(sourceId: number): Promise<ProfiloArbitro | null> {
  const sql = connessione();
  if (sql === null) return null;

  try {
    const righe = await sql<RigaProfilo[]>`
      with per_gara as (${sql.unsafe(PER_GARA)}),
      per_arbitro as (
        select referee_id, competition_id, count(*) as gare,
               avg(falli) as falli, avg(gialli) as gialli, avg(rossi) as rossi,
               avg(falli_casa) as falli_casa, avg(falli_trasferta) as falli_trasferta,
               avg(gialli_casa) as gialli_casa, avg(gialli_trasferta) as gialli_trasferta
        from per_gara group by 1, 2
      ),
      -- La competizione dell'arbitro e' quella in cui ha diretto di piu': 586 arbitri su
      -- 681 ne hanno una sola, e per gli altri il metro giusto e' quella principale.
      principale as (
        select distinct on (referee_id) *
        from per_arbitro order by referee_id, gare desc, competition_id
      ),
      metro as (
        select competition_id, count(*) as colleghi,
               avg(falli) as falli, avg(gialli) as gialli, avg(rossi) as rossi
        from per_arbitro where gare >= ${GARE_MINIME} group by 1
      )
      select r.source_id::text, r.name, r.country_name,
             c.name as competizione, c.source_id::text as competition_source_id,
             p.gare::text, p.falli::text, p.gialli::text, p.rossi::text,
             p.falli_casa::text, p.falli_trasferta::text,
             p.gialli_casa::text, p.gialli_trasferta::text,
             m.falli::text as metro_falli, m.gialli::text as metro_gialli,
             m.rossi::text as metro_rossi, m.colleghi::text as colleghi,
             (select count(*) from per_arbitro q
               where q.competition_id = p.competition_id and q.gare >= ${GARE_MINIME}
                 and q.falli < p.falli)::text as sotto_falli,
             (select count(*) from per_arbitro q
               where q.competition_id = p.competition_id and q.gare >= ${GARE_MINIME}
                 and q.gialli < p.gialli)::text as sotto_gialli
      from principale p
      join football.referees r on r.id = p.referee_id
      join football.competitions c on c.id = p.competition_id
      left join metro m on m.competition_id = p.competition_id
      where r.source_id = ${sourceId}::bigint
    `;

    const riga = righe[0];
    if (riga === undefined) return null;

    const storico = await sql<RigaStoricoDb[]>`
      with per_gara as (${sql.unsafe(PER_GARA)})
      select g.source_id::text as match_source_id, g.kickoff_at::text,
             casa.name as casa, ospite.name as trasferta,
             p.falli::text, p.gialli::text, p.rossi::text
      from per_gara p
      join football.referees r on r.id = p.referee_id
      join football.matches g on g.id = p.match_id
      join football.teams casa on casa.id = g.home_team_id
      join football.teams ospite on ospite.id = g.away_team_id
      where r.source_id = ${sourceId}::bigint
      order by g.kickoff_at desc
      limit 20
    `;

    const colleghi = riga.colleghi === null ? 0 : Number(riga.colleghi);
    const posizione = (sotto: string | null): PosizioneFraColleghi | null =>
      colleghi < 3 || sotto === null ? null : { quota: Number(sotto) / colleghi, colleghi };

    return {
      sourceId,
      nome: riga.name,
      paese: riga.country_name,
      competizione: riga.competizione,
      competitionSourceId: riga.competition_source_id === null
        ? null : Number(riga.competition_source_id),
      gare: Number(riga.gare),
      media: {
        falli: numero(riga.falli), gialli: numero(riga.gialli), rossi: numero(riga.rossi),
      },
      falliControCasa: numero(riga.falli_casa),
      falliControTrasferta: numero(riga.falli_trasferta),
      gialliControCasa: numero(riga.gialli_casa),
      gialliControTrasferta: numero(riga.gialli_trasferta),
      metro: {
        falli: numero(riga.metro_falli),
        gialli: numero(riga.metro_gialli),
        rossi: numero(riga.metro_rossi),
      },
      posizioneFalli: posizione(riga.sotto_falli),
      posizioneGialli: posizione(riga.sotto_gialli),
      ultima: storico[0]?.kickoff_at ?? null,
      storico: storico.map((s) => ({
        matchSourceId: s.match_source_id === null ? null : Number(s.match_source_id),
        quando: s.kickoff_at,
        casa: s.casa,
        trasferta: s.trasferta,
        falli: numero(s.falli),
        gialli: numero(s.gialli),
        rossi: numero(s.rossi),
      })),
    };
  } catch {
    // Una pagina che non si puo' leggere non diventa una pagina inventata.
    return null;
  }
}

/** Le competizioni che hanno arbitri con abbastanza gare, dalla più coperta in giù. */
export async function competizioniConArbitri(): Promise<readonly CompetizioneConArbitri[]> {
  const sql = connessione();
  if (sql === null) return [];
  try {
    const righe = await sql<Array<{
      source_id: string | null; name: string; country_name: string | null;
      arbitri: string; gare: string; ultima: string;
    }>>`
      with per_gara as (${sql.unsafe(PER_GARA)}),
      per_arbitro as (
        select referee_id, competition_id, count(*) as gare, max(quando) as ultima
        from per_gara group by 1, 2
      )
      select c.source_id::text, c.name, c.country_name,
             count(*)::text as arbitri, sum(a.gare)::text as gare,
             max(a.ultima)::text as ultima
      from per_arbitro a
      join football.competitions c on c.id = a.competition_id
      where a.gare >= ${GARE_MINIME}
      group by 1, 2, 3
      having count(*) >= 3
      order by count(*) desc, c.name
    `;
    return righe
      .filter((r) => r.source_id !== null)
      .map((r) => ({
        sourceId: Number(r.source_id),
        nome: r.name,
        paese: r.country_name,
        arbitri: Number(r.arbitri),
        gare: Number(r.gare),
        ultima: r.ultima,
      }));
  } catch {
    return [];
  }
}

/** La classifica degli arbitri di una competizione, ordinata per la metrica scelta. */
export async function classificaArbitri(
  competitionSourceId: number,
  metrica: MetricaArbitro,
): Promise<readonly RigaClassifica[]> {
  const sql = connessione();
  if (sql === null) return [];
  try {
    const righe = await sql<Array<{
      source_id: string; name: string; country_name: string | null;
      gare: string; falli: string; gialli: string; rossi: string;
    }>>`
      with per_gara as (${sql.unsafe(PER_GARA)}),
      per_arbitro as (
        select referee_id, competition_id, count(*) as gare,
               avg(falli) as falli, avg(gialli) as gialli, avg(rossi) as rossi
        from per_gara group by 1, 2
      )
      select r.source_id::text, r.name, r.country_name,
             a.gare::text, a.falli::text, a.gialli::text, a.rossi::text
      from per_arbitro a
      join football.referees r on r.id = a.referee_id
      join football.competitions c on c.id = a.competition_id
      where c.source_id = ${competitionSourceId}::bigint and a.gare >= ${GARE_MINIME}
      order by ${sql.unsafe(COLONNA_ORDINE[metrica] ?? COLONNA_ORDINE.gialli)} desc, a.gare desc
      limit 60
    `;
    return righe.map((r) => ({
      sourceId: Number(r.source_id),
      nome: r.name,
      paese: r.country_name,
      gare: Number(r.gare),
      falli: numero(r.falli),
      gialli: numero(r.gialli),
      rossi: numero(r.rossi),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// La scheda dell'arbitro: stagione per stagione, competizione per competizione.
//
// **Sempre media a partita, mai un totale.** Un arbitro che ha 2.000 falli in carriera non
// dice niente finche' non si sa in quante gare: la scheda divide sempre, e mette il campione
// accanto al numero invece che in una nota.
//
// **Anche una gara sola fa una riga.** Deciso dall'utente il 28 agosto 2026: nascondere le
// competizioni con poche gare toglie proprio l'informazione che serve, cioe' che li' ha
// diretto. La media si mostra con il suo campione, e si aggiusta da se' quando le gare
// arrivano. Il campione e' scritto grande quanto la media, non in fondo.
//
// **Un'assenza non diventa mai uno zero.** Dove i falli non ci sono - succede: 26 coppie
// arbitro-competizione non ne hanno nessuno, altre 73 li hanno a meta' - la riga risponde
// `null` e la pagina scrive un trattino. Zero significa «nessun fallo fischiato», ed e' una
// cosa diversa da «non lo sappiamo».
//
// **Le gare si leggono una volta sola.** Nessun arbitro ne ha piu' di 48: si prendono tutte
// con una query indicizzata su `(referee_id, kickoff_at)` e si raggruppano qui, cosi'
// l'aggregazione e' una funzione pura che si prova senza livello dati.
// ---------------------------------------------------------------------------

/** Una gara diretta, con quanto serve per elencarla e per raggrupparla. */
export interface GaraDiretta {
  readonly matchSourceId: number | null;
  readonly quando: string;
  readonly competizione: string;
  readonly competitionSourceId: number | null;
  readonly seasonId: number;
  /** L'etichetta corta della stagione: `2026`, `26/27`. */
  readonly stagione: string;
  readonly stagioneCorrente: boolean;
  readonly casa: string;
  readonly trasferta: string;
  readonly golCasa: number | null;
  readonly golTrasferta: number | null;
  readonly golCasaPrimoTempo: number | null;
  readonly golTrasfertaPrimoTempo: number | null;
  /** `null` quando la gara non porta il dato da entrambi i lati: mai zero al suo posto. */
  readonly falli: number | null;
  readonly gialli: number | null;
  readonly rossi: number | null;
  /** I due lati separati: servono alle quote casa/trasferta, che sono una ripartizione. */
  readonly falliCasa: number | null;
  readonly falliTrasferta: number | null;
  readonly gialliCasa: number | null;
  readonly gialliTrasferta: number | null;
}

/** Una riga della tabella stagione per competizione. Ogni valore e' gia' diviso per gara. */
export interface RigaStagioneCompetizione {
  readonly seasonId: number;
  readonly stagione: string;
  readonly stagioneCorrente: boolean;
  readonly competizione: string;
  readonly competitionSourceId: number | null;
  readonly partite: number;
  readonly falli: number | null;
  /** Su quante di quelle partite il dato dei falli c'e' davvero. */
  readonly partiteConFalli: number;
  readonly gialli: number | null;
  readonly partiteConGialli: number;
  /** Quanti falli fischia per ogni ammonizione che estrae: alto = lascia correre. */
  readonly falliPerAmmonizione: number | null;
  readonly rossi: number | null;
  readonly partiteConRossi: number;
  /** Quota dei gialli andata alla squadra di casa, da 0 a 1. `null` se non ne ha estratti. */
  readonly quotaGialliCasa: number | null;
  readonly quotaFalliCasa: number | null;
  readonly ultima: string;
}

/** Le medie di un insieme di gare, con il campione di ciascuna metrica. */
export interface MedieDelPeriodo {
  readonly partite: number;
  readonly falli: number | null;
  readonly partiteConFalli: number;
  readonly gialli: number | null;
  readonly partiteConGialli: number;
  readonly rossi: number | null;
  readonly partiteConRossi: number;
}

function media(valori: readonly (number | null)[]): { media: number | null; campione: number } {
  const buoni = valori.filter((v): v is number => v !== null);
  if (buoni.length === 0) return { media: null, campione: 0 };
  return { media: buoni.reduce((a, b) => a + b, 0) / buoni.length, campione: buoni.length };
}

/** Le medie a partita di un gruppo di gare. Ogni metrica porta il campione che ha davvero. */
export function medieDelPeriodo(gare: readonly GaraDiretta[]): MedieDelPeriodo {
  const falli = media(gare.map((g) => g.falli));
  const gialli = media(gare.map((g) => g.gialli));
  const rossi = media(gare.map((g) => g.rossi));
  return {
    partite: gare.length,
    falli: falli.media, partiteConFalli: falli.campione,
    gialli: gialli.media, partiteConGialli: gialli.campione,
    rossi: rossi.media, partiteConRossi: rossi.campione,
  };
}

/** La quota del lato casa su un totale che e' la somma dei due lati. */
function quotaCasa(
  gare: readonly GaraDiretta[],
  casa: (g: GaraDiretta) => number | null,
  ospite: (g: GaraDiretta) => number | null,
): number | null {
  let sommaCasa = 0;
  let sommaOspite = 0;
  let viste = 0;
  for (const g of gare) {
    const c = casa(g);
    const o = ospite(g);
    if (c === null || o === null) continue;
    sommaCasa += c;
    sommaOspite += o;
    viste += 1;
  }
  const totale = sommaCasa + sommaOspite;
  // Nessuna gara con il dato, o nessun cartellino estratto: non c'e' niente da ripartire.
  if (viste === 0 || totale <= 0) return null;
  return sommaCasa / totale;
}

/**
 * Le gare raggruppate per stagione e competizione, dalla piu' recente.
 *
 * Funzione pura: le prove non chiedono il livello dati. L'ordine e' quello della scheda -
 * prima la stagione piu' recente, e dentro la stagione prima la competizione con piu' gare,
 * perche' e' quella in cui il numero regge di piu'.
 */
export function perStagioneCompetizione(
  gare: readonly GaraDiretta[],
): readonly RigaStagioneCompetizione[] {
  const gruppi = new Map<string, GaraDiretta[]>();
  for (const g of gare) {
    const chiave = `${g.seasonId}|${g.competizione}`;
    const dentro = gruppi.get(chiave);
    if (dentro === undefined) gruppi.set(chiave, [g]);
    else dentro.push(g);
  }

  const righe = [...gruppi.values()].map((gruppo): RigaStagioneCompetizione => {
    const primo = gruppo[0]!;
    const m = medieDelPeriodo(gruppo);
    return {
      seasonId: primo.seasonId,
      stagione: primo.stagione,
      stagioneCorrente: primo.stagioneCorrente,
      competizione: primo.competizione,
      competitionSourceId: primo.competitionSourceId,
      partite: gruppo.length,
      falli: m.falli, partiteConFalli: m.partiteConFalli,
      gialli: m.gialli, partiteConGialli: m.partiteConGialli,
      rossi: m.rossi, partiteConRossi: m.partiteConRossi,
      // Falli per ammonizione: dove non ammonisce mai la divisione non esiste, e la riga lo
      // dice con un trattino invece di stampare un infinito o uno zero.
      falliPerAmmonizione: m.falli === null || m.gialli === null || m.gialli <= 0
        ? null : m.falli / m.gialli,
      quotaGialliCasa: quotaCasa(gruppo, (g) => g.gialliCasa, (g) => g.gialliTrasferta),
      quotaFalliCasa: quotaCasa(gruppo, (g) => g.falliCasa, (g) => g.falliTrasferta),
      ultima: gruppo.reduce((piu, g) => (g.quando > piu ? g.quando : piu), primo.quando),
    };
  });

  return righe.sort((a, b) =>
    b.ultima.localeCompare(a.ultima) || b.partite - a.partite
      || a.competizione.localeCompare(b.competizione));
}

/**
 * L'etichetta corta della stagione: `2026` per le stagioni solari, `25/26` per quelle a
 * cavallo d'anno.
 *
 * **Si ricava dalle date, non dal nome**, e non e' un vezzo: nel livello dati **7.892 gare
 * arbitrate su 9.384** stanno in stagioni che si chiamano «Stagione 29 (segnaposto locale)».
 * `starts_on` e `ends_on` invece ci sono sempre, quindi l'etichetta regge anche dove il nome
 * non dice niente. Il nome resta l'ultimo ripiego, per il caso in cui manchino pure le date.
 */
export function etichettaStagione(
  tipo: string | null,
  inizio: string | null,
  fine: string | null,
  nome: string,
): string {
  const annoInizio = inizio?.slice(0, 4);
  const annoFine = fine?.slice(0, 4);
  if (tipo === "cross_year" && annoInizio !== undefined && annoFine !== undefined) {
    return `${annoInizio.slice(2)}/${annoFine.slice(2)}`;
  }
  const solare = annoFine ?? annoInizio;
  if (solare !== undefined) return solare;
  const ultimo = nome.trim().split(/\s+/).at(-1) ?? nome;
  return /^\d{4}$/.test(ultimo) || /^\d{2}\/\d{2}$/.test(ultimo) ? ultimo : nome;
}

interface RigaGaraDb {
  readonly match_source_id: string | null;
  readonly quando: string;
  readonly competizione: string;
  readonly competition_source_id: string | null;
  readonly season_id: string;
  readonly stagione: string;
  readonly stagione_tipo: string | null;
  readonly stagione_inizio: string | null;
  readonly stagione_fine: string | null;
  readonly stagione_corrente: boolean;
  readonly casa: string;
  readonly trasferta: string;
  readonly gol_casa: string | null;
  readonly gol_trasferta: string | null;
  readonly gol_casa_pt: string | null;
  readonly gol_trasferta_pt: string | null;
  readonly falli: string | null;
  readonly gialli: string | null;
  readonly rossi: string | null;
  readonly falli_casa: string | null;
  readonly falli_trasferta: string | null;
  readonly gialli_casa: string | null;
  readonly gialli_trasferta: string | null;
}

function forse(valore: string | null): number | null {
  return valore === null ? null : Number(valore);
}

/**
 * Tutte le gare che un arbitro ha diretto e di cui abbiamo entrambe le squadre.
 *
 * Il filtro sull'arbitro sta **prima** del raggruppamento e passa dall'indice parziale
 * `(referee_id, kickoff_at)`: si toccano le righe di un arbitro, non le ventunmila della
 * tavola. Il tetto e' quarantotto gare, quindi il raggruppamento per stagione e competizione
 * si fa fuori di qui.
 *
 * Una metrica vale solo se la portano **entrambi** i lati: con una riga sola il totale della
 * gara sarebbe dimezzato senza che si veda. In quel caso la metrica e' `null` - non zero - e
 * la gara resta nell'elenco, perche' averla diretta e' un fatto anche se i falli non li
 * sappiamo.
 */
export async function gareDirette(sourceId: number): Promise<readonly GaraDiretta[]> {
  const sql = connessione();
  if (sql === null) return [];
  try {
    const righe = await sql<RigaGaraDb[]>`
      with per_gara as (
        select o.match_id,
               case when count(*) filter (where o.fouls is not null) = 2
                    then sum(o.fouls) end as falli,
               case when count(*) filter (where o.yellow_cards is not null) = 2
                    then sum(o.yellow_cards) end as gialli,
               case when count(*) filter (where o.red_cards_direct is not null
                                             or o.second_yellow_red is not null) = 2
                    then sum(coalesce(o.red_cards_direct, 0)
                             + coalesce(o.second_yellow_red, 0)) end as rossi,
               sum(o.fouls) filter (where o.side = 'home') as falli_casa,
               sum(o.fouls) filter (where o.side = 'away') as falli_trasferta,
               sum(o.yellow_cards) filter (where o.side = 'home') as gialli_casa,
               sum(o.yellow_cards) filter (where o.side = 'away') as gialli_trasferta
        from football.team_match_observations o
        where o.referee_id = (
          select id from football.referees where source_id = ${sourceId}::bigint
        )
        group by 1
        having count(*) = 2
      )
      select g.source_id::text as match_source_id, g.kickoff_at::text as quando,
             c.name as competizione, c.source_id::text as competition_source_id,
             s.id::text as season_id, s.name as stagione,
             s.season_kind as stagione_tipo,
             s.starts_on::text as stagione_inizio, s.ends_on::text as stagione_fine,
             s.is_current as stagione_corrente,
             casa.name as casa, ospite.name as trasferta,
             g.home_score::text as gol_casa, g.away_score::text as gol_trasferta,
             g.home_score_halftime::text as gol_casa_pt,
             g.away_score_halftime::text as gol_trasferta_pt,
             p.falli::text, p.gialli::text, p.rossi::text,
             p.falli_casa::text, p.falli_trasferta::text,
             p.gialli_casa::text, p.gialli_trasferta::text
      from per_gara p
      join football.matches g on g.id = p.match_id
      join football.competitions c on c.id = g.competition_id
      join football.seasons s on s.id = g.season_id
      join football.teams casa on casa.id = g.home_team_id
      join football.teams ospite on ospite.id = g.away_team_id
      order by g.kickoff_at desc
    `;
    return righe.map((r) => ({
      matchSourceId: r.match_source_id === null ? null : Number(r.match_source_id),
      quando: r.quando,
      competizione: r.competizione,
      competitionSourceId: r.competition_source_id === null
        ? null : Number(r.competition_source_id),
      seasonId: Number(r.season_id),
      stagione: etichettaStagione(
        r.stagione_tipo, r.stagione_inizio, r.stagione_fine, r.stagione),
      stagioneCorrente: r.stagione_corrente,
      casa: r.casa,
      trasferta: r.trasferta,
      golCasa: forse(r.gol_casa),
      golTrasferta: forse(r.gol_trasferta),
      golCasaPrimoTempo: forse(r.gol_casa_pt),
      golTrasfertaPrimoTempo: forse(r.gol_trasferta_pt),
      falli: forse(r.falli),
      gialli: forse(r.gialli),
      rossi: forse(r.rossi),
      falliCasa: forse(r.falli_casa),
      falliTrasferta: forse(r.falli_trasferta),
      gialliCasa: forse(r.gialli_casa),
      gialliTrasferta: forse(r.gialli_trasferta),
    }));
  } catch {
    // Una scheda che non si puo' leggere non diventa una scheda inventata.
    return [];
  }
}

/**
 * Da dove vengono le due medie che il banner della gara mostra.
 *
 * Deciso dall'utente il 28 agosto 2026, con i numeri davanti: in stagione corrente ci sono
 * 1.490 gare arbitrate e 425 direttori, ma la **mediana e' una gara sola** e appena cento
 * arrivano a cinque. Mostrare «la stagione» a tutti significherebbe pubblicare una media
 * calcolata su una partita nella maggioranza dei casi. Quindi: la stagione quando regge, il
 * nostro storico quando no, e **il banner dice sempre quale delle due sta leggendo** - la
 * stessa disciplina gia' adottata per la provenienza dell'allenatore.
 */
export type ProvenienzaMedie = "stagione" | "competizione" | "tutte";

export interface MedieBanner extends MedieDelPeriodo {
  readonly provenienza: ProvenienzaMedie;
  /** Quante gare ha in questa stagione, anche quando si ripiega. */
  readonly partiteInStagione: number;
  /** L'etichetta della stagione corrente, quando ce n'e' una. */
  readonly stagione: string | null;
}

/** Sotto questo campione la stagione corrente non regge una media, e si ripiega. */
export const GARE_MINIME_BANNER = 5;

/**
 * Le medie del banner, con la loro provenienza. `null` quando non abbiamo nessuna gara.
 *
 * **Il ripiego resta dentro la stessa competizione** finche' puo'. Il motivo e' un errore
 * vero, trovato misurando: mostrare la media di tutte le sue gare accanto al metro di questa
 * lega puo' produrre un «severo» sopra un numero piu' basso della media dei colleghi, che
 * chi legge non puo' che prendere per un difetto. Numero e giudizio devono uscire dalle
 * stesse gare, quindi si scende un gradino per volta: la stagione qui, poi tutta la
 * competizione qui, e solo alla fine tutte le competizioni - dove pero' il metro di questa
 * lega non si applica piu' e il giudizio non si da'.
 */
export function medieDaMostrare(
  gare: readonly GaraDiretta[],
  competitionSourceId: number | null,
): MedieBanner | null {
  if (gare.length === 0) return null;
  const inLega = competitionSourceId === null
    ? [] : gare.filter((g) => g.competitionSourceId === competitionSourceId);
  const inStagione = inLega.filter((g) => g.stagioneCorrente);
  const stagione = inStagione[0]?.stagione ?? gare.find((g) => g.stagioneCorrente)?.stagione
    ?? null;
  const scelte = inStagione.length >= GARE_MINIME_BANNER ? inStagione
    : inLega.length > 0 ? inLega : gare;
  return {
    ...medieDelPeriodo(scelte),
    provenienza: inStagione.length >= GARE_MINIME_BANNER ? "stagione"
      : inLega.length > 0 ? "competizione" : "tutte",
    partiteInStagione: inStagione.length,
    stagione,
  };
}

// ---------------------------------------------------------------------------
// Il metro della lega, e il giudizio che ne esce.
//
// **Il metro e' la media della competizione**, deciso dall'utente il 28 agosto 2026:
// severo o clemente non ha senso in assoluto, ha senso rispetto a dove arbitra. Fra i 515
// arbitri con almeno cinque gare, chi sta nel quintile alto della **sua** lega va da 2,85 a
// 7,80 gialli a partita e chi sta nel quintile basso da 1,20 a 4,50: gli intervalli si
// sovrappongono, quindi lo stesso 4,50 e' permissivo in un torneo e severo in un altro.
//
// **Quanto sopra la media significa «severo» non lo decidiamo noi.** Fra arbitri della
// stessa lega le medie hanno una dispersione di 0,71 gialli - il 18% del metro - e 1,93
// falli, l'8%. La soglia e' mezza dispersione: chi la supera e' circa il terzo piu' alto
// della sua competizione. Se domani gli arbitri si somigliassero di piu', la soglia si
// stringerebbe da sola, perche' e' calcolata sulla distribuzione vera e non scritta a mano.
//
// **L'etichetta compare da una gara**, per decisione dell'utente, e si aggiusta man mano che
// le gare arrivano. Il costo e' misurato e va detto in pagina, non nascosto: i gialli di uno
// stesso arbitro variano da gara a gara con una deviazione di 1,94, quindi con una gara sola
// l'etichetta e' quasi solo quella partita, e puo' ribaltarsi. Per questo il campione sta
// sempre accanto all'etichetta.
// ---------------------------------------------------------------------------

export type Giudizio = "severo" | "in linea" | "permissivo";

export interface MetroDiLega {
  /** La media della competizione, per gara. */
  readonly gialli: number;
  readonly falli: number | null;
  /** Quanto si discostano fra loro gli arbitri di questa competizione. */
  readonly dispersioneGialli: number | null;
  readonly dispersioneFalli: number | null;
  /**
   * Quanta parte dei cartellini va alla squadra di casa, in media fra i colleghi.
   *
   * La scheda dell'arbitro mostra gia' la sua quota, ma senza questo numero «il 58% dei
   * gialli va ai padroni di casa» non dice niente: puo' essere tanto o pochissimo secondo
   * la lega. E' la stessa mancanza che aveva il giudizio prima del 28 agosto.
   *
   * E' la media **delle quote dei singoli arbitri**, non la quota complessiva del torneo:
   * cosi' ogni direttore pesa uno, come nella dispersione che le sta accanto.
   */
  readonly quotaGialliCasa: number | null;
  readonly dispersioneQuotaGialliCasa: number | null;
  readonly quotaFalliCasa: number | null;
  readonly dispersioneQuotaFalliCasa: number | null;
  readonly gare: number;
  readonly arbitri: number;
  /** `true` se il metro e' della stagione, `false` se ha ripiegato su tutta la competizione. */
  readonly dellaStagione: boolean;
}

/** Sotto queste gare il metro di una stagione non regge e si guarda tutta la competizione. */
const GARE_MINIME_METRO = 20;

/** Quante dispersioni sopra o sotto il metro separano un giudizio dal successivo. */
const SOGLIA_IN_DISPERSIONI = 0.5;

/**
 * Severo, in linea o permissivo rispetto al metro della sua competizione.
 *
 * `null` quando non c'e' un metro con cui confrontarsi, o quando gli arbitri della lega sono
 * troppo pochi per sapere quanto si somigliano: senza dispersione la soglia sarebbe un
 * numero deciso a tavolino, ed e' esattamente quello che non facciamo.
 */
export function giudizioSulMetro(
  media: number | null,
  metro: number | null,
  dispersione: number | null,
): Giudizio | null {
  if (media === null || metro === null || dispersione === null || dispersione <= 0) return null;
  const soglia = dispersione * SOGLIA_IN_DISPERSIONI;
  if (media >= metro + soglia) return "severo";
  if (media <= metro - soglia) return "permissivo";
  return "in linea";
}

interface RigaMetroDb {
  readonly competition_source_id: string | null;
  readonly season_id: string | null;
  readonly gialli: string | null;
  readonly falli: string | null;
  readonly sd_gialli: string | null;
  readonly sd_falli: string | null;
  readonly q_gialli_casa: string | null;
  readonly sd_q_gialli_casa: string | null;
  readonly q_falli_casa: string | null;
  readonly sd_q_falli_casa: string | null;
  readonly gare: string;
  readonly arbitri: string;
}

/**
 * I metri delle competizioni toccate da una scheda, in una lettura sola.
 *
 * La chiave della mappa e' `competizione|stagione`; c'e' anche `competizione|` con il metro
 * di tutta la competizione, che serve alle stagioni troppo corte. Delle 55 coppie
 * competizione-stagione osservate, 47 arrivano a venti gare e la mediana e' 230.
 */
export async function metriDiLega(
  competizioni: readonly number[],
): Promise<ReadonlyMap<string, MetroDiLega>> {
  const sql = connessione();
  if (sql === null || competizioni.length === 0) return new Map();
  try {
    const righe = await sql<RigaMetroDb[]>`
      with per_gara as (
        select o.match_id, o.competition_id, o.season_id, o.referee_id,
               case when count(*) filter (where o.fouls is not null) = 2
                    then sum(o.fouls) end as falli,
               case when count(*) filter (where o.yellow_cards is not null) = 2
                    then sum(o.yellow_cards) end as gialli,
               -- I due lati servono alla quota: quanta parte di quel totale e' andata a
               -- chi giocava in casa. Il vincolo dei due lati e' lo stesso del totale,
               -- perche' una quota su meta' gara non e' una quota.
               case when count(*) filter (where o.yellow_cards is not null) = 2
                    then sum(o.yellow_cards) filter (where o.side = 'home') end
                    as gialli_casa,
               case when count(*) filter (where o.fouls is not null) = 2
                    then sum(o.fouls) filter (where o.side = 'home') end as falli_casa
        from football.team_match_observations o
        join football.competitions c on c.id = o.competition_id
        where c.source_id = any(${competizioni}::bigint[])
        group by 1, 2, 3, 4
        having count(*) = 2
      ),
      -- La dispersione e' fra gli arbitri, non fra le gare: dice quanto si somigliano i
      -- direttori di quella lega, ed e' cio' su cui si taglia il giudizio. Gli arbitri con
      -- meno di cinque gare non entrano nel metro, perche' la loro media e' ancora rumore.
      per_arbitro as (
        select competition_id, season_id, referee_id, count(*) as gare,
               avg(gialli) as gialli, avg(falli) as falli,
               -- La quota si fa sui totali dell'arbitro, non come media di quote di
               -- singole gare: una partita da un cartellino solo peserebbe quanto una da
               -- otto. Nulla quando non ne ha estratti: niente da ripartire, non zero.
               case when sum(gialli) > 0 then sum(gialli_casa) / sum(gialli) end
                    as quota_gialli_casa,
               case when sum(falli) > 0 then sum(falli_casa) / sum(falli) end
                    as quota_falli_casa
        -- **Un arbitro pesa uno, anche nel metro di tutta la competizione.** Prima questa
        -- riga raggruppava per stagione e la dispersione sommava i due insiemi: chi aveva
        -- diretto in due stagioni entrava due volte, con due medie diverse. Misurato su una
        -- competizione reale: **42 voci per 34 arbitri**. Ora l'insieme «tutta la
        -- competizione» ha una riga per arbitro, con la stagione vuota, e la
        -- distribuzione sotto la raccoglie senza doppioni.
        from per_gara where referee_id is not null
        group by grouping sets ((competition_id, season_id, referee_id),
                                (competition_id, referee_id))
      ),
      dispersione as (
        select competition_id, season_id,
               stddev_samp(gialli) as sd_gialli, stddev_samp(falli) as sd_falli,
               avg(quota_gialli_casa) as q_gialli_casa,
               stddev_samp(quota_gialli_casa) as sd_q_gialli_casa,
               avg(quota_falli_casa) as q_falli_casa,
               stddev_samp(quota_falli_casa) as sd_q_falli_casa,
               count(*) as arbitri
        from per_arbitro where gare >= ${GARE_MINIME} group by 1, 2
      ),
      metro as (
        select competition_id, season_id, avg(gialli) as gialli, avg(falli) as falli,
               count(*) as gare
        from per_gara group by grouping sets ((competition_id, season_id), (competition_id))
      )
      select c.source_id::text as competition_source_id, m.season_id::text,
             m.gialli::text, m.falli::text,
             d.sd_gialli::text, d.sd_falli::text,
             d.q_gialli_casa::text, d.sd_q_gialli_casa::text,
             d.q_falli_casa::text, d.sd_q_falli_casa::text,
             m.gare::text, coalesce(d.arbitri, 0)::text as arbitri
      from metro m
      join football.competitions c on c.id = m.competition_id
      left join dispersione d on d.competition_id = m.competition_id
        and d.season_id is not distinct from m.season_id
    `;
    const mappa = new Map<string, MetroDiLega>();
    for (const r of righe) {
      if (r.competition_source_id === null || r.gialli === null) continue;
      mappa.set(`${r.competition_source_id}|${r.season_id ?? ""}`, {
        gialli: Number(r.gialli),
        falli: r.falli === null ? null : Number(r.falli),
        dispersioneGialli: r.sd_gialli === null ? null : Number(r.sd_gialli),
        dispersioneFalli: r.sd_falli === null ? null : Number(r.sd_falli),
        quotaGialliCasa: r.q_gialli_casa === null ? null : Number(r.q_gialli_casa),
        dispersioneQuotaGialliCasa:
          r.sd_q_gialli_casa === null ? null : Number(r.sd_q_gialli_casa),
        quotaFalliCasa: r.q_falli_casa === null ? null : Number(r.q_falli_casa),
        dispersioneQuotaFalliCasa:
          r.sd_q_falli_casa === null ? null : Number(r.sd_q_falli_casa),
        gare: Number(r.gare),
        arbitri: Number(r.arbitri),
        dellaStagione: r.season_id !== null,
      });
    }
    return mappa;
  } catch {
    return new Map();
  }
}

/**
 * Il metro giusto per una riga: quello della sua stagione se ha abbastanza gare, altrimenti
 * quello di tutta la competizione. `null` quando non ne abbiamo nessuno dei due.
 */
export function metroPer(
  metri: ReadonlyMap<string, MetroDiLega>,
  competitionSourceId: number | null,
  seasonId: number,
): MetroDiLega | null {
  if (competitionSourceId === null) return null;
  const stagione = metri.get(`${competitionSourceId}|${seasonId}`);
  if (stagione !== undefined && stagione.gare >= GARE_MINIME_METRO
    && stagione.dispersioneGialli !== null) return stagione;
  return metri.get(`${competitionSourceId}|`) ?? stagione ?? null;
}
