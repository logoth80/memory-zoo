/* ============================================================
   Memory Zoo — a kids match-the-pairs web game
   Modes: Solo (moves = score) and vs Computer (memory AI).
   Sprites live in TileSprites/animals/.
   ============================================================ */
'use strict';

(function () {

// ------------------------------------------------ sprites ---
const SPRITES = [
  { id: 'Bunny01',    name: 'Bunny' },
  { id: 'Chicken01',  name: 'Chicken' },
  { id: 'Frog01',     name: 'Frog' },
  { id: 'Goat01',     name: 'Goat' },
  { id: 'Goose01',    name: 'Goose' },
  { id: 'Guinea01',   name: 'Guinea Pig' },
  { id: 'Hamster01',  name: 'Hamster' },
  { id: 'Kitten01',   name: 'Kitten' },
  { id: 'LionCub01',  name: 'Lion Cub' },
  { id: 'PolarCub01', name: 'Polar Bear' },
  { id: 'Puppy01',    name: 'Puppy' },
  { id: 'Rabbit01',   name: 'Rabbit' },
];
const IMG_DIR = 'TileSprites/animals/';

// ------------------------------------------------ limits ----
const MIN_TOTAL = 10, MAX_TOTAL = 48;       // even numbers only
const MIN_IMAGES = 4, MAX_IMAGES = 12;
const MIN_P = 50, MAX_P = 95;              // computer remember-chance, %
const MIN_CAP = 3, MAX_CAP = 7;            // computer memory size, cards
const FLIP_MS = 560, SHOW_MS = 800, PAIR_WAIT = FLIP_MS + 140;

const LS_SETTINGS = 'memoryzoo.settings.v1';
const LS_SCORES   = 'memoryzoo.scores.v2';   // solo best per "total x images" combo

const BACKS = ['blue', 'burgundy', 'brown', 'forest', 'plum', 'slate'];
const DEFAULTS = { mode: 'solo', total: 16, images: 6, p: 70, cap: 5, mute: false, theme: 'dark', backColor: 'blue' };

// ------------------------------------------------ helpers ---
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadLS(key, def) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return (v && typeof v === 'object') ? v : def;
  } catch (e) { return def; }
}
function saveLS(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

// ------------------------------------------------ sound -----
// Tiny WebAudio synth — no audio files needed.
class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  ac() {
    if (this.ctx === null) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = AC ? new AC() : false;
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx || null;
  }
  tone(f0, f1, delay, dur, gain, type = 'sine') {
    if (this.muted) return;
    const ctx = this.ac();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, f0), t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  flip()     { this.tone(430, 290, 0, 0.09, 0.055, 'triangle'); }
  flipDown() { this.tone(300, 220, 0, 0.09, 0.05, 'triangle'); }
  ui()       { this.tone(680, 520, 0, 0.06, 0.05, 'triangle'); }
  think()    { this.tone(660, 660, 0, 0.06, 0.035); this.tone(880, 880, 0.11, 0.06, 0.03); }
  match() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, f, i * 0.07, 0.35, 0.11));
    this.tone(1568, 1568, 0.30, 0.25, 0.045, 'triangle');
  }
  miss() { this.tone(300, 190, 0, 0.18, 0.09); this.tone(220, 150, 0.14, 0.22, 0.08); }
  deal() { [392, 523.25, 659.25].forEach((f, i) => this.tone(f, f, i * 0.09, 0.25, 0.05, 'triangle')); }
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, f, i * 0.12, 0.4, 0.11));
    this.tone(783.99, 783.99, 0.48, 0.25, 0.09);
    this.tone(1046.5, 1046.5, 0.48, 0.55, 0.12);
    this.tone(1318.5, 1318.5, 0.48, 0.6, 0.09, 'triangle');
  }
  lose() { [440, 392, 349.2, 261.6].forEach((f, i) => this.tone(f, f * 0.97, i * 0.18, 0.5, 0.08)); }
  tie()  { [523.25, 523.25, 440, 392].forEach((f, i) => this.tone(f, f, i * 0.16, 0.4, 0.07)); }
}

