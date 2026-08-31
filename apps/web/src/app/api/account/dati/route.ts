import { requireAuthenticatedUser } from "@/server/auth/authorization";
import { datiPersonali } from "@/server/account/dati-personali";

export const dynamic = "force-dynamic";

/**
 * Scarica i miei dati, voce 4 del blocco 1.
 *
 * Un file JSON e non un PDF: il diritto alla portabilita' chiede un formato **leggibile
 * da una macchina**, cosi' che tu possa portarlo altrove e non solo guardarlo.
 *
 * Nessun parametro: si esportano i dati di chi chiede, letti dalla sua sessione. Un
 * identificativo nell'indirizzo sarebbe un invito a provare quello di un altro.
 */
export async function GET() {
  const principal = await requireAuthenticatedUser();
  if (principal instanceof Response) return principal;

  let dati;
  try {
    dati = await datiPersonali(principal.userId);
  } catch {
    dati = null;
  }
  if (dati === null) {
    return Response.json(
      { error: { code: "export_unavailable" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const giorno = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(dati, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="iqstats-i-miei-dati-${giorno}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
