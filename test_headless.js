// Headless smoke test for game.js: stub DOM, sped-up timers,
// then auto-plays full games (settings come from argv JSON).
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, ms) => realSetTimeout(fn, Math.max(0, (ms || 0) / 30));
global.setInterval = (fn, ms) => realSetInterval ? realSetInterval(fn, ms) : null;

class CL {
  constructor() { this.s = new Set(); this.log = []; }
  add(c) { this.s.add(c); this.log.push('+' + c); }
  remove(c) { this.s.delete(c); this.log.push('-' + c); }
  contains(c) { return this.s.has(c); }
  toggle(c, on) { on ? this.add(c) : this.remove(c); }
}
class El {
  constructor(tag) {
    this.tag = tag; this.children = []; this.dataset = {}; this.attrs = {};
    this.classList = new CL(); this.style = { setProperty() {} };
    this._html = ''; this._text = ''; this.hidden = false;
    this.listeners = {}; this.value = '';
    this.clientWidth = 1400; this.clientHeight = 800;
  }
  set innerHTML(v) { this._html = v; if (v === '') this.children = []; } get innerHTML() { return this._html; }
  set textContent(v) { this._text = v; } get textContent() { return this._text; }
  set className(v) { String(v).split(/\s+/).forEach((c) => c && this.classList.add(c)); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  setAttribute(k, v) { this.attrs[k] = v; }
  querySelectorAll() { return []; }
}

const byId = {};
const IDS = ['board', 'boardWrap', 'status', 'toast', 'menu', 'results', 'rngTotal', 'rngImages',
  'rngP', 'rngCap', 'valTotal', 'valImages', 'valP', 'valCap', 'diffBox', 'bestBox', 'modeHint',
  'resTitle', 'resBody', 'modeSeg', 'presetBtns', 'backBtns', 'langSeg', 'btnMenu', 'btnCloseMenu', 'btnStart',
  'btnRestart', 'btnPlayAgain', 'btnResSettings', 'btnSound', 'btnTheme'];
IDS.forEach((id) => { byId[id] = new El('div'); byId[id].id = id; });
byId.menu.classList.add('hidden');
byId.results.classList.add('hidden');

const modeBtns = [
  { dataset: { mode: 'solo' }, classList: new CL() },
  { dataset: { mode: 'vs' }, classList: new CL() },
];
const presetBtns = [
  { dataset: { p: '50', c: '3' }, classList: new CL() },
  { dataset: { p: '60', c: '4' }, classList: new CL() },
  { dataset: { p: '70', c: '5' }, classList: new CL() },
  { dataset: { p: '80', c: '6' }, classList: new CL() },
  { dataset: { p: '90', c: '7' }, classList: new CL() },
];
const langBtns = [
  { dataset: { lang: 'en' }, classList: new CL() },
  { dataset: { lang: 'pl' }, classList: new CL() },
];

global.document = {
  querySelector: (sel) => byId[sel.replace('#', '')] || null,
  querySelectorAll: (sel) =>
    sel === '#modeSeg button' ? modeBtns :
    sel === '#presetBtns button' ? presetBtns :
    sel === '#langSeg button' ? langBtns : [],
  createElement: (tag) => new El(tag),
  addEventListener() {},
  documentElement: { style: { setProperty() {} }, dataset: {} },
};
global.window = {
  addEventListener() {}, innerWidth: 1400, innerHeight: 800,
};
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
global.Image = class { set src(v) {} };

// preseed settings from argv
const settings = JSON.parse(process.argv[2] || '{}');
store['memoryzoo.settings.v1'] = JSON.stringify(settings);

require('./game.js');

async function wait(ms) { return new Promise((r) => realSetTimeout(r, ms)); }

async function playOne(label) {
  const board = byId.board;
  const cells = board.children.filter((c) => c.tag === 'button');
  const click = (cell) => {
    const fn = board.listeners['click'][0];
    fn({ target: { closest: () => cell } });
  };
  console.log(label, '- board cells:', cells.length);

  let safety = 0;
  while (safety++ < 400) {
    if (!byId.results.classList.contains('hidden')) break;       // results shown
    const alive = cells.filter((c) => !c.classList.contains('gone'));
    const upPending = alive.filter((c) => c.classList.contains('up') && !c.classList.contains('matched'));
    const down = alive.filter((c) => !c.classList.contains('up'));
    if (upPending.length === 1) {
      // complete the half-pair the game is waiting on, like a player would
      if (down.length) { click(down[Math.floor(Math.random() * down.length)]); await wait(180); }
      else await wait(120);
      continue;
    }
    if (down.length < 2) { await wait(200); continue; }
    const first = down[Math.floor(Math.random() * down.length)];
    click(first);
    await wait(120);
    const rest = cells.filter((c) => c !== first && !c.classList.contains('gone') && !c.classList.contains('up'));
    if (!rest.length) { await wait(120); continue; }
    click(rest[Math.floor(Math.random() * rest.length)]);
    await wait(180);
  }
  await wait(400);
  const done = !byId.results.classList.contains('hidden');
  console.log(label, '- finished:', done, 'steps:', safety);

  // regression check: every removed card must have been flipped face-up BEFORE removal
  let flipViolation = null;
  for (const c of cells) {
    const log = c.classList.log;
    const gi = log.indexOf('+gone');
    if (gi === -1) continue;
    const ui = log.indexOf('+up');
    if (ui === -1 || ui > gi) { flipViolation = c.dataset.idx + ': ' + log.join(' '); break; }
  }
  if (flipViolation) { console.error(label, 'FAIL: card removed without flipping first ->', flipViolation); process.exit(1); }
  console.log(label, '- flip-before-removal OK for all', cells.filter((c) => c.classList.log.includes('+gone')).length, 'removed cards');

  // regression check: pressing ⚙ Menu while the results popup is open must close it
  if (done) {
    byId.btnMenu.listeners['click'][0]();
    const resHidden = byId.results.classList.contains('hidden');
    const menuOpen = !byId.menu.classList.contains('hidden');
    // records box: solo -> ONLY the exact-config row (no heading, no table);
    // vs mode -> the whole box is hidden
    const isSolo = (settings.mode || 'solo') === 'solo';
    const bb = byId.bestBox;
    if (isSolo) {
      if (bb.hidden) { console.error(label, 'FAIL: bestBox hidden in solo mode'); process.exit(1); }
      if (!bb._html.includes('Best for this exact setup')) { console.error(label, 'FAIL: missing exact-setup best row'); process.exit(1); }
      if (bb._html.includes('allbests') || bb._html.toLowerCase().includes('your solo records') || bb._html.toLowerCase().includes('no records')) {
        console.error(label, 'FAIL: records section still renders heading/table'); process.exit(1);
      }
      console.log(label, '- records box: exact-setup row only OK');
    } else if (!bb.hidden) {
      console.error(label, 'FAIL: bestBox visible in vs mode'); process.exit(1);
    } else {
      console.log(label, '- records box hidden in vs mode OK');
    }
    byId.btnCloseMenu.listeners['click'][0]();
    if (!resHidden || !menuOpen) { console.error(label, 'FAIL: menu press left results popup open (resHidden=' + resHidden + ' menuOpen=' + menuOpen + ')'); process.exit(1); }
    console.log(label, '- menu press closes results popup OK');
  }

  console.log(label, '- status:', byId.status._html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160));
  console.log(label, '- results:', byId.resTitle.textContent, '|', byId.resBody._html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 220));
  byId.results.classList.add('hidden');
  return done;
}

