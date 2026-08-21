/**
 * Il livello dati, letto da un motore vero, riproduce l'ingresso di Python?
 *
 * `test:snapshot` risponde alla stessa domanda partendo dai file: ricostruisce
 * l'ingresso dalle osservazioni normalizzate e lo confronta con quello esportato dal
 * lato che addestra. Qui la materia e' la stessa ma la strada e' quella di produzione:
 * le righe arrivano da `football.team_match_observations` attraverso
 * `ProjectionObservationStore`, con il ruolo di sola lettura e le stesse interrogazioni
 * che l'applicazione fara'.
 *
 * Gli identificativi non coincidono fra i due mondi e non devono: il campione di
 * riscontro nomina le gare con l'identificativo della fonte, il database con il proprio.
 * La traduzione si legge da `football.matches` invece di essere assunta.
 *
 * La divergenza nota sulle medie di lega vale anche qui, per la stessa ragione gia'
 * misurata: il lato che addestra sposta di una riga e non di una gara. Il confronto
 * accetta il numero stretto oppure quello con la riga gemella, e nient'altro.
 *
 * Esecuzione: IQSTATS_DATABASE_URL=... npm run test:projection-store
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import postgres from "postgres";

import { ProjectionObservationStore } from "../src/server/iqstats/projection-store.ts";
import type { GaraDaPrevedere } from "../src/server/iqstats/projection-store.ts";
import { componiIngresso } from "../src/server/iqstats/projection/snapshot.ts";
import type { GaraPrecedente, Lato } from "../src/server/iqstats/projection/asof/contratto.ts";

const databaseUrl = process.env.IQSTATS_DATABASE_URL?.trim();

const ARTEFATTI = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "scripts",
  "projection",
  "models",
  "output",
  "artefatti",
);

/** Quante righe reali si verificano per bersaglio. */
const QUANTE = 6;
const TOLLERANZA = 1e-9;

interface Prova {
  readonly event_id: number;
  readonly lato: Lato;
  readonly ingresso: Record<string, unknown>;
}

function riscontri(): Array<{ readonly target: string; readonly prove: Prova[] }> {
  const trovati: Array<{ target: string; prove: Prova[] }> = [];
  for (const nome of readdirSync(ARTEFATTI)) {
    if (!nome.endsWith("-riscontro-asof.json")) continue;
    const documento = JSON.parse(readFileSync(join(ARTEFATTI, nome), "utf8")) as {
      target: string;
      prove: Prova[];
    };
    trovati.push({ target: documento.target, prove: documento.prove.slice(0, QUANTE) });
  }
  return trovati;
}

function vicini(ottenuto: number | null, atteso: number | null, dove: string): void {
  if (atteso === null || atteso === undefined) {
    assert.equal(ottenuto, null, dove + ": atteso assente, ottenuto " + String(ottenuto));
    return;
  }
  assert.notEqual(ottenuto, null, dove + ": atteso " + String(atteso) + ", ottenuto assente");
  const scarto = Math.abs((ottenuto as number) - atteso);
  const relativo = Math.abs(atteso) > 1 ? scarto / Math.abs(atteso) : scarto;
  assert.ok(
    relativo <= TOLLERANZA,
    dove + ": atteso " + String(atteso) + ", ottenuto " + String(ottenuto),
  );
}

interface RigaGara {
  readonly id: string;
  readonly source_id: string;
  readonly season_id: string;
  readonly home_team_id: string;
  readonly away_team_id: string;
  readonly referee_id: string | null;
  readonly kickoff_at: string;
  readonly round_number: number | null;
  readonly is_derby: boolean | null;
  readonly home_coach: string | null;
  readonly away_coach: string | null;
}

/**
 * Quanti confronti sono stati fatti davvero: un test che salta in silenzio dice verde
 * senza aver guardato niente.
 */
const contati = { righe: 0, gare: 0, contesto: 0, arbitri: 0, rose: 0, campiRosa: 0 };