// ------------------------------------------------ DOM refs --
const boardEl   = $('#board');
const statusEl  = $('#status');
const toastEl   = $('#toast');
const menuEl    = $('#menu');
const resultsEl = $('#results');

const sfx = new Sfx();

// ------------------------------------------------ settings --
let S = sanitizeSettings({ ...DEFAULTS, ...loadLS(LS_SETTINGS, {}) });
let scores = loadLS(LS_SCORES, {});
if (!scores.solo) scores.solo = {};   // key "totalCards x pictures" -> fewest moves

function sanitizeSettings(raw) {
  const s = {
    mode: raw.mode === 'vs' ? 'vs' : 'solo',
    total: clamp(Math.round(raw.total ?? DEFAULTS.total), MIN_TOTAL, MAX_TOTAL),
    images: clamp(Math.round(raw.images ?? DEFAULTS.images), MIN_IMAGES, MAX_IMAGES),
    p: clamp(Math.round(raw.p ?? DEFAULTS.p), MIN_P, MAX_P),
    cap: clamp(Math.round(raw.cap ?? DEFAULTS.cap), MIN_CAP, MAX_CAP),
    mute: !!raw.mute,
    theme: raw.theme === 'light' ? 'light' : 'dark',
    backColor: ['blue', 'burgundy', 'brown', 'forest', 'plum', 'slate'].indexOf(raw.backColor) >= 0
      ? raw.backColor : 'blue',
  };
  if (s.total % 2) s.total -= 1;
  s.total = Math.max(MIN_TOTAL, s.total);
  s.images = Math.min(s.images, Math.floor(s.total / 2), MAX_IMAGES);
  s.images = Math.max(MIN_IMAGES, s.images);
  return s;
}
function saveSettings() { saveLS(LS_SETTINGS, S); }
function saveScores() { saveLS(LS_SCORES, scores); }

// ------------------------------------------------ game state
let G = null;
let GAME_GEN = 0;

function gridDims(total) {
  // Prefer an exact-factor rectangle with a pleasant aspect (~1.3:1);
  // otherwise use a near-square grid and sprinkle a few empty holes.
  let best = null;
  for (let c = 2; c <= Math.floor(total / 2); c++) {
    if (total % c) continue;
    const r = total / c;
    const cost = Math.abs(Math.log((c / r) / 1.3));
    if (!best || cost < best.cost) best = { cols: c, rows: r, cost };
  }
  if (best && best.cost <= 1.15) return { cols: best.cols, rows: best.rows, gaps: 0 };
  const cols = Math.max(2, Math.ceil(Math.sqrt(total * 1.3)));
  const rows = Math.ceil(total / cols);
  return { cols, rows, gaps: cols * rows - total };
}

