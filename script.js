/**
 * StackViz — script.js
 * Vanilla JS stack data structure visualizer.
 * Features: Push, Pop, Peek, Clear, Undo, Random, Speed control, Theme toggle.
 */

/* ═══════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════ */

/** Core stack array — index 0 = bottom, last index = top */
const stack = [];

/**
 * Undo history: each entry = { action: 'push'|'pop', value: number }
 * - push entry lets us undo by popping
 * - pop  entry lets us undo by pushing back
 */
const undoHistory = [];

/** Whether an animation is in progress (blocks concurrent ops) */
let animating = false;

/** Animation duration in ms — updated by speed slider */
let animDuration = 350;

/* ═══════════════════════════════════════════════════════
   DOM REFS
   ═══════════════════════════════════════════════════════ */
const stackRail  = document.getElementById('stackRail');
const emptyMsg   = document.getElementById('emptyMsg');
const numInput   = document.getElementById('numInput');
const errorMsg   = document.getElementById('errorMsg');
const opLog      = document.getElementById('opLog');

const btnPush    = document.getElementById('btnPush');
const btnPop     = document.getElementById('btnPop');
const btnPeek    = document.getElementById('btnPeek');
const btnClear   = document.getElementById('btnClear');
const btnUndo    = document.getElementById('btnUndo');
const btnRandom  = document.getElementById('btnRandom');
const btnClearLog= document.getElementById('btnClearLog');
const themeToggle= document.getElementById('themeToggle');
const speedSlider= document.getElementById('speedSlider');

const infoSize   = document.getElementById('infoSize');
const infoTop    = document.getElementById('infoTop');
const infoStatus = document.getElementById('infoStatus');
const speedVal   = document.getElementById('speedVal');

/* ═══════════════════════════════════════════════════════
   UTILITY HELPERS
   ═══════════════════════════════════════════════════════ */

/** Wait for a given number of milliseconds */
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** Show an error message, auto-clear after 2 s */
function showError(msg) {
  errorMsg.textContent = msg;
  // Shake the input
  numInput.classList.add('anim-shake');
  numInput.addEventListener('animationend', () => numInput.classList.remove('anim-shake'), { once: true });
  clearTimeout(showError._timer);
  showError._timer = setTimeout(() => (errorMsg.textContent = ''), 2500);
}

/** Clear any displayed error */
function clearError() { errorMsg.textContent = ''; }

/** Parse and validate the input field; returns number | null */
function getInputValue() {
  const raw = numInput.value.trim();
  if (raw === '') { showError('Please enter a number.'); return null; }

  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    showError('Please enter a whole integer.');
    return null;
  }
  if (n < -9999 || n > 9999) {
    showError('Value must be between -9999 and 9999.');
    return null;
  }
  return n;
}

/** Set the CSS --anim-dur variable on an element */
function setAnimDur(el) {
  el.style.setProperty('--anim-dur', `${animDuration}ms`);
}

/* ═══════════════════════════════════════════════════════
   RENDERING
   ═══════════════════════════════════════════════════════ */

/**
 * Update the info panel (size, top, status).
 * Called after every operation.
 */
function updateInfoPanel() {
  const size  = stack.length;
  const topEl = size > 0 ? stack[size - 1] : null;

  infoSize.textContent = size;
  infoTop.textContent  = topEl !== null ? topEl : '—';

  if (size === 0) {
    infoStatus.textContent = 'Empty';
    infoStatus.className   = 'info-value status-badge empty';
  } else {
    infoStatus.textContent = 'Not Empty';
    infoStatus.className   = 'info-value status-badge not-empty';
  }

  // Show/hide the empty placeholder
  emptyMsg.style.display = size === 0 ? '' : 'none';

  // Refresh TOP tag: remove old tag, add to current top element
  const existingTag = stackRail.querySelector('.top-tag');
  if (existingTag) existingTag.remove();

  const items = stackRail.querySelectorAll('.stack-item');
  if (items.length > 0) {
    // items are ordered with newest (top of stack) first in DOM due to order:-1
    const topDomItem = stackRail.querySelector('.stack-item');  // first = visual top
    const tag = document.createElement('span');
    tag.className = 'top-tag';
    tag.textContent = 'TOP';
    topDomItem.appendChild(tag);
  }

  // Refresh index labels on all items
  const allItems = stackRail.querySelectorAll('.stack-item');
  // DOM order: first child = top of stack (index stack.length-1)
  allItems.forEach((el, domIdx) => {
    const stackIdx = stack.length - 1 - domIdx;
    const idxLabel = el.querySelector('.item-index');
    if (idxLabel) idxLabel.textContent = `[${stackIdx}]`;
  });
}

