import type { Metadata } from "next";
import { headers } from "next/headers";
import { Archivo, Inter, IBM_Plex_Mono } from "next/font/google";

import "./globals.css";

// Identità "carta e campo": display (titoli/nomi/KPI), body, mono.
// Il mono è la voce della provenienza — fonte, freschezza, campione, cifre —
// la prosa è la voce della lettura. Archivo regge la carta dove la geometrica
// da interfaccia scura suonava fuori posto.
const displayFont = Archivo({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-archivo", display: "swap" });
const bodyFont = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const monoFont = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-mono", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = "IQstatS | Intelligence calcistica verificabile";
  const description = "Un ambiente informativo per studiare il contesto di una partita, con fonti, freschezza e limiti dichiarati.";

  return {
    metadataBase,
    title: {
      default: title,
      template: "%s | IQstatS",
    },
    description,
    openGraph: {
      type: "website",
      locale: "it_IT",
      siteName: "IQstatS",
      title,
      description,
      images: [{ url: "/og.png", width: 1731, height: 909, alt: "IQstatS — Intelligence calcistica verificabile" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
