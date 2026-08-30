import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Archivo, Inter, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";

import "./globals.css";

// Identità "carta e campo": display (titoli/nomi/KPI), body, mono.
// Il mono è la voce della provenienza — fonte, freschezza, campione, cifre —
// la prosa è la voce della lettura. Archivo regge la carta dove la geometrica
// da interfaccia scura suonava fuori posto.
const displayFont = Archivo({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-archivo", display: "swap" });
const bodyFont = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const monoFont = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-mono", display: "swap" });

/** Lo stesso `theme_color` del manifesto: la barra di sistema continua la testata.
 *  `viewportFit: "cover"` serve alla barra in basso, che già paga `env(safe-area-inset-bottom)`
 *  in `globals.css:271`: senza `cover` quella variabile vale zero e sull'iPhone installato la
 *  navigazione finisce sotto la barra di sistema. */
export const viewport: Viewport = {
  themeColor: "#F8F7F4",
  viewportFit: "cover",
};

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
    // iOS non legge il manifesto: l'icona della schermata home e il nome sotto l'icona
    // arrivano da qui. Su Android li prende dal manifesto.
    appleWebApp: { capable: true, title: "IQstatS", statusBarStyle: "default" },
    icons: { apple: "/apple-touch-icon.png" },
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
      {/* Il manifesto è dichiarato qui, non da `app/manifest.ts`.
          Misurato il 30 agosto 2026: Next trasmette a flusso i tag di `generateMetadata` e
          li appende in fondo al `<body>`, dove il browser ignora `rel="manifest"`. Chrome
          non scaricava nemmeno il file e `beforeinstallprompt` non arrivava; una pagina di
          controllo con lo stesso manifesto in `<head>` era installabile.
          Spegnere il flusso con `htmlLimitedBots` risolveva ma costava: su `/squadre/276`
          il primo byte passava da 1,16-1,59 s a 5,81-8,77 s. Questo tag lo issa React in
          `head` senza toccare il flusso e senza quel costo. */}
      <body>
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* `beforeinstallprompt` arriva subito dopo il caricamento, e l'idratazione di React
            ci mette secondi: misurato il 30 agosto 2026, un ascoltatore montato dentro un
            effetto lo perde sempre. Questo lo trattiene appena il documento esiste e avvisa la
            scheda. Fuori da Chromium l'evento non esiste e qui non succede nulla. */}
        <Script id="iqstats-installa" strategy="beforeInteractive">
          {"window.__iqstatsInstalla=null;addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__iqstatsInstalla=e;dispatchEvent(new Event('iqstats:installabile'))});"}
        </Script>
        {children}
      </body>
    </html>
  );
}