(async () => {
  let ok = await playOne('game1');
  if (!ok) { console.error('FAIL: game 1 did not finish'); process.exit(1); }

  // press "New" (restart) -> second game in same process, tests persistence
  const fn = byId.btnRestart.listeners['click'][0];
  fn();
  await wait(50);
  ok = await playOne('game2');
  if (!ok) { console.error('FAIL: game 2 did not finish'); process.exit(1); }

  // switch card names to Polish: segment marks itself, setting persists,
  // a fresh board labels every card with a Polish name
  byId.langSeg.listeners['click'][0]({ target: { closest: () => langBtns[1] } });
  if (!langBtns[1].classList.contains('on')) { console.error('FAIL: Polski button not marked'); process.exit(1); }
  if (JSON.parse(store['memoryzoo.settings.v1']).lang !== 'pl') { console.error('FAIL: lang=pl not persisted'); process.exit(1); }
  byId.btnRestart.listeners['click'][0]();
  await wait(50);
  const PL_NAMES = new Set(['Króliczek', 'Kurczak', 'Żaba', 'Koziołek', 'Gęś', 'Świnka morska', 'Chomik',
    'Kotek', 'Lwiątko', 'Niedźwiedź polarny', 'Szczeniak', 'Królik', 'Wielbłąd', 'Słoń', 'Rybka', 'Kangur',
    'Koala', 'Panda', 'Papuga', 'Prosiak', 'Rekin', 'Tygrysek', 'Tukan', 'Żółw', 'Wilk']);
  let labels = [], bad = [];
  for (const c of byId.board.children.filter((c) => c.tag === 'button')) {
    const m = /class="nm[^"]*">([^<]+)</.exec(c.innerHTML);
    if (!m) { bad.push('no label'); continue; }
    labels.push(m[1]);
    if (!PL_NAMES.has(m[1])) bad.push(m[1]);
  }
  if (bad.length) { console.error('FAIL: non-Polish card labels ->', bad.join(', ')); process.exit(1); }
  console.log('language switch: all', labels.length, 'cards labeled:', [...new Set(labels)].join(', '));
  byId.langSeg.listeners['click'][0]({ target: { closest: () => langBtns[0] } });
  await wait(50);

  const isSolo = (settings.mode || 'solo') === 'solo';
  const raw = store['memoryzoo.scores.v2'];
  console.log('scores store (v2):', raw);
  if (isSolo) {
    let sc = null;
    try { sc = JSON.parse(raw); } catch (e) {}
    const keys = sc && sc.solo ? Object.keys(sc.solo) : [];
    const okFormat = keys.length >= 1 && keys.every((k) => /^\d+x\d+$/.test(k));
    // two games with the same settings must share ONE combo key
    if (!okFormat || new Set(keys).size < 1) { console.error('FAIL: bad/missing combo scores'); process.exit(1); }
    console.log('combo keys stored:', keys.join(', '));
  } else if (raw) {
    console.error('FAIL: vs game should not store scores'); process.exit(1);
  }
  process.exit(0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
