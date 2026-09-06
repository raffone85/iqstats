// Server-only: da dove tira una squadra, e da dove concede di tirare.
//
// **Non e' una previsione e non tocca il motore.** Sono gare gia' giocate: si dice
// dove quella squadra mette le sue conclusioni rispetto a come si tira di solito in
// quella competizione. Nessuna probabilita', nessun mercato.
//
// **Da dove vengono i numeri.** Da `football.team_match_shots`, caricata dal dataset
// che `build_shots.py` aveva gia' costruito per il motore: 255.156 tiri su 10.977
// gare, 19.739 righe squadra-gara. Il motore le usa gia' come feature; qui si
// mostrano. Nessuna chiamata nuova alla fonte.
//
// **Il metro e' la competizione, non una soglia scelta.** Vale la stessa ragione del
// ritmo per tempo: una quota in area del 63% non e' alta o bassa in assoluto, lo e'
// rispetto a come si tira in quel campionato. Il metro si calcola sulla stessa
// finestra del campione, cosi' il confronto non misura il calendario.
//
// **Perche' queste cinque e non sei.** Misurato il 4 settembre 2026 su 427 squadre con
// almeno trenta gare, confrontando il verso dichiarato sulle prime dieci gare con il
// verso vero rispetto alla media di competizione: distanza media 86,7% di versi
// giusti, palla ferma 86,6%, qualita' 85,7%, quota in area 84,9%, gol attesi per tiro
// 80,4%. Dire sempre la stessa cosa ne azzecca fra il 50 e il 54%, quindi il test
// aggiunge informazione vera. La quota di tiri bloccati si ferma al 76,1% ed e' la
// piu' difficile da leggere: la colonna resta nel livello dati, fuori dalla pagina.
//
// **Quanto regge al variare del campione**, stessa misura a quattro, sei, otto e dieci
// gare - versi giusti fra le dichiarazioni:
//
//   grandezza   n=4     n=6     n=8     n=10
//   area        75,3%   76,2%   82,1%   84,9%
//   distanza    77,8%   84,5%   88,0%   86,7%
//   qualita'    76,2%   83,2%   85,0%   85,7%
//   fermo       74,4%   78,3%   81,3%   86,6%
//   peso        73,1%   77,7%   82,0%   80,4%
//
// A quattro gare si sbaglia verso una volta su quattro, contro una su due della
// costante: la soglia resta quattro perche' e' quella della scala di affidabilita' e
// l'etichetta «affidabilita' bassa» lo dichiara in pagina. Il salto vero e' fra quattro
// e sei: se un giorno si volesse una sezione piu' prudente, sei e' il punto.
//
// **Anti-leakage.** Finestra `kickoff_at < quando`, per il campione e per il metro.
import "server-only";

import { connessione } from "./lettura.ts";

/** Quante gare al massimo si guardano indietro per squadra. */
const MAX_GARE = 40;
/** Sotto queste gare non si dichiara niente: e' la soglia della scala di affidabilita'. */
const GARE_MINIME = 4;
/** Quante voci si mostrano per squadra: la comprensione, non la quantita'. */
const VOCI_MOSTRATE = 3;

/**
 * Le grandezze mostrate, con la parola che le descrive nei due versi.
 *
 * `sopra` e `sotto` non sono giudizi: dicono da che parte sta la squadra rispetto a
 * come si tira in quella competizione.
 */
const GRANDEZZE = [
  {
    chiave: "area",
    colonna: "share_in_box",
    nome: "conclusioni dall'area",
    quota: true,
    sopra: "conclude più da vicino della media",
    sotto: "conclude più da fuori della media",
  },
  {
    chiave: "distanza",
    colonna: "avg_distance",
    nome: "distanza del tiro",
    quota: false,
    sopra: "tira da più lontano della media",
    sotto: "tira da più vicino della media",
  },
  {
    chiave: "qualita",
    colonna: "share_quality",
    nome: "conclusioni di peso",
    quota: true,
    sopra: "cerca il tiro buono più della media",
    sotto: "tira anche da posizioni difficili",
  },
  {
    chiave: "fermo",
    colonna: "share_set_piece",
    nome: "tiri da palla ferma",
    quota: true,
    sopra: "vive più della media sulla palla ferma",
    sotto: "produce quasi tutto su azione",
  },
  {
    chiave: "peso",
    colonna: "xg_per_shot",
    nome: "peso medio del tiro",
    quota: false,
    sopra: "ogni suo tiro pesa più della media",
    sotto: "tira spesso da posizioni che pesano poco",
  },
] as const;