/**
 * Build a stack item DOM element for a given value.
 */
function createItemEl(value) {
  const el = document.createElement('div');
  el.className = 'stack-item';
  el.dataset.value = value;

  const val = document.createElement('span');
  val.className = 'item-val';
  val.textContent = value;

  const idx = document.createElement('span');
  idx.className = 'item-index';
  idx.textContent = `[${stack.length - 1}]`; // will be updated

  el.appendChild(val);
  el.appendChild(idx);
  return el;
}

/* ═══════════════════════════════════════════════════════
   OPERATION LOG
   ═══════════════════════════════════════════════════════ */

/** Prepend a message to the operation log */
function logOp(message, type = 'push') {
  // Remove the hint line if present
  const hint = opLog.querySelector('.log-hint');
  if (hint) hint.remove();

  const li = document.createElement('li');
  li.className = `log-${type}`;

  const now = new Date();
  const ts  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  li.textContent = `[${ts}] ${message}`;

  opLog.insertBefore(li, opLog.firstChild);

  // Cap the log at 50 entries
  while (opLog.children.length > 50) opLog.removeChild(opLog.lastChild);
}

/* ═══════════════════════════════════════════════════════
   STACK OPERATIONS
   ═══════════════════════════════════════════════════════ */

/**
 * PUSH — add value to the top of the stack.
 * @param {number} value
 * @param {boolean} silent — if true, skip logging/undo tracking (used internally)
 */
async function pushOp(value, silent = false) {
  if (stack.length >= 20) {
    showError('Stack is full (max 20 items).');
    return;
  }

  animating = true;
  toggleButtons(true);

  stack.push(value);

  // Create DOM element and add to rail
  const el = createItemEl(value);
  setAnimDur(el);
  el.classList.add('anim-in');
  stackRail.appendChild(el);

  // Wait for animation
  await wait(animDuration + 50);

  el.classList.remove('anim-in');
  updateInfoPanel();

  if (!silent) {
    logOp(`Pushed ${value}`, 'push');
    undoHistory.push({ action: 'push', value });
  }

  animating = false;
  toggleButtons(false);
  clearError();
}

/**
 * POP — remove the top element.
 * @param {boolean} silent — skip log/undo tracking
 * @returns {number|undefined} popped value
 */
async function popOp(silent = false) {
  if (stack.length === 0) {
    showError('Stack is empty! Nothing to pop.');
    return undefined;
  }

  animating = true;
  toggleButtons(true);

  const value = stack.pop();

  // The top item is the first .stack-item in the DOM (order:-1 puts newest first)
  const topEl = stackRail.querySelector('.stack-item');
  if (topEl) {
    setAnimDur(topEl);
    topEl.classList.add('anim-out');
    await wait(animDuration);
    topEl.remove();
  }

  updateInfoPanel();

  if (!silent) {
    logOp(`Popped ${value}`, 'pop');
    undoHistory.push({ action: 'pop', value });
  }

  animating = false;
  toggleButtons(false);
  clearError();
  return value;
}

/**
 * PEEK — highlight the top element without removing it.
 */
async function peekOp() {
  if (stack.length === 0) {
    showError('Stack is empty! Nothing to peek.');
    return;
  }

  animating = true;
  toggleButtons(true);

  const topValue = stack[stack.length - 1];
  const topEl    = stackRail.querySelector('.stack-item');

  if (topEl) {
    setAnimDur(topEl);
    topEl.classList.add('anim-peek');
    await wait(animDuration + 200);
    topEl.classList.remove('anim-peek');
  }

  logOp(`Peeked → top is ${topValue}`, 'peek');
  updateInfoPanel();

  animating = false;
  toggleButtons(false);
  clearError();
}

/**
 * CLEAR — remove all elements with a staggered fall animation.
 */
