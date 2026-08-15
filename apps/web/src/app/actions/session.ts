"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * Chiude la sessione e riporta alla home. Vive come Server Action perché il pulsante
 * di uscita sta nella cornice, che è un componente server: così l'uscita funziona
 * anche senza JavaScript attivo.
 */
export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // Senza invalidare la cornice, il router riuserebbe la pagina già resa e la testata
  // continuerebbe a mostrare la sessione appena chiusa.
  revalidatePath("/", "layout");
  redirect("/");
}