export interface VoceDiTiro {
  readonly chiave: string;
  readonly nome: string;
  /** La media della squadra su questa grandezza. */
  readonly valore: number;
  /** La stessa grandezza nella competizione, stessa finestra. */
  readonly metro: number;
  /** `true` quando lo scarto dal metro supera l'errore della media della squadra. */
  readonly oltreIlRumore: boolean;
  /** La frase gia' scritta per il verso, quando lo scarto regge. */
  readonly parola: string | null;
  /** Percentuale o metri: cambia come si scrive, non cosa vuol dire. */
  readonly quota: boolean;
}

export interface ProfiloDiTiro {
  readonly nome: string;
  /** Gare con una mappa dei tiri in questa finestra. */
  readonly gare: number;
  /** Quanti tiri stanno dietro a queste medie: una quota su pochi tiri oscilla. */
  readonly tiri: number;
  readonly voci: readonly VoceDiTiro[];
}

export interface DaDoveTirano {
  /** La frase che risponde alla domanda, gia' scritta. */
  readonly titolo: string;
  readonly casa: ProfiloDiTiro;
  readonly trasferta: ProfiloDiTiro;
}

function numero(valore: string | null | undefined): number | null {
  if (valore === null || valore === undefined) return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
}

/**
 * Il titolo del pannello dalle due letture.
 *
 * Pura: prende i due profili gia' misurati e non tocca il database, cosi' la regola si
 * prova senza. La frase dice **che partita sara'**, che e' quello che deve arrivare
 * per primo: se nessuna delle due si scosta, lo dichiara invece di inventare un verso.
 */
export function letturaDeiTiri(
  casa: ProfiloDiTiro,
  trasferta: ProfiloDiTiro,
): string {
  const parlaCasa = casa.voci.find((v) => v.oltreIlRumore);
  const parlaFuori = trasferta.voci.find((v) => v.oltreIlRumore);
  if (parlaCasa === undefined && parlaFuori === undefined) {
    return "Due squadre che concludono come si conclude in questa competizione";
  }
  if (parlaCasa !== undefined && parlaFuori === undefined) {
    return `${casa.nome} ${parlaCasa.parola}`;
  }
  if (parlaCasa === undefined && parlaFuori !== undefined) {
    return `${trasferta.nome} ${parlaFuori.parola}`;
  }
  // Entrambe si scostano: se lo fanno sulla stessa grandezza e nello stesso verso la
  // gara ha un carattere solo, altrimenti si dicono i due caratteri di fila.
  const a = parlaCasa as VoceDiTiro;
  const b = parlaFuori as VoceDiTiro;
  if (a.chiave === b.chiave && a.parola === b.parola) {
    return `Tutt'e due ${a.parola}`;
  }
  return `${casa.nome} ${a.parola}, ${trasferta.nome} ${b.parola}`;
}

/** Le voci di una squadra, ordinate per quanto si scostano dal metro. */
function vociDi(
  riga: Record<string, string | null>,
  metro: Record<string, number | null>,
): VoceDiTiro[] {
  const voci: VoceDiTiro[] = [];
  const gare = numero(riga.gare) ?? 0;
  for (const g of GRANDEZZE) {
    const valore = numero(riga[g.chiave]);
    const sd = numero(riga[`sd_${g.chiave}`]);
    const m = metro[g.chiave];
    if (valore === null || m === null) continue;
    const errore = sd === null || gare < 2 ? null : sd / Math.sqrt(gare);
    const oltre = errore !== null && Math.abs(valore - m) > errore;
    voci.push({
      chiave: g.chiave,
      nome: g.nome,
      valore,
      metro: m,
      oltreIlRumore: oltre,
      parola: oltre ? (valore > m ? g.sopra : g.sotto) : null,
      quota: g.quota,
    });
  }
  // Lo scarto si misura in unita' dell'errore della propria media, altrimenti metri e
  // percentuali non si confronterebbero fra loro.
  const peso = (v: VoceDiTiro): number =>
    v.metro === 0 ? 0 : Math.abs(v.valore - v.metro) / Math.abs(v.metro);
  return voci
    .sort((x, y) => {
      if (x.oltreIlRumore !== y.oltreIlRumore) return x.oltreIlRumore ? -1 : 1;
      return peso(y) - peso(x);
    })
    .slice(0, VOCI_MOSTRATE);
}

