import "server-only";

/**
 * Same-origin (anti-CSRF) guard per le richieste auth che cambiano stato.
 *
 * Confronta l'`Origin` del browser con l'host effettivo della richiesta
 * (`x-forwarded-host` o `host`), con fallback all'URL. In sviluppo
 * `new URL(request.url).origin` può risolvere su `localhost` anche quando il
 * client si collega via IP di rete locale (test da cellulare): usare l'host
 * header evita un falso `invalid_request` pur restando strettamente same-origin.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
  return originHost === host;
}