async function clearOp() {
  if (stack.length === 0) {
    showError('Stack is already empty.');
    return;
  }

  animating = true;
  toggleButtons(true);

  // Save for undo (snapshot of stack before clear)
  const snapshot = [...stack];

  const items = Array.from(stackRail.querySelectorAll('.stack-item'));

  // Animate each item out with stagger
  const stagger = Math.min(60, animDuration / items.length);
  items.forEach((item, i) => {
    setAnimDur(item);
    setTimeout(() => item.classList.add('anim-clear'), i * stagger);
  });

  await wait(items.length * stagger + animDuration);

  // Clear state
  stack.length = 0;
  items.forEach(item => item.remove());

  updateInfoPanel();
  logOp('Cleared all elements', 'clear');

  // Push a special clear undo record
  undoHistory.push({ action: 'clear', snapshot });

  animating = false;
  toggleButtons(false);
  clearError();
}

/**
 * UNDO — reverse the last operation.
 */
async function undoOp() {
  if (undoHistory.length === 0) {
    showError('Nothing to undo.');
    return;
  }

  const last = undoHistory.pop();

  if (last.action === 'push') {
    // Undo a push → pop silently
    await popOp(true);
    logOp(`Undo: removed ${last.value}`, 'undo');
  } else if (last.action === 'pop') {
    // Undo a pop → push back silently
    await pushOp(last.value, true);
    logOp(`Undo: restored ${last.value}`, 'undo');
  } else if (last.action === 'clear') {
    // Undo a clear → push back all items silently in order
    for (const v of last.snapshot) {
      await pushOp(v, true);
    }
    logOp(`Undo: restored ${last.snapshot.length} item(s)`, 'undo');
  }
}

/* ═══════════════════════════════════════════════════════
   BUTTON STATE MANAGEMENT
   ═══════════════════════════════════════════════════════ */

/** Disable or enable all action buttons during animation */
function toggleButtons(disabled) {
  [btnPush, btnPop, btnPeek, btnClear, btnUndo, btnRandom].forEach(b => {
    b.disabled = disabled;
  });
}

/* ═══════════════════════════════════════════════════════
   EVENT LISTENERS
   ═══════════════════════════════════════════════════════ */

// Push button
btnPush.addEventListener('click', () => {
  const n = getInputValue();
  if (n === null) return;
  pushOp(n);
  numInput.value = '';
  numInput.focus();
});

// Pop button
btnPop.addEventListener('click', () => {
  popOp();
  numInput.focus();
});

// Peek button
btnPeek.addEventListener('click', () => {
  peekOp();
});

// Clear button
btnClear.addEventListener('click', () => {
  clearOp();
});

// Undo button
btnUndo.addEventListener('click', () => {
  undoOp();
});

// Random number button
btnRandom.addEventListener('click', () => {
  const r = Math.floor(Math.random() * 199) - 99;  // -99 to 99
  numInput.value = r;
  numInput.focus();
  clearError();
});

// Allow pressing Enter in the input to push
numInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const n = getInputValue();
    if (n === null) return;
    pushOp(n);
    numInput.value = '';
  }
});

// Clear the log
btnClearLog.addEventListener('click', () => {
  opLog.innerHTML = '<li class="log-hint">Operations will appear here…</li>';
});

// Theme toggle (dark ↔ light)
themeToggle.addEventListener('click', () => {
  const html = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? 'light' : 'dark';
  themeToggle.querySelector('.theme-icon').textContent = isDark ? '🌙' : '☀';
});

// Speed slider
const speedLabels = ['', 'Very Slow', 'Slow', 'Normal', 'Fast', 'Very Fast'];
const speedDurations = [0, 700, 500, 350, 200, 100];

speedSlider.addEventListener('input', () => {
  const v = parseInt(speedSlider.value, 10);
  animDuration = speedDurations[v];
  speedVal.textContent = speedLabels[v];
});

/* ═══════════════════════════════════════════════════════
   INITIALISATION
   ═══════════════════════════════════════════════════════ */

// Set initial state
updateInfoPanel();
numInput.focus();

// Pre-load a couple of demo items so users see the visualization immediately
(async () => {
  await pushOp(42, true);
  await pushOp(17, true);
  await pushOp(8,  true);
  logOp('Welcome! Stack pre-loaded with demo data.', 'push');
})();