function startGame() {
  const gen = ++GAME_GEN;
  const { total, images } = S;

  // choose pictures, then distribute pairs as evenly as possible
  const chosen = shuffle(SPRITES.slice()).slice(0, images);
  const pairsTotal = total / 2;
  const base = Math.floor(pairsTotal / images);
  const extra = pairsTotal % images;      // first `extra` images get one more pair
  const counts = chosen.map((sp, i) => 2 * (base + (i < extra ? 1 : 0)));

  const deck = [];
  chosen.forEach((sp, i) => {
    for (let k = 0; k < counts[i]; k++) deck.push(sp.id);
  });
  shuffle(deck);

  // build grid
  const dims = gridDims(total);
  const slots = dims.cols * dims.rows;
  const holeSet = new Set();
  if (dims.gaps > 0) {
    const all = [];
    for (let i = 0; i < slots; i++) all.push(i);
    shuffle(all).slice(0, dims.gaps).forEach((i) => holeSet.add(i));
  }

  boardEl.innerHTML = '';
  boardEl.style.setProperty('--cols', dims.cols);
  const cells = [];
  let di = 0;
  for (let pos = 0; pos < slots; pos++) {
    if (holeSet.has(pos)) {
      const hole = document.createElement('div');
      hole.className = 'cell hole';
      boardEl.appendChild(hole);
      continue;
    }
    const id = deck[di++];
    const sp = SPRITES.find((s) => s.id === id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell';
    btn.dataset.idx = String(pos);
    btn.setAttribute('aria-label', 'hidden card');
    btn.innerHTML =
      '<div class="card">' +
        '<div class="face back"></div>' +
        '<div class="face front"><img alt="' + sp.name + '" draggable="false" src="' + IMG_DIR + id + '.png">' +
        '<span class="nm">' + sp.name + '</span></div>' +
      '</div>';
    boardEl.appendChild(btn);
    cells.push({ idx: pos, el: btn, img: id, faceup: false, gone: false });
  }

  // preload the used pictures so nothing pops in mid-game
  chosen.forEach((sp) => { const im = new Image(); im.src = IMG_DIR + sp.id + '.png'; });

  G = {
    gen, mode: S.mode, total, images,
    cols: dims.cols, rows: dims.rows,
    cells,
    byIdx: new Map(cells.map((c) => [c.idx, c])),
    selected: [],
    lock: true,           // unlocked after the deal animation
    over: false,
    moves: 0,             // solo score: pair attempts
    taken: { player: 0, cpu: 0 },   // pairs won (vs mode)
    turn: 'player',
    memory: new Map(),    // computer AI: grid position -> picture id
    pChance: S.p / 100,
    memCap: S.cap,
  };

  layout();
  updateHUD();
  sfx.deal();
  setTimeout(() => { if (G && G.gen === gen) G.lock = false; }, 420);
}

// ------------------------------------------------ layout ----
function layout() {
  if (!G) return;
  const wrap = $('#boardWrap');
  const cols = G.cols, rows = G.rows;
  const gap = Math.max(6, Math.min(10, Math.round(window.innerWidth / 140)));
  const pad = 2 * gap + 24;
  const availW = wrap.clientWidth - pad;
  const availH = wrap.clientHeight - pad;
  let tile = Math.floor(Math.min((availW - (cols - 1) * gap) / cols,
                                 (availH - (rows - 1) * gap) / rows));
  tile = clamp(tile, 46, 140);
  document.documentElement.style.setProperty('--tile', tile + 'px');
  document.documentElement.style.setProperty('--gap', gap + 'px');
}
window.addEventListener('resize', layout);

// ------------------------------------------------ flipping --
function flipUp(c) { c.faceup = true; c.el.classList.add('up'); sfx.flip(); }
function flipDown(c) { c.faceup = false; c.el.classList.remove('up'); sfx.flipDown(); }
function liveCells() { return G.cells.filter((c) => !c.gone); }
function aliveIdx(i) { const c = G.byIdx.get(i); return c && !c.gone; }

async function resolvePair(a, b, owner) {
  G.selected = [];
  const gen = G.gen;
  await sleep(PAIR_WAIT);
  if (!G || G.gen !== gen) return;

  if (a.img === b.img) {
    sfx.match();
    a.el.classList.add('matched');
    b.el.classList.add('matched');
    G.taken[owner]++;
    updateHUD();
    await sleep(520);
    if (!G || G.gen !== gen) return;
    a.el.classList.add('gone');
    b.el.classList.add('gone');
    a.gone = b.gone = true;
    G.memory.delete(a.idx);
    G.memory.delete(b.idx);
    if (G.mode === 'vs') {
      toast(owner === 'player' ? 'Match! You go again. 🎉' : 'Computer matched — go again 🤖');
    }
    if (liveCells().length === 0) { finish(); return; }
    G.lock = false;
    if (G.mode === 'vs' && owner === 'cpu') scheduleCpu(700);
  } else {
    sfx.miss();
    await sleep(SHOW_MS);
    if (!G || G.gen !== gen) return;
    a.el.classList.add('shake');
    b.el.classList.add('shake');
    await sleep(300);
    if (!G || G.gen !== gen) return;
    a.el.classList.remove('shake');
    b.el.classList.remove('shake');
    flipDown(a); flipDown(b);

    if (G.mode === 'vs') {
      computerLearn([a, b]);
      G.turn = (G.turn === 'player') ? 'cpu' : 'player';
      updateHUD();
      if (G.turn === 'cpu') scheduleCpu(850);
      else toast('Your turn 👋');
    }
    G.lock = false;
  }
}

// ------------------------------------------------ player ---
boardEl.addEventListener('click', (e) => {
  const el = e.target.closest('.cell');
  if (!el || el.classList.contains('hole')) return;
  onPick(parseInt(el.dataset.idx, 10));
});

function onPick(idx) {
  if (!G || G.over || G.lock) return;
  if (G.mode === 'vs' && G.turn !== 'player') return;
  const c = G.byIdx.get(idx);
  if (!c || c.gone || c.faceup) return;
  if (G.selected.length >= 2) return;

  flipUp(c);
  G.selected.push(c);
  if (G.selected.length === 2) {
    if (G.mode === 'solo') G.moves++;
    G.lock = true;
    updateHUD();
    resolvePair(G.selected[0], G.selected[1], G.mode === 'vs' ? G.turn : 'player');
  }
}

// ------------------------------------------------ computer AI
// Rules: remembers a shown card with probability p (50–95%),
// keeps at most cap (3–7) positions; a new memory evicts a random one.
// Strategy: 1) if it knows a matching pair → take it;
//           2) else flip a card it does NOT remember;
//              if it remembers that picture elsewhere → flip that card;
//           3) else flip a second card at random.
function computerLearn(cards) {
  for (const c of cards) {
    if (c.gone) continue;
    if (Math.random() < G.pChance) G.memory.set(c.idx, c.img);
  }
  while (G.memory.size > G.memCap) {
    G.memory.delete(pick([...G.memory.keys()]));
  }
}

function validMemory() {
  return [...G.memory.entries()].filter(([idx, img]) => {
    const c = G.byIdx.get(idx);
    return c && !c.gone && c.img === img;
  });
}

function scheduleCpu(ms) {
  const gen = G.gen;
  setTimeout(() => {
    if (G && G.gen === gen && G.mode === 'vs' && !G.over && G.turn === 'cpu' && !G.lock) cpuTurn();
  }, ms);
}

async function cpuTurn() {
  const gen = G.gen;
  G.lock = true;
  updateHUD();
  sfx.think();
  await sleep(900);
  if (!G || G.gen !== gen) return;

  const live = liveCells();
  const mem = validMemory();
  let a = null, b = null;

  // 1) known matching pair?
  for (let i = 0; i < mem.length && !a; i++) {
    for (let j = i + 1; j < mem.length; j++) {
      if (mem[i][1] === mem[j][1]) {
        a = G.byIdx.get(mem[i][0]);
        b = G.byIdx.get(mem[j][0]);
        break;
      }
    }
  }

  if (!a) {
    // 2) first pick: a card it does NOT remember
    const unknown = live.filter((c) => !G.memory.has(c.idx));
    a = pick(unknown.length ? unknown : live);

    // once a is face-up, the computer sees its picture —
    // does its memory hold the matching twin somewhere?
    const m = mem.find(([idx, img]) => img === a.img && idx !== a.idx && aliveIdx(idx));
    if (m) {
      b = G.byIdx.get(m[0]);
    } else {
      // 3) second card at random
      const rest = live.filter((c) => c !== a);
      b = pick(rest.length ? rest : live);
    }
  }

  // animate BOTH chosen cards flipping over, with a human-like pause between
  G.selected = [a];
  flipUp(a);
  await sleep(FLIP_MS + 550);
  if (!G || G.gen !== gen) return;
  G.selected = [a, b];
  flipUp(b);
  updateHUD();
  await sleep(320);
  if (!G || G.gen !== gen) return;
  resolvePair(a, b, 'cpu');
}

// ------------------------------------------------ HUD -------
function updateHUD() {
  if (!G) return;
  if (G.mode === 'solo') {
    const totalPairs = G.total / 2;
    const found = G.taken.player;
    const best = scores.solo[G.total + 'x' + G.images];
    statusEl.innerHTML =
      '<div class="chips">' +
        '<span class="chip">🎯 Moves: <b>' + G.moves + '</b></span>' +
        '<span class="chip">Found: <b>' + found + '</b>/' + totalPairs + '</span>' +
        (best != null ? '<span class="chip best">Best (' + G.total + '×' + G.images + '): <b>' + best + '</b></span>' : '') +
      '</div>';
  } else {
    const yourTurn = G.turn === 'player' && !G.over;
    statusEl.innerHTML =
      '<div class="chips">' +
        '<span class="chip me' + (yourTurn ? ' active' : '') + '">🧑 You: <b>' + G.taken.player + '</b></span>' +
        '<span class="chip turn">vs</span>' +
        '<span class="chip cpu' + (G.turn === 'cpu' && !G.over ? ' active' : '') + '">🤖 Computer: <b>' + G.taken.cpu + '</b></span>' +
        '<span class="chip">' + (G.over ? 'Game over' : (yourTurn ? 'Your turn' : 'Computer thinking…')) + '</span>' +
      '</div>';
  }
}

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1700);
}

