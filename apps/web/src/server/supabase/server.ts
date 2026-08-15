import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { serverEnv } from "@/server/config/env";
import type { Database } from "@/server/supabase/database.types";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    serverEnv.supabaseUrl(),
    serverEnv.supabasePublishableKey(),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot persist cookies. The proxy refreshes them.
          }
        },
      },
    },
  );
}
