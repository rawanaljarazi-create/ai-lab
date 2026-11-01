import "./style.css";
import {
  bestLabel,
  formatClock,
  hintFor,
  parseBests,
  percent,
  quipFor,
  recordBest,
  roundStat,
} from "./metrics.js";
import {
  createSession,
  expire,
  glyph,
  isTypeable,
  paint,
  press,
  restart,
  summary,
} from "./session.js";

const BEST_KEY = "typing-best";

const passageEl = document.querySelector("#passage");
const hintEl = document.querySelector("#hint");
const playEl = document.querySelector("#play");
const resultsEl = document.querySelector("#results");
const wpmEl = document.querySelector("#wpm");
const accEl = document.querySelector("#acc");
const timeEl = document.querySelector("#time");
const finalWpmEl = document.querySelector("#final-wpm");
const quipEl = document.querySelector("#quip");
const finalAccEl = document.querySelector("#final-acc");
const finalCorrectEl = document.querySelector("#final-correct");
const finalRawEl = document.querySelector("#final-raw");
const finalBestEl = document.querySelector("#final-best");
const badgeEl = document.querySelector("#badge");
const againEl = document.querySelector("#again");
const catcher = document.querySelector("#catch");
const modeButtons = [...document.querySelectorAll(".modes button")];

let bests = loadBests();
let session = createSession({ duration: 30 });
let finishedMarked = false;
let lastPaint = "";
let handledInKeydown = false;

function loadBests() {
  try {
    return parseBests(localStorage.getItem(BEST_KEY));
  } catch {
    return {};
  }
}

function saveBests(records) {
  bests = records;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(records));
  } catch {
    // A private window can refuse storage. The round still finishes.
  }
}

function focusCatch() {
  catcher.focus({ preventScroll: true });
}

function bestFor(duration) {
  return bests[String(duration)] ?? 0;
}

function syncModes() {
  document.body.dataset.phase = session.phase;
  for (const button of modeButtons) {
    const on = Number(button.dataset.duration) === session.duration;
    button.setAttribute("aria-checked", on ? "true" : "false");
    button.setAttribute("aria-disabled", session.phase === "running" ? "true" : "false");
  }
}

function paintPassage() {
  const signature = `${session.phase}:${session.typed}:${session.target.length}`;
  if (signature === lastPaint) return;
  lastPaint = signature;
  const fragment = document.createDocumentFragment();
  for (const cell of paint(session)) {
    const span = document.createElement("span");
    span.className = `char ${cell.state} ${cell.word}`;
    span.textContent = glyph(cell.char, cell.state);
    fragment.append(span);
  }
  passageEl.replaceChildren(fragment);
  const caret = passageEl.querySelector(".caret");
  if (!caret) return;
  const view = passageEl.getBoundingClientRect();
  const mark = caret.getBoundingClientRect();
  const delta = mark.top - view.top;
  passageEl.scrollTop = Math.max(0, passageEl.scrollTop + delta - view.height * 0.34);
}

function commitResult() {
  if (finishedMarked || session.phase !== "done") return;
  finishedMarked = true;
  const stats = summary(session, session.endedAt);
  const outcome = recordBest(bests, session.duration, stats.wpm);
  saveBests(outcome.records);
  finalWpmEl.textContent = String(roundStat(stats.wpm));
  quipEl.textContent = quipFor(stats.wpm);
  finalAccEl.textContent = `${percent(stats.accuracy)}%`;
  finalCorrectEl.textContent = String(stats.correctChars);
  finalRawEl.textContent = String(roundStat(stats.rawWpm));
  finalBestEl.textContent = String(outcome.best);
  const label = bestLabel(outcome);
  badgeEl.hidden = label.length === 0;
  badgeEl.textContent = label;
}

function render(now) {
  if (expire(session, now)) commitResult();
  const stats = summary(session, now);
  wpmEl.textContent = String(roundStat(stats.wpm));
  accEl.textContent = String(percent(stats.accuracy));
  timeEl.textContent = String(formatClock(stats.remainingMs));
  timeEl.classList.toggle("urgent", session.phase === "running" && stats.remainingMs > 0 && stats.remainingMs <= 5000);
  syncModes();
  const finished = session.phase === "done";
  playEl.hidden = finished;
  resultsEl.hidden = !finished;
  if (finished) return;
  hintEl.textContent = hintFor(session.phase, bestFor(session.duration));
  paintPassage();
}

function begin(duration) {
  session = restart(session, { duration });
  finishedMarked = false;
  lastPaint = "";
  render(performance.now());
  focusCatch();
}

function onType(key) {
  if (session.phase === "done") {
    if (!isTypeable(key) || key === " ") return;
    begin(session.duration);
  }
  press(session, key, performance.now());
  if (session.phase === "done") commitResult();
  render(performance.now());
}

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    const next = Number(button.dataset.duration);
    if (session.phase === "running") return;
    if (next === session.duration && session.phase === "ready") {
      focusCatch();
      return;
    }
    begin(next);
  });
}

againEl.addEventListener("click", () => begin(session.duration));

catcher.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "Enter" && session.phase === "done") {
    event.preventDefault();
    begin(session.duration);
    return;
  }
  if (event.key === "Backspace") {
    event.preventDefault();
    handledInKeydown = true;
    onType("Backspace");
    return;
  }
  if (event.key.length === 1) {
    event.preventDefault();
    handledInKeydown = true;
    onType(event.key);
  }
});

catcher.addEventListener("input", () => {
  const data = catcher.value;
  catcher.value = "";
  if (handledInKeydown) {
    handledInKeydown = false;
    return;
  }
  for (const char of data) onType(char);
});

catcher.addEventListener("keyup", () => {
  handledInKeydown = false;
});

document.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button, a")) return;
  focusCatch();
});

window.addEventListener("resize", () => {
  lastPaint = "";
  render(performance.now());
});

document.fonts?.ready.then(() => {
  lastPaint = "";
  render(performance.now());
});

window.addEventListener("load", () => focusCatch());
render(performance.now());
requestAnimationFrame(function frame(now) {
  render(now);
  requestAnimationFrame(frame);
});
