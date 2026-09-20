import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@iqstats/shared"],
  // Consente il caricamento dei chunk dev quando l'app è aperta da un dispositivo
  // sulla LAN (es. test da cellulare via IP locale), non solo da localhost.
  allowedDevOrigins: ["192.168.1.5"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  // **Gli header che il browser applica da solo.** Audit del 13 settembre 2026: mancavano
  // tutti, e senza `frame-ancestors` una pagina di IQstatS si lascia incorniciare da un
  // sito terzo, che e' il modo in cui si rubano i clic di un utente gia' autenticato.
  // `Strict-Transport-Security` lo mette gia' Vercel sul dominio, quindi non si ripete.
  // La CSP completa sta in `src/proxy.ts`, non qui: ha un nonce che cambia a ogni
  // richiesta e questi header sono fissi. Qui resta cio' che vale anche per i percorsi che
  // il proxy non attraversa, gli statici e le immagini.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // Riordino del 23 agosto 2026: le gare hanno una porta sola. `/oggi` mostrava le gare
  // del giorno, che `/partite` già mostra come default; `/giocate` e `/database` erano
  // segnaposto senza contenuto. I collegamenti vecchi non devono rompersi.
  async redirects() {
    return [
      { source: "/oggi", destination: "/partite", permanent: true },
      { source: "/giocate", destination: "/", permanent: true },
      { source: "/database", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
