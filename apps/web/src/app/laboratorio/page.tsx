import type { Metadata } from "next";
import Link from "next/link";

import { MatchPrevisioneSection } from "@/components/match-previsione-section";
import { ProductShell } from "@/components/product-shell";
import { previsioneDellaGara } from "@/server/iqstats/previsione-gara";

export const metadata: Metadata = {
  title: "Laboratorio dossier",
  description: "Banco di prova delle sezioni nuove, fuori dal sito in produzione.",
};

export default function LaboratorioPage() {
  const esempio = previsioneDellaGara({
    nomeCasa: "Atalanta",
    nomeFuori: "Bologna",
    favorito: "Atalanta, 58%",
    golAttesi: 2.64,
    gg: 0.57,
    stile: "Casa che attacca, ospite che resiste",
    arbitroGiudizio: "in linea",
    senzaArbitro: false,
  });

  return (
    <ProductShell>
      <div className="oggi-backdrop" aria-hidden="true" />
      <div className="dossier">
        <Link className="dossier-back" href="/">← Home</Link>
        <section className="dossier-panel">
          <p className="dossier-kick">Laboratorio</p>
          <h1 className="dossier-verdict-lead">Una sezione alla volta, fuori dal sito live</h1>
          <p className="dossier-src">
            Questa pagina vive solo sul ramo laboratorio-dossier. Il sito in produzione
            (
            <a href="https://iqstats-indol.vercel.app">iqstats-indol.vercel.app</a>
            ) non cambia. Sotto c'è la prima sezione: la previsione pre-match, costruita
            su un esempio fisso (Atalanta–Bologna) per poterlo vedere senza toccare una gara vera.
          </p>
        </section>
        <MatchPrevisioneSection previsione={esempio} />
      </div>
    </ProductShell>
  );
}
