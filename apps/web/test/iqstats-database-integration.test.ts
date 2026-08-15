import assert from "node:assert/strict";
import test from "node:test";

import postgres from "postgres";

import { DatabaseIqstatsGateway } from "../src/server/iqstats/database-gateway.ts";
import { PostgresFootballDataStore } from "../src/server/iqstats/database-store.ts";

const databaseUrl = process.env.IQSTATS_DATABASE_URL?.trim();

test(
  "legge i read model DATA-1 reali con ruolo read-only",
  { skip: !databaseUrl },
  async () => {
    assert.ok(databaseUrl);
    const sql = postgres(databaseUrl, {
      max: 2,
      prepare: false,
      connection: {
        application_name: "iqstats-data1-integration-test",
        default_transaction_read_only: true,
        statement_timeout: 5_000,
        role: "iqstats_app_reader",
      },
      onnotice: () => undefined,
    });
    try {
      const session = await sql<
        {
          readonly can_insert_matches: boolean;
          readonly read_only: boolean;
          readonly reader_role: boolean;
        }[]
      >`
        select
          current_user = 'iqstats_app_reader' as reader_role,
          current_setting('default_transaction_read_only') = 'on' as read_only,
          has_table_privilege(current_user, 'football.matches', 'INSERT') as can_insert_matches
      `;
      assert.ok(session[0]?.reader_role);
      assert.ok(session[0]?.read_only);
      assert.equal(session[0]?.can_insert_matches, false);

      const store = new PostgresFootballDataStore(sql);
      const gateway = new DatabaseIqstatsGateway(store);
      const competitions = await gateway.getCompetitions();
      assert.equal(competitions.data?.length, 33);

      const matchSamples = await sql<
        {
          readonly match_source_id: string;
          readonly competition_source_id: string;
          readonly match_date: string;
        }[]
      >`
        select
          match_source_id::text,
          competition_source_id::text,
          kickoff_at::date::text as match_date
        from football.app_match_read_model
        order by kickoff_at, match_source_id
        limit 1
      `;
      const matchSample = matchSamples[0];
      assert.ok(matchSample);
      const matches = await gateway.getMatches({
        date: matchSample.match_date,
        leagueId: matchSample.competition_source_id,
        status: null,
        limit: 25,
        offset: 0,
      });
      assert.ok((matches.data?.items.length ?? 0) > 0);
      assert.ok(
        matches.data?.items.every(
          (item) => item.competition.id === matchSample.competition_source_id,
        ),
      );
      const detail = await gateway.getMatchDetail(matchSample.match_source_id);
      assert.ok(detail.data);

      const standingSamples = await sql<
        { readonly competition_source_id: string; readonly season_source_id: string }[]
      >`
        select competition_source_id::text, season_source_id::text
        from football.app_standing_read_model
        order by competition_source_id, season_source_id, position
        limit 1
      `;
      const standingSample = standingSamples[0];
      assert.ok(standingSample);
      const standings = await gateway.getStandings(
        standingSample.competition_source_id,
        standingSample.season_source_id,
      );
      assert.ok((standings.data?.rows.length ?? 0) > 0);
      assert.equal(standings.availability.status, "available");
    } finally {
      await sql.end({ timeout: 5 });
    }
  },
);