// ------------------------------------------------ end -------
async function finish() {
  if (G.over) return;
  G.over = true;
  updateHUD();
  await sleep(450);

  if (G.mode === 'solo') {
    const m = G.moves;
    const key = G.total + 'x' + G.images;
    const prev = scores.solo[key];
    const newBest = (prev == null || m < prev);
    if (newBest) scores.solo[key] = m;
    saveScores();
    sfx.win();
    $('#resTitle').textContent = 'You cleared the board! 🎉';
    $('#resBody').innerHTML =
      '<div class="bigscore">' + m + ' moves</div>' +
      '<p class="resline">This game: ' + G.total + ' cards, ' + G.images + ' pictures. Fewer moves is better.</p>' +
      (newBest
        ? '<span class="newbest">🏅 New best for ' + G.total + ' cards × ' + G.images + ' pictures!</span>'
        : '<p class="resline">Best for ' + G.total + ' cards × ' + G.images + ' pictures: ' + prev + ' moves</p>');
  } else {
    const p = G.taken.player, c = G.taken.cpu;
    let title;
    if (p > c) { title = 'You beat the computer! 🏆'; sfx.win(); }
    else if (c > p) { title = 'The computer wins 🤖'; sfx.lose(); }
    else { title = "It's a draw 🤝"; sfx.tie(); }
    $('#resTitle').textContent = title;
    $('#resBody').innerHTML =
      '<div class="scorecards">' +
        '<div class="sc"><b>' + p + '</b><span>Your pairs</span></div>' +
        '<div class="sc"><b>' + c + '</b><span>Computer pairs</span></div>' +
      '</div>' +
      '<p class="resline">More pairs taken off the board wins.</p>';
  }
  resultsEl.classList.remove('hidden');
}

