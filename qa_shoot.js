// qa_shoot.js — phone-EXACT QA screenshots.
// Headless Chrome/Edge clamp --window-size to a ~500px minimum width, so
// narrow phone widths (390px etc.) cannot be simulated that way. This tool
// uses Chrome DevTools Protocol device-metric emulation instead.
//
// usage: node qa_shoot.js <out.png> <url> [width=390] [height=844] [waitMs=2500]
// set QA_BROWSER to force a specific browser executable.
const { spawn } = require('child_process');
const fs = require('fs');

const BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const exe = process.env.QA_BROWSER || BROWSERS.find((p) => fs.existsSync(p));
if (!exe) { console.error('no Chromium browser found (set QA_BROWSER)'); process.exit(1); }

const [out, url, w = '390', h = '844', waitMs = '2500'] = process.argv.slice(2);
const port = 9331 + Math.floor(Math.random() * 90);
const proc = spawn(exe, [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${port}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let targets = null;
  for (let i = 0; i < 40 && !targets; i++) {
    await sleep(250);
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) {}
  }
  const page = (targets || []).find((t) => t.type === 'page');
  if (!page) { console.error('no CDP page target'); proc.kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws open failed')); });

  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url });
  await sleep(+waitMs);

  if (url.includes('qa=dbg')) {   // echo the page's own layout diagnostics
    const r = await send('Runtime.evaluate', { expression: 'document.getElementById("toast").textContent' });
    console.log('page says:', r.result && r.result.value);
    const v = await send('Runtime.evaluate', { expression: 'JSON.stringify({innerW: innerWidth, innerH: innerHeight})' });
    console.log('viewport:', v.result && v.result.value);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('wrote', out, `(${w}x${h} css, 2x)`);
  ws.close();
  proc.kill();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); proc.kill(); process.exit(1); });
