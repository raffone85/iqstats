import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import { serverEnv } from "@/server/config/env";
import type { Database } from "@/server/supabase/database.types";

/**
 * Un solo client per richiesta, non uno per componente.
 *
 * Misurato il 14 settembre 2026: con la sessione scaduta una pagina gara chiamava
 * `getClaims` da quattro o cinque punti (shell, diritti, catalogo), ognuno con il suo client,
 * e ognuno rinnovava lo stesso refresh token nello stesso istante. Supabase Auth ha risposto
 * 409 «troppi rinnovi concorrenti» e 504, e le pagine restavano in caricamento. Con un client
 * condiviso il rinnovo parte una volta e gli altri lo aspettano. Fuori dal rendering (azioni,
 * rotte) `cache` non memorizza e il comportamento resta quello di prima.
 */
export const createSupabaseServerClient = cache(async () => {
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
});