// ------------------------------------------------ menu ------
function setModeButtons() {
  document.querySelectorAll('#modeSeg button').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.mode === S.mode);
  });
  $('#diffBox').hidden = S.mode !== 'vs';
  $('#modeHint').textContent = S.mode === 'solo'
    ? 'Match pairs yourself — the score counts how many moves you need.'
    : 'Take turns with the computer. A match lets you go again. More pairs wins.';
}

function syncMenu() {
  applyBackColor();   // keep the swatch selection in sync with settings
  const rngT = $('#rngTotal'), rngI = $('#rngImages');
  rngT.min = String(Math.max(MIN_TOTAL, 2 * S.images));
  rngT.max = String(MAX_TOTAL);
  rngT.step = '2';
  rngT.value = String(S.total);
  rngI.min = String(MIN_IMAGES);
  rngI.max = String(Math.min(MAX_IMAGES, Math.floor(S.total / 2)));
  rngI.value = String(S.images);
  $('#valTotal').textContent = S.total + ' cards';
  $('#valImages').textContent = S.images + ' pictures';
  $('#rngP').value = String(S.p);
  $('#rngCap').value = String(S.cap);
  $('#valP').textContent = S.p + '%';
  $('#valCap').textContent = S.cap;
  markPreset();
  setModeButtons();
  renderBests();
}