/**
 * Da dove tirano le due squadre, prima di `quando`.
 *
 * `stagioni` sono gli `source_id` scelti dalla finestra, come per le altre letture.
 */
export async function daDoveTirano(
  casaSourceId: number,
  trasfertaSourceId: number,
  competitionSourceId: number,
  stagioni: readonly number[],
  quando: string,
): Promise<DaDoveTirano | null> {
  const sql = connessione();
  if (sql === null || stagioni.length === 0) return null;

  const medie = GRANDEZZE
    .map((g) => `avg(s.${g.colonna})::text as ${g.chiave},
             stddev_samp(s.${g.colonna})::text as sd_${g.chiave}`)
    .join(",\n             ");
  const medieMetro = GRANDEZZE
    .map((g) => `avg(s.${g.colonna})::text as metro_${g.chiave}`)
    .join(",\n             ");

  const scelteSquadra = GRANDEZZE
    .map((g) => `p.${g.chiave}, p.sd_${g.chiave}`)
    .join(", ");
  const scelteMetro = GRANDEZZE.map((g) => `m.metro_${g.chiave}`).join(", ");

  try {
    const righe = await sql<Record<string, string | null>[]>`
      with lega as (
        select id from football.competitions where source_id = ${competitionSourceId}::bigint
      ), stagione as (
        select s.id
        from football.seasons s
        join lega l on l.id = s.competition_id
        where s.source_id = any(${stagioni as number[]}::bigint[])
      ), scelte as (
        select t.source_id as squadra, s.*,
               row_number() over (
                 partition by t.source_id order by s.kickoff_at desc
               ) as posto
        from football.team_match_shots s
        join football.teams t on t.id = s.team_id
        join football.matches m on m.id = s.match_id
        where t.source_id in (${casaSourceId}::bigint, ${trasfertaSourceId}::bigint)
          and s.kickoff_at < ${quando}::timestamptz
          and m.season_id in (select id from stagione)
      ), per_squadra as (
        select squadra,
               count(*)::text as gare,
               sum(shots_total)::text as tiri,
               ${sql.unsafe(medie)}
        from scelte s
        where posto <= ${MAX_GARE}
        group by squadra
      ), metro as (
        -- La popolazione con cui ci si confronta: tutte le gare della competizione
        -- nella stessa finestra, senza limite, perche' e' il metro e non un campione.
        select ${sql.unsafe(medieMetro)}
        from football.team_match_shots s
        join football.matches m on m.id = s.match_id
        where s.kickoff_at < ${quando}::timestamptz
          and m.season_id in (select id from stagione)
      )
      select p.squadra::text as squadra, p.gare, p.tiri,
             ${sql.unsafe(scelteSquadra)},
             ${sql.unsafe(scelteMetro)},
             t.name as nome
      from per_squadra p
      cross join metro m
      join football.teams t on t.source_id = p.squadra::bigint
    `;
    if (righe.length < 2) return null;

    const prima = righe[0];
    const metro: Record<string, number | null> = {};
    for (const g of GRANDEZZE) metro[g.chiave] = numero(prima[`metro_${g.chiave}`]);

    const profilo = (sourceId: number): ProfiloDiTiro | null => {
      const r = righe.find((x) => Number(x.squadra) === sourceId);
      if (r === undefined) return null;
      const gare = numero(r.gare) ?? 0;
      if (gare < GARE_MINIME) return null;
      return {
        nome: r.nome ?? "",
        gare,
        tiri: numero(r.tiri) ?? 0,
        voci: vociDi(r, metro),
      };
    };

    const casa = profilo(casaSourceId);
    const trasferta = profilo(trasfertaSourceId);
    if (casa === null || trasferta === null) return null;

    return { titolo: letturaDeiTiri(casa, trasferta), casa, trasferta };
  } catch {
    // Una mappa che non si riesce a leggere non diventa una mappa inventata.
    return null;
  }
}
