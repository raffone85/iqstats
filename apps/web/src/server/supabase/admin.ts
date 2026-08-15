import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/server/config/env";
import type { Database } from "@/server/supabase/database.types";

let adminClient: SupabaseClient<Database> | undefined;

export function getSupabaseAdminClient(): SupabaseClient<Database> {
  adminClient ??= createClient<Database>(
    serverEnv.supabaseUrl(),
    serverEnv.supabaseServiceRoleKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
  return adminClient;
}
