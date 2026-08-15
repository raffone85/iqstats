"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/server/supabase/database.types";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase browser configuration is not available");
  }

  browserClient ??= createBrowserClient<Database>(url, key);
  return browserClient;
}
