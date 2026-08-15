import { createSupabaseServerClient } from "@/server/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