test(
  "il livello dati riproduce l'ingresso di Python leggendo dal database",
  { skip: !databaseUrl },
  async (t) => {
    assert.ok(databaseUrl);
    const sql = postgres(databaseUrl, {
      max: 2,
      prepare: false,
      connection: {
        application_name: "iqstats-projection-store-test",
        default_transaction_read_only: true,
        statement_timeout: 60_000,
        role: "iqstats_app_reader",
      },
      onnotice: () => undefined,
    });

    try {
      const sessione = await sql<
        { readonly reader_role: boolean; readonly can_insert: boolean }[]
      >`
        select current_user = 'iqstats_app_reader' as reader_role,
               has_table_privilege(
                 current_user, 'football.team_match_observations', 'INSERT'
               ) as can_insert
      `;
      assert.ok(sessione[0]?.reader_role, "il test non gira con il ruolo di sola lettura");
      assert.equal(sessione[0]?.can_insert, false, "il ruolo di lettura puo' scrivere");

      const casi = riscontri();
      assert.equal(casi.length, 7, "attesi sette campioni di riscontro");

      const store = new ProjectionObservationStore(sql);

      for (const caso of casi) {
        for (const prova of caso.prove) {
          const righe = await sql<RigaGara[]>`
            select m.id, m.source_id, m.season_id, m.home_team_id, m.away_team_id,
                   m.referee_id, m.kickoff_at, o.round_number, o.is_derby,
                   max(o.coach_source_id) filter (where o.side = 'home') over () as home_coach,
                   max(o.coach_source_id) filter (where o.side = 'away') over () as away_coach
            from football.matches m
            join football.team_match_observations o
              on o.match_id = m.id and o.side = ${prova.lato}
            where m.source_id = ${prova.event_id}::bigint
          `;
          const gara = righe[0];
          assert.ok(gara !== undefined, "gara assente nel database: " + String(prova.event_id));

          const daPrevedere: GaraDaPrevedere = {
            matchId: Number(gara.id),
            seasonId: Number(gara.season_id),
            kickoffAt: gara.kickoff_at,
            homeTeamId: Number(gara.home_team_id),
            awayTeamId: Number(gara.away_team_id),
            refereeId: gara.referee_id === null ? null : Number(gara.referee_id),
            homeCoachSourceId: gara.home_coach === null ? null : Number(gara.home_coach),
            awayCoachSourceId: gara.away_coach === null ? null : Number(gara.away_coach),
            roundNumber: gara.round_number,
            isDerby: gara.is_derby,
          };

          const materiale = await store.materiale(daPrevedere, prova.lato);
          const composto = componiIngresso(materiale, caso.target);
          const atteso = prova.ingresso;
          const dove = caso.target + " " + String(prova.event_id) + " " + prova.lato;
          contati.righe += 1;

          // Il taglio temporale, prima di tutto il resto.
          for (const elenco of [materiale.squadra, materiale.avversario, materiale.lega]) {
            for (const precedente of elenco) {
              assert.notEqual(
                precedente.matchId,
                daPrevedere.matchId,
                dove + ": la gara stessa e' entrata",
              );
            }
          }

          for (const nome of ["squadra", "avversario", "allenatore"] as const) {
            const attese = atteso[nome] as Array<Record<string, unknown>>;
            const ottenute: GaraPrecedente[] = composto[nome] ?? [];
            assert.equal(ottenute.length, attese.length, dove + ": numero di gare in " + nome);
            for (let indice = 0; indice < attese.length; indice += 1) {
              const attesa = attese[indice];
              const ottenuta = ottenute[indice];
              contati.gare += 1;
              assert.equal(ottenuta.quando, attesa.quando, dove + ": istante in " + nome);
              assert.equal(ottenuta.lato, attesa.lato, dove + ": lato in " + nome);
              vicini(ottenuta.prodotto, attesa.prodotto as number | null, dove + " prodotto");
              vicini(ottenuta.concesso, attesa.concesso as number | null, dove + " concesso");
              vicini(ottenuta.punti, attesa.punti as number | null, dove + " punti");
              vicini(ottenuta.retiFatte, attesa.retiFatte as number | null, dove + " retiFatte");
              vicini(
                ottenuta.retiSubite,
                attesa.retiSubite as number | null,
                dove + " retiSubite",
              );
              const contestoAtteso = attesa.contesto as Record<string, number | null> | undefined;
              if (contestoAtteso !== undefined) {
                const contestoOttenuto = ottenuta.contesto as Record<string, number | null>;
                for (const metrica of Object.keys(contestoAtteso)) {
                  contati.contesto += 1;
                  vicini(
                    contestoOttenuto[metrica] ?? null,
                    contestoAtteso[metrica],
                    dove + " contesto." + metrica,
                  );
                }
              }
            }
          }

          const arbitroAtteso = atteso.arbitro as Record<string, number | null> | null;
          if (arbitroAtteso !== null) {
            const ottenuto = composto.arbitro as unknown as Record<string, number | null>;
            assert.ok(ottenuto !== null, dove + ": profilo arbitro assente");
            contati.arbitri += 1;
            for (const campo of Object.keys(arbitroAtteso)) {
              vicini(ottenuto[campo], arbitroAtteso[campo], dove + " arbitro." + campo);
            }
          }

          const rosaAttesa = atteso.rosa as Record<string, number | null> | null;
          if (rosaAttesa !== null && materiale.giocatori.length > 0) {
            const ottenuta = composto.rosa as unknown as Record<string, number | null>;
            contati.rose += 1;
            for (const campo of Object.keys(rosaAttesa)) {
              if (ottenuta[campo] === undefined) continue;
              contati.campiRosa += 1;
              vicini(ottenuta[campo], rosaAttesa[campo], dove + " rosa." + campo);
            }
          }

          // Le medie di lega separate per lato di campo: il lato separa le due righe di
          // una gara in gruppi diversi, quindi la riga gemella non entra mai e i due
          // numeri devono coincidere sempre.
          //
          // Sulle medie non separate per lato la divergenza e' nota, misurata e
          // dichiarata al §9bis: il lato che addestra sposta di una riga e non di una
          // gara. Ricostruirla richiede la riga della gara stessa, che questo livello
          // dati non restituisce per costruzione. La verifica riga per riga vive in
          // `test:snapshot`, che legge l'archivio intero: qui non si finge di rifarla.
          const attesaLega = atteso.lega as Record<string, number | null>;
          const stretta = composto.lega;
          vicini(stretta.latoMedia, attesaLega.latoMedia, dove + " lega.latoMedia");
          vicini(stretta.latoCampione, attesaLega.latoCampione, dove + " lega.latoCampione");
        }
      }
    } finally {
      await sql.end({ timeout: 5 });
    }

    t.diagnostic(
      "confrontati dal database: " + String(contati.righe) + " righe, "
      + String(contati.gare) + " gare, " + String(contati.contesto) + " metriche di contesto, "
      + String(contati.arbitri) + " profili d'arbitro, " + String(contati.rose) + " rose per "
      + String(contati.campiRosa) + " campi",
    );
    assert.ok(contati.righe >= 40, "righe confrontate: " + String(contati.righe));
    assert.ok(contati.gare > 200, "gare confrontate: " + String(contati.gare));
    assert.ok(contati.contesto > 500, "metriche di contesto: " + String(contati.contesto));
    assert.ok(contati.arbitri > 20, "profili arbitro: " + String(contati.arbitri));
    assert.ok(contati.campiRosa > 200, "campi di rosa: " + String(contati.campiRosa));
  },
);
