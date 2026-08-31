import "server-only";

import { getSupabaseAdminClient } from "@/server/supabase/admin";

/**
 * Tutto quello che il livello dati sa di una persona, in un oggetto solo.
 *
 * **Le tavole sono quelle e sono quattro**, piu' l'anagrafica dell'accesso: `profiles`,
 * `billing_customers`, `subscriptions`, `entitlements`. Sono le sole con una colonna
 * `user_id` che punta a `auth.users` - verificato sui vincoli del database, non dedotto -
 * e sono le stesse quattro che si cancellano in cascata quando l'account viene eliminato.
 * Se un giorno ne nasce una quinta, questa funzione va aggiornata: e' il motivo per cui
 * l'elenco sta qui e non sparso in una rotta.
 *
 * `billing_events` non compare, e non e' una dimenticanza: e' il giornale dei messaggi di
 * Stripe, tenuto per non applicare due volte lo stesso evento, e non ha una colonna che
 * punti a una persona.
 */
export type DatiPersonali = Readonly<{
  esportato_il: string;
  account: Readonly<{ id: string; email: string | null; creato_il: string; ultimo_accesso: string | null }>;
  profilo: unknown;
  fatturazione: Readonly<{ cliente: unknown; abbonamenti: unknown; diritti: unknown }>;
  nota: string;
}>;

export async function datiPersonali(userId: string): Promise<DatiPersonali | null> {
  const admin = getSupabaseAdminClient();

  const { data: utente, error: erroreUtente } = await admin.auth.admin.getUserById(userId);
  if (erroreUtente || !utente.user) return null;

  const [profilo, cliente, abbonamenti, diritti] = await Promise.all([
    admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    admin.from("billing_customers").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("subscriptions").select("*").eq("user_id", userId),
    admin.from("entitlements").select("*").eq("user_id", userId),
  ]);
  for (const esito of [profilo, cliente, abbonamenti, diritti]) {
    if (esito.error) throw esito.error;
  }

  return {
    esportato_il: new Date().toISOString(),
    account: {
      id: utente.user.id,
      email: utente.user.email ?? null,
      creato_il: utente.user.created_at,
      ultimo_accesso: utente.user.last_sign_in_at ?? null,
    },
    profilo: profilo.data,
    fatturazione: {
      cliente: cliente.data,
      abbonamenti: abbonamenti.data,
      diritti: diritti.data,
    },
    nota:
      "Questo file contiene tutto cio' che IQstatS conserva su di te. I preferiti, la guida "
      + "gia' vista e l'invito a installare stanno soltanto nel tuo browser e non arrivano a "
      + "noi, quindi non possono comparire qui: si cancellano svuotando i dati del sito. I "
      + "dati della tua carta li tratta Stripe e non passano mai da noi.",
  };
}
