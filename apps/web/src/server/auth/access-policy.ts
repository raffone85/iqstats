export type FeatureKey =
  | "matches.list.read"
  | "matches.detail.read"
  | "method.provenance.read"
  | "odds.snapshot.read"
  | "match.history.read"
  | "match.statistics.read"
  | "match.context.read"
  /**
   * Tutto quello che ci mettiamo noi sopra al dato: il motore di proiezione, le letture
   * per giocatore, `/expected`, `/pronostici` e il consuntivo. Nasce il 30 agosto 2026
   * con la scala decisa dall'utente: **il dato resta libero, si paga la lettura**.
   * Una chiave sola e non cinque, perche' o si ha accesso al motore o non lo si ha: cinque
   * chiavi che si accendono sempre insieme sono una chiave scritta cinque volte.
   */
  | "engine.read";

export type AccessDecision =
  | { readonly allowed: true; readonly userId: string }
  | {
      readonly allowed: false;
      readonly status: 401 | 403 | 429 | 503;
      readonly code:
        | "unauthenticated"
        | "feature_not_entitled"
        | "rate_limited"
        | "authorization_unavailable";
      readonly retryAfterSeconds?: number;
    };

/**
 * **L'applicazione e' ancora in costruzione, e finche' lo e' nessuna lettura si paga.**
 *
 * Il 31 agosto 2026 il muro degli accessi e' finito in produzione insieme al resto del
 * ramo, e ha chiuso fuori chi sta costruendo l'applicazione davanti a una cassa che non
 * incassa: Stripe e' in modalita' di prova, quindi l'acquisto non si puo' nemmeno
 * completare. Un muro davanti a una porta murata non protegge niente.
 *
 * Finche' questa costante e' vera, `accessoDaCantiere` consente ogni funzionalita' senza
 * chiedere ne' account ne' diritto. **La politica sotto non e' stata toccata**: resta
 * scritta, resta provata dai suoi test, e si riaccende rimettendo questa a `false` il
 * giorno in cui i pagamenti funzionano davvero.
 *
 * **Vale per le pagine, non per le rotte API.** `requireFeature` protegge chiamate che
 * arrivano da internet e continua a chiedere account e diritto come prima: aprire quelle
 * non serve a chi costruisce l'applicazione e regalerebbe la fonte a chiunque.
 */
export const APP_IN_COSTRUZIONE = true;

/** La decisione da cantiere, o `null` quando il muro e' acceso e decide la politica. */
export function accessoDaCantiere(): AccessDecision | null {
  return APP_IN_COSTRUZIONE ? { allowed: true, userId: "" } : null;
}

export interface AccessDependencies {
  getUserId(): Promise<string | null>;
  hasEntitlement(userId: string, feature: FeatureKey): Promise<boolean>;
}

export async function authorizeFeature(
  feature: FeatureKey,
  dependencies: AccessDependencies,
): Promise<AccessDecision> {
  const userId = await dependencies.getUserId();
  if (!userId) {
    return { allowed: false, status: 401, code: "unauthenticated" };
  }

  try {
    const entitled = await dependencies.hasEntitlement(userId, feature);
    return entitled
      ? { allowed: true, userId }
      : { allowed: false, status: 403, code: "feature_not_entitled" };
  } catch {
    return { allowed: false, status: 503, code: "authorization_unavailable" };
  }
}
