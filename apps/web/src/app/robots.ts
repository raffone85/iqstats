import type { MetadataRoute } from "next";

// Il sito non ha pagine da far scoprire a un crawler: ogni gara, squadra, giocatore e
// arbitro e' una lettura del livello dati, e le pagine a combinazione (`/partite` con
// data, campionato e stato) sono infinite per costruzione. Il 18 settembre 2026 una
// scansione a una richiesta al secondo ha saturato il pooler e portato il traffico
// d'uscita Supabase oltre il piano. Qui si dichiara la regola; il rifiuto immediato per
// chi non la legge sta in `src/proxy.ts`.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/metodo", "/privacy", "/termini"],
        disallow: [
          "/partite",
          "/match/",
          "/squadre",
          "/giocatori",
          "/arbitri",
          "/cerca",
          "/expected",
          "/pronostici",
          "/banco-di-prova",
          "/account",
          "/api/",
        ],
      },
    ],
  };
}
