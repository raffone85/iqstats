// Server-only: quante volte una linea succede davvero in quel campionato e in quella stagione.
//
// **Perche' esiste, e non e' un abbellimento.** «Under 5,5 fuorigioco al 70%» sembra una
// lettura forte finche' non si sa che in quella lega succede l'**87%** delle volte: il
// modello sta dicendo che questa gara ne fara' **piu'** del solito, e la pagina lo mostrava
// come una conferma. Misurato su 235 gare della competizione reale, due delle quattro
// letture in cima stavano **sotto** la frequenza normale: corner 70% contro 77%, fuorigioco
// 70% contro 87%. Non erano banali: erano girate al contrario.
//
// **Il conto e' sulle nostre righe**, come tutti gli aggregati che sappiamo fare: una gara
// entra solo se porta **entrambi** i lati, la stessa regola di `medieDiLato` e di
// `gareDirette`. Senza entrambi il totale sarebbe mezzo e il lato sarebbe senza avversario.
import "server-only";

import { connessione } from "./lettura.ts";

/** Da bersaglio del motore a colonna. Nessun nome di colonna arriva dall'indirizzo. */
const COLONNA: Readonly<Record<string, string>> = {
  total_shots: "total_shots",
  shots_on_target: "shots_on_target",
  corner_kicks: "corner_kicks",
  fouls: "fouls",
  yellow_cards: "yellow_cards",
  offsides: "offsides",
  goalkeeper_saves: "goalkeeper_saves",
};

export type LatoDiLinea = "casa" | "trasferta" | "totale";

export interface Richiesta {
  readonly target: string;
  readonly lato: LatoDiLinea;
  readonly soglia: number;
  /** `Over` guarda sopra la soglia, `Under` sotto: la base risponde alla stessa domanda. */
  readonly verso: "Over" | "Under";
}

export interface Base {
  /** Quante volte su cento quel verso si e' avverato, in quella lega e in quella stagione. */
  readonly quota: number;
  /** Su quante gare: sotto questo numero la base non e' una base. */
  readonly gare: number;
}

/** Sotto queste gare una frequenza non dice niente e si preferisce non dirla. */
const GARE_MINIME = 30;

/** La chiave con cui una richiesta si ritrova nella mappa. */
export function chiaveDi(r: { target: string; lato: LatoDiLinea; soglia: number; verso: "Over" | "Under" }): string {
  return `${r.target}|${r.lato}|${r.soglia}|${r.verso}`;
}

/**
 * La frequenza di ciascuna linea chiesta, o `null` se il livello dati non risponde.
 *
 * Una sola query: le espressioni si costruiscono dalle costanti qui sopra e dai numeri
 * delle soglie, mai da testo che arrivi da fuori.
 */
export async function baseDiLega(
  competitionSourceId: number,
  seasonSourceId: number,
  richieste: readonly Richiesta[],
): Promise<Map<string, Base> | null> {
  const sql = connessione();
  if (sql === null) return null;
  // Doppioni fuori: due richieste identiche darebbero due alias uguali e la query non
  // partirebbe. La chiave e' la stessa con cui il chiamante ritrova la risposta.
  const viste = new Set<string>();
  const valide = richieste.filter((r) => {
    if (COLONNA[r.target] === undefined || !Number.isFinite(r.soglia)) return false;
    const k = chiaveDi(r);
    if (viste.has(k)) return false;
    viste.add(k);
    return true;
  });
  if (valide.length === 0) return new Map();

  // Il valore di gara per lato: il lato di casa, quello di trasferta, la somma dei due.
  const perLato = (target: string, lato: LatoDiLinea) => {
    const c = COLONNA[target];
    if (lato === "casa") return `max(o.${c}) filter (where o.side = 'home')`;
    if (lato === "trasferta") return `max(o.${c}) filter (where o.side = 'away')`;
    return `sum(o.${c})`;
  };
  const colonne = [...new Set(valide.map((r) => `${r.target}|${r.lato}`))]
    .map((k) => {
      const [target, lato] = k.split("|") as [string, LatoDiLinea];
      return `${perLato(target, lato)} as v_${target}_${lato}`;
    })
    .join(",\n               ");

  const conti = valide
    .flatMap((r, i) => {
      const v = `v_${r.target}_${r.lato}`;
      const test = r.verso === "Over" ? `${v} > ${r.soglia}` : `${v} < ${r.soglia}`;
      return [
        `(avg((${test})::int) filter (where ${v} is not null))::text as q${i}`,
        `(count(*) filter (where ${v} is not null))::text as n${i}`,
      ];
    })
    .join(",\n           ");

  try {
    const righe = await sql<Record<string, string | null>[]>`
      with g as (
        select o.match_id,
               ${sql.unsafe(colonne)}
        from football.team_match_observations o
        join football.competitions c on c.id = o.competition_id
        join football.seasons s on s.id = o.season_id
        where c.source_id = ${competitionSourceId}::bigint
          and s.source_id = ${seasonSourceId}::bigint
        group by 1
        -- Entrambi i lati, sempre: mezza gara non entra in una frequenza.
        having count(*) = 2
      )
      select ${sql.unsafe(conti)}
      from g
    `;
    const riga = righe[0];
    if (riga === undefined) return null;
    const mappa = new Map<string, Base>();
    valide.forEach((r, i) => {
      const q = Number(riga[`q${i}`]);
      const n = Number(riga[`n${i}`]);
      if (!Number.isFinite(q) || !Number.isFinite(n) || n < GARE_MINIME) return;
      mappa.set(chiaveDi(r), { quota: q * 100, gare: n });
    });
    return mappa;
  } catch {
    // Una base che non si puo' leggere non diventa una base inventata.
    return null;
  }
}