function markPreset() {
  document.querySelectorAll('#presetBtns button').forEach((b) => {
    b.classList.toggle('on', +b.dataset.p === S.p && +b.dataset.c === S.cap);
  });
}

function renderBests() {
  const box = $('#bestBox');
  const cur = S.total + 'x' + S.images;
  const curBest = scores.solo[cur];
  let html = '<h3>Your solo records <span class="hint" style="font-weight:400"> (best per cards × pictures combo)</span></h3>';
  html += '<div class="bestrow cur"><span>Best for this exact setup (' + S.total + ' cards, ' + S.images + ' pictures):</span><b>' +
          (curBest != null ? curBest + ' moves' : '— not played yet —') + '</b></div>';

  const rows = Object.entries(scores.solo)
    .map(([k, v]) => { const [t, i] = k.split('x'); return { t: +t, i: +i, v }; })
    .filter((r) => r.t && r.i)
    .sort((a, b) => a.t - b.t || a.i - b.i);
  if (rows.length) {
    html += '<table class="allbests">' +
      rows.map((r) => '<tr><td>' + r.t + ' cards × ' + r.i + ' pictures</td><td>' + r.v + ' moves</td></tr>').join('') +
      '</table>';
  } else {
    html += '<p class="empty">No records yet — finish a solo game to set one.</p>';
  }
  box.innerHTML = html;
}

$('#btnMenu').addEventListener('click', () => {
  sfx.ui();
  resultsEl.classList.add('hidden');   // never leave the end-of-game popup on top of the menu
  syncMenu();
  menuEl.classList.remove('hidden');
});
$('#btnCloseMenu').addEventListener('click', () => { sfx.ui(); menuEl.classList.add('hidden'); });

$('#modeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  S.mode = b.dataset.mode === 'vs' ? 'vs' : 'solo';
  saveSettings(); setModeButtons(); sfx.ui();
});

$('#rngTotal').addEventListener('input', (e) => {
  S.total = clamp(parseInt(e.target.value, 10) || MIN_TOTAL, MIN_TOTAL, MAX_TOTAL);
  if (S.total % 2) S.total -= 1;
  if (S.images > Math.floor(S.total / 2)) S.images = Math.max(MIN_IMAGES, Math.floor(S.total / 2));
  saveSettings(); syncMenu();
});

$('#rngImages').addEventListener('input', (e) => {
  S.images = clamp(parseInt(e.target.value, 10) || MIN_IMAGES, MIN_IMAGES, MAX_IMAGES);
  if (S.total < 2 * S.images) S.total = 2 * S.images;
  if (S.total % 2) S.total += 1;
  saveSettings(); syncMenu();
});

$('#presetBtns').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  S.p = clamp(+b.dataset.p, MIN_P, MAX_P);
  S.cap = clamp(+b.dataset.c, MIN_CAP, MAX_CAP);
  saveSettings(); syncMenu(); sfx.ui();
});

