export function billingError(
  status: 400 | 401 | 403 | 409 | 500 | 503,
  code: string,
) {
  return Response.json(
    { error: { code } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export function safeAppOrigin(request: Request): URL {
  const configured = process.env.IQSTATS_APP_URL?.trim();
  if (configured) return new URL(configured);

  const origin = new URL(request.url);
  if (
    process.env.NODE_ENV !== "production" &&
    (origin.hostname === "localhost" || origin.hostname === "127.0.0.1")
  ) {
    return new URL(origin.origin);
  }
  throw new Error("IQSTATS_APP_URL is required outside local development");
}
