// Contrasto WCAG di ogni testo visibile, misurato nel browser vero. Solo lettura.
// Uso, con Chrome gia' avviato in ascolto sulla porta di debug:
//   chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<cartella>
//   node scripts/verification/contrasto-wcag.mjs <url> [larghezza]
//   node scripts/verification/contrasto-wcag.mjs --prova     (la sonda sa diventare rossa?)
//
// Per ogni elemento con testo proprio risale i genitori fino a un fondo opaco e **compone
// i fondi traslucidi** invece di saltarli: una fascia bianca al 94% sopra il verde profondo
// e' quasi bianca, e saltarla faceva dichiarare 1,00 di contrasto dove il valore vero e'
// quattordici. Quei falsi positivi tornavano a ogni verifica come «due combinazioni note».
//
// **Limite dichiarato, non aggirato:** un testo sopra una fotografia non si misura cosi'.
// Quei casi escono in un elenco a parte, da guardare a vista, invece di essere indovinati.
const [, , argomento, larghezza = "1440"] = process.argv;

// La prova che la sonda sa fallire: una pagina con un grigio chiaro fuori norma, un testo
// scuro a norma e un testo su fascia traslucida. Deve trovare **solo** il primo.
const PROVA = "data:text/html,<body style='background:%23fff'>"
  + "<p style='color:%23bbbbbb'>prova chiara</p>"
  + "<p style='color:%23111111'>prova scura</p>"
  + "<div style='background:rgba(255,255,255,.94)'><span style='color:%23073B27'>su fascia traslucida</span></div>"
  + "</body>";
const prova = argomento === "--prova";
const url = prova ? PROVA : argomento;
if (!url) { console.error("manca l'url: node scripts/verification/contrasto-wcag.mjs <url> [larghezza]"); process.exit(2); }

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
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
await cmd("Emulation.setDeviceMetricsOverride", {
  width: +larghezza, height: 900, deviceScaleFactor: 1, mobile: +larghezza < 768,
});
await cmd("Page.navigate", { url });
await new Promise((r) => setTimeout(r, prova ? 1500 : 30000));

const sonda = `(() => {
  const canale = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const numeri = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
  // Un colore diventa sempre [r,g,b,alpha] con r,g,b in 0-255: color(srgb ...) arriva in 0-1.
  const rgba = (c) => { const n = numeri(c); if (n.length < 3) return [255,255,255,1];
    const scala = c.startsWith("color(") ? 255 : 1;
    return [n[0]*scala, n[1]*scala, n[2]*scala, n.length > 3 ? n[3] : 1]; };
  const lum = (v) => { const [r,g,b] = v.slice(0,3).map((x) => canale(x/255));
    return 0.2126*r + 0.7152*g + 0.0722*b; };
  const rapporto = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
  // **I fondi traslucidi si compongono, non si saltano.** Uno stemma su fascia bianca al 94%
  // sopra il verde profondo e' quasi bianco: saltarlo faceva dichiarare 1,00 di contrasto
  // dove il valore vero e' quattordici, e quei falsi positivi tornavano a ogni verifica.
  const sopra = (a, b) => { const k = a[3];
    return [a[0]*k + b[0]*(1-k), a[1]*k + b[1]*(1-k), a[2]*k + b[2]*(1-k), 1]; };
  const fondo = (el) => { let n = el; const strati = [];
    while (n) { const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none") return null;
      const c = s.backgroundColor;
      if (c && c !== "transparent") { const v = rgba(c);
        if (v[3] > 0) { strati.push(v); if (v[3] >= 0.999) break; } }
      n = n.parentElement; }
    let base = [255,255,255,1];
    for (let i = strati.length - 1; i >= 0; i -= 1) base = sopra(strati[i], base);
    return base; };
  const esiti = [];
  for (const el of document.querySelectorAll("body *")) {
    const testo = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (!testo) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || +s.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const sotto = fondo(el);
    if (sotto === null) { esiti.push({ testo: testo.slice(0,40), nota: "sopra un'immagine, da guardare a vista", classe: el.className }); continue; }
    const dim = parseFloat(s.fontSize), grosso = dim >= 24 || (dim >= 18.66 && +s.fontWeight >= 700);
    const c = rapporto(rgba(s.color), sotto);
    if (c < (grosso ? 3 : 4.5)) esiti.push({ testo: testo.slice(0,40), classe: el.className, colore: s.color, fondo: "rgb(" + sotto.slice(0,3).map(Math.round).join(", ") + ")", dim, contrasto: +c.toFixed(2), serve: grosso ? 3 : 4.5 });
  }
  return JSON.stringify(esiti);
})()`;

const { result } = await cmd("Runtime.evaluate", { expression: sonda, returnByValue: true });
const esiti = JSON.parse(result.value);
const sotto = esiti.filter((e) => e.contrasto !== undefined);
const foto = esiti.filter((e) => e.nota);
console.log(`${url} @${larghezza}px`);
console.log(`  sotto AA: ${sotto.length}   sopra un'immagine: ${foto.length}`);
for (const e of sotto) console.log(`  ${String(e.contrasto).padStart(5)} (serve ${e.serve})  ${e.colore} su ${e.fondo}  .${e.classe}  «${e.testo}»`);
for (const e of foto) console.log(`  a vista: .${e.classe}  «${e.testo}»`);

if (prova) {
  const atteso = sotto.length === 1 && sotto[0].testo.startsWith("prova chiara");
  console.log(atteso ? "prova superata: la sonda trova il solo caso fuori norma"
    : "PROVA FALLITA: attesa una sola combinazione, «prova chiara»");
  process.exit(atteso ? 0 : 1);
}
ws.close();
