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
