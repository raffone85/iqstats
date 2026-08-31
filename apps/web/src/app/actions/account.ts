"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/server/auth/authorization";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * Elimina l'account, voce 4 del blocco 1.
 *
 * **Cancella davvero.** Togliere la riga da `auth.users` porta via in cascata profilo,
 * cliente di fatturazione, abbonamenti e diritti: sono i quattro vincoli `on delete
 * cascade` verificati sul database, non una speranza. Non si marca «cancellato» e non si
 * nasconde: il criterio del piano dice che deve cancellare per davvero.
 *
 * **Serve scrivere il proprio indirizzo.** Un'azione irreversibile dietro un solo tocco e'
 * una trappola, e una finestra che chiede «sei sicuro?» si clicca senza leggerla. Scrivere
 * l'indirizzo costringe a fermarsi, e non richiede JavaScript.
 *
 * Quello che resta, e che va detto invece che taciuto: presso Stripe restano i documenti
 * di pagamento, che la legge impone di conservare e che non sono nostri da cancellare.
 */
export async function eliminaAccountAction(formData: FormData) {
  const principal = await requireAuthenticatedUser();
  if (principal instanceof Response) redirect("/accedi");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const email = error ? null : data?.claims?.email;
  const scritto = String(formData.get("conferma") ?? "").trim().toLowerCase();
  if (typeof email !== "string" || scritto !== email.toLowerCase()) {
    redirect("/account?elimina=indirizzo-non-corrisponde");
  }

  const { error: erroreCancellazione } = await getSupabaseAdminClient().auth.admin.deleteUser(
    principal.userId,
  );
  if (erroreCancellazione) redirect("/account?elimina=non-riuscita");

  // La sessione va chiusa dopo, non prima: se la cancellazione fallisse, chi ha chiesto
  // resterebbe fuori dal proprio account ancora esistente.
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/?account=eliminato");
}