$('#rngP').addEventListener('input', (e) => {
  S.p = clamp(parseInt(e.target.value, 10) || MIN_P, MIN_P, MAX_P);
  saveSettings(); $('#valP').textContent = S.p + '%'; markPreset();
});

$('#rngCap').addEventListener('input', (e) => {
  S.cap = clamp(parseInt(e.target.value, 10) || MIN_CAP, MIN_CAP, MAX_CAP);
  saveSettings(); $('#valCap').textContent = S.cap; markPreset();
});

$('#btnStart').addEventListener('click', () => {
  sfx.ui();
  menuEl.classList.add('hidden');
  resultsEl.classList.add('hidden');
  S = sanitizeSettings(S);
  startGame();
});

$('#btnRestart').addEventListener('click', () => { sfx.ui(); resultsEl.classList.add('hidden'); startGame(); });
$('#btnPlayAgain').addEventListener('click', () => { sfx.ui(); resultsEl.classList.add('hidden'); startGame(); });
$('#btnResSettings').addEventListener('click', () => {
  sfx.ui();
  resultsEl.classList.add('hidden');
  syncMenu();
  menuEl.classList.remove('hidden');
});

function updateSoundBtn() {
  $('#btnSound').textContent = S.mute ? '🔇' : '🔊';
  sfx.muted = S.mute;
}
$('#btnSound').addEventListener('click', () => {
  S.mute = !S.mute;
  saveSettings();
  updateSoundBtn();
  if (!S.mute) sfx.ui();
});

function applyTheme() {
  document.documentElement.dataset.theme = S.theme;
  const btn = $('#btnTheme');
  btn.textContent = S.theme === 'dark' ? '☀️' : '🌙';
  btn.title = S.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
}
$('#btnTheme').addEventListener('click', () => {
  S.theme = S.theme === 'dark' ? 'light' : 'dark';
  saveSettings();
  applyTheme();
  sfx.ui();
});

// card back color (paw design unchanged, only the --back-* palette swaps)
function applyBackColor() {
  const root = document.documentElement;
  if (S.backColor === 'blue') delete root.dataset.back;   // 'blue' = theme default blues
  else root.dataset.back = S.backColor;
  for (const b of document.querySelectorAll('#backBtns button'))
    b.classList.toggle('on', b.dataset.back === S.backColor);
}
$('#backBtns').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || BACKS.indexOf(b.dataset.back) < 0) return;
  S.backColor = b.dataset.back;
  saveSettings();
  applyBackColor();   // applies instantly — the board behind the menu previews it live
  sfx.ui();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!resultsEl.classList.contains('hidden')) resultsEl.classList.add('hidden');
    else if (!menuEl.classList.contains('hidden')) menuEl.classList.add('hidden');
  }
});

// unlock audio on first touch/click (browser autoplay rules)
window.addEventListener('pointerdown', () => sfx.ac(), { once: true });

// ------------------------------------------------ boot ------
updateSoundBtn();
S = sanitizeSettings(S);
applyTheme();
applyBackColor();
startGame();

// visual QA hook: index.html?qa=faces shows some cards face-up, ?qa=menu opens the menu,
// ?qa=light forces the light theme, ?back=burgundy|brown|forest|plum|slate previews a back color
try {
  const qa = new URLSearchParams(location.search).get('qa');
  const bk = new URLSearchParams(location.search).get('back');
  if (qa === 'light') document.documentElement.dataset.theme = 'light';
  if (BACKS.indexOf(bk) >= 0 && bk !== 'blue') document.documentElement.dataset.back = bk;
  if (qa === 'faces' && G) {
    // flip synchronously with no animation: the very first painted frame
    // is already static and face-up (flipping after a timer races screenshots)
    document.documentElement.classList.add('qa-static');
    G.cells.slice(0, 4).forEach((c) => c.el.classList.add('up'));
  }
  if (qa === 'menu') { setTimeout(() => { syncMenu(); menuEl.classList.remove('hidden'); }, 700); }
} catch (e) {}

})();
