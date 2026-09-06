// Altezza e overflow orizzontale di una pagina alle quattro larghezze di consegna, con la
// cattura di ognuna. Solo lettura. Chrome gia' avviato in ascolto sulla porta di debug:
//   chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<cartella>
//   node scripts/verification/misura-pagina.mjs <cartella> <nome>=<url> [<nome>=<url> ...]
//
// Le larghezze sono 375, 768, 1024 e 1440 px, quelle che il workflow chiede prima di una
// consegna UI. L'attesa e' di trenta secondi per pagina: in sviluppo il tabellone e il
// dossier chiedono alla fonte a ogni visita, e a dodici secondi si misurava lo schermo di
// attesa, cioe' 900 px di niente scambiati per una pagina corta.
import { writeFileSync, mkdirSync } from "node:fs";

const LARGHEZZE = [375, 768, 1024, 1440];
const [, , cartella, ...coppie] = process.argv;
mkdirSync(cartella, { recursive: true });

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const pagina = targets.find((t) => t.type === "page");
const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((ok) => (ws.onopen = ok));

let id = 0;
const attese = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && attese.has(m.id)) attese.get(m.id)(m.result);
};
const cmd = (method, params = {}) =>
  new Promise((ok) => {
    const n = ++id;
    attese.set(n, ok);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

await cmd("Page.enable");
const esiti = [];

for (const coppia of coppie) {
  const i = coppia.indexOf("=");
  const nome = coppia.slice(0, i);
  const url = coppia.slice(i + 1);
  for (const larghezza of LARGHEZZE) {
    await cmd("Emulation.setDeviceMetricsOverride", {
      width: larghezza,
      height: 900,
      deviceScaleFactor: 1,
      mobile: larghezza < 768,
    });
    await cmd("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 30000));
    const { result } = await cmd("Runtime.evaluate", {
      expression: `JSON.stringify({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        altezza: document.documentElement.scrollHeight,
        titolo: document.title
      })`,
      returnByValue: true,
    });
    const m = JSON.parse(result.value);
    esiti.push(`${nome} @${larghezza}px  overflow=${m.scroll - m.client}px  altezza=${m.altezza}px`);
    const shot = await cmd("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: larghezza, height: Math.min(m.altezza, 6000), scale: 1 },
    });
    writeFileSync(`${cartella}/${nome}-${larghezza}.png`, Buffer.from(shot.data, "base64"));
  }
}

console.log(esiti.join("\n"));
ws.close();
