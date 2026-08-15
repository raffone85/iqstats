import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/server/config/env";
import type { Database } from "@/server/supabase/database.types";

export async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    serverEnv.supabaseUrl(),
    serverEnv.supabasePublishableKey(),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // This verifies the token and refreshes expired sessions when possible.
  await supabase.auth.getClaims();
  return response;
}
