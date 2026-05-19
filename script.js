const stack = [];
const undoHistory = [];
let animating = false;
let animDuration = 320;

const stackContainer = document.getElementById('stackContainer');
const emptyMsg       = document.getElementById('emptyMsg');
const numInput       = document.getElementById('numInput');
const errorMsg       = document.getElementById('errorMsg');

const btnPush    = document.getElementById('btnPush');
const btnPop     = document.getElementById('btnPop');
const btnPeek    = document.getElementById('btnPeek');
const btnClear   = document.getElementById('btnClear');
const btnUndo    = document.getElementById('btnUndo');
const btnRandom  = document.getElementById('btnRandom');
const speedSlider= document.getElementById('speedSlider');
const speedVal   = document.getElementById('speedVal');

const infoSize   = document.getElementById('infoSize');
const infoTop    = document.getElementById('infoTop');
const infoStatus = document.getElementById('infoStatus');

const wait = ms => new Promise(r => setTimeout(r, ms));

function showError(msg) {
  errorMsg.textContent = msg;
  clearTimeout(showError._t);
  showError._t = setTimeout(() => errorMsg.textContent = '', 2500);
}

function clearError() { errorMsg.textContent = ''; }

function getInput() {
  const raw = numInput.value.trim();
  if (!raw) { showError('enter a number'); return null; }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) { showError('whole integers only'); return null; }
  if (n < -9999 || n > 9999) { showError('-9999 to 9999 only'); return null; }
  return n;
}

function setDur(el) {
  el.style.setProperty('--dur', `${animDuration}ms`);
}

function updatePanel() {
  const size = stack.length;
  infoSize.textContent   = size;
  infoTop.textContent    = size > 0 ? stack[size - 1] : '—';
  infoStatus.textContent = size === 0 ? 'empty' : 'not empty';

  emptyMsg.style.display = size === 0 ? '' : 'none';

  const oldMarker = stackContainer.querySelector('.top-marker');
  if (oldMarker) oldMarker.remove();

  const items = stackContainer.querySelectorAll('.stack-item');
  if (items.length > 0) {
    const topEl = stackContainer.lastElementChild;
    const marker = document.createElement('span');
    marker.className   = 'top-marker';
    marker.textContent = 'TOP';
    topEl.appendChild(marker);
  }

  items.forEach((el, di) => {
    el.querySelector('.idx').textContent = `[${di}]`;
  });
}

function makeEl(value) {
  const el  = document.createElement('div');
  el.className = 'stack-item';

  const val = document.createElement('span');
  val.className   = 'val';
  val.textContent = value;

  const idx = document.createElement('span');
  idx.className   = 'idx';
  idx.textContent = `[${stack.length - 1}]`;

  el.appendChild(val);
  el.appendChild(idx);
  return el;
}

function lockButtons(v) {
  [btnPush, btnPop, btnPeek, btnClear, btnUndo, btnRandom].forEach(b => b.disabled = v);
}

async function pushOp(value, silent = false) {
  if (stack.length >= 20) { showError('stack full (max 20)'); return; }

  animating = true;
  lockButtons(true);

  stack.push(value);
  const el = makeEl(value);
  setDur(el);
  el.classList.add('anim-in');
  stackContainer.appendChild(el);

  await wait(animDuration + 40);
  el.classList.remove('anim-in');

  updatePanel();
  if (!silent) undoHistory.push({ action: 'push', value });

  animating = false;
  lockButtons(false);
  clearError();
}

async function popOp(silent = false) {
  if (stack.length === 0) { showError('stack is empty'); return undefined; }

  animating = true;
  lockButtons(true);

  const value  = stack.pop();
  const topEl  = stackContainer.lastElementChild;

  if (topEl) {
    setDur(topEl);
    topEl.classList.add('anim-out');
    await wait(animDuration);
    topEl.remove();
  }

  updatePanel();
  if (!silent) undoHistory.push({ action: 'pop', value });

  animating = false;
  lockButtons(false);
  clearError();
  return value;
}

async function peekOp() {
  if (stack.length === 0) { showError('stack is empty'); return; }

  animating = true;
  lockButtons(true);

  const topEl = stackContainer.lastElementChild;
  if (topEl) {
    setDur(topEl);
    topEl.classList.add('anim-peek');
    await wait(animDuration + 200);
    topEl.classList.remove('anim-peek');
  }

  updatePanel();
  animating = false;
  lockButtons(false);
  clearError();
}

async function clearOp() {
  if (stack.length === 0) { showError('stack is already empty'); return; }

  animating = true;
  lockButtons(true);

  const snapshot = [...stack];
  const items = Array.from(stackContainer.querySelectorAll('.stack-item'));
  const stagger = Math.min(50, animDuration / items.length);

  items.forEach((el, i) => {
    setDur(el);
    setTimeout(() => el.classList.add('anim-fall'), i * stagger);
  });

  await wait(items.length * stagger + animDuration);
  stack.length = 0;
  items.forEach(el => el.remove());

  updatePanel();
  undoHistory.push({ action: 'clear', snapshot });

  animating = false;
  lockButtons(false);
  clearError();
}

async function undoOp() {
  if (undoHistory.length === 0) { showError('nothing to undo'); return; }

  const last = undoHistory.pop();

  if (last.action === 'push') {
    await popOp(true);
  } else if (last.action === 'pop') {
    await pushOp(last.value, true);
  } else if (last.action === 'clear') {
    for (const v of last.snapshot) await pushOp(v, true);
  }
}

btnPush.addEventListener('click', () => {
  const n = getInput();
  if (n === null) return;
  pushOp(n);
  numInput.value = '';
  numInput.focus();
});

btnPop.addEventListener('click', () => popOp());

btnPeek.addEventListener('click', () => peekOp());

btnClear.addEventListener('click', () => clearOp());

btnUndo.addEventListener('click', () => undoOp());

btnRandom.addEventListener('click', () => {
  numInput.value = Math.floor(Math.random() * 199) - 99;
  numInput.focus();
  clearError();
});

numInput.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const n = getInput();
  if (n === null) return;
  pushOp(n);
  numInput.value = '';
});

const speedLabels    = ['', 'Very Slow', 'Slow', 'Normal', 'Fast', 'Very Fast'];
const speedDurations = [0, 700, 480, 320, 180, 80];

speedSlider.addEventListener('input', () => {
  const v      = parseInt(speedSlider.value, 10);
  animDuration = speedDurations[v];
  speedVal.textContent = speedLabels[v];
});

updatePanel();
numInput.focus();