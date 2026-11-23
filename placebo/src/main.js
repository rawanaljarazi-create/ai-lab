import { deviceLabel } from "./device.js";
import { scheduleLog, totalMs } from "./log.js";
import { AUTO_MS, BOOT_MS, createRun, wantsAuto } from "./run.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const device = deviceLabel(navigator.userAgent);
document.querySelector("#model").textContent = device.model;
document.querySelector("#log-device").textContent = device.line;
const version = document.querySelector("#version");
if (device.version) {
  version.textContent = `iOS ${device.version}`;
  version.hidden = false;
}

const sections = {
  landing: document.querySelector("#landing"),
  log: document.querySelector("#logstage"),
  black: document.querySelector("#black"),
  boot: document.querySelector("#boot"),
  reveal: document.querySelector("#reveal"),
};
const log = document.querySelector("#log");
const bar = document.querySelector("#bar");
const barFill = document.querySelector("#bar-fill");
const pct = document.querySelector("#pct");
const bootBar = document.querySelector("#boot-bar");
const bootFill = document.querySelector("#boot-fill");
const live = document.querySelector("#live");
const go = document.querySelector("#go");
const again = document.querySelector("#again");
const theme = document.querySelector('meta[name="theme-color"]');

const liveText = {
  landing: "",
  log: "Running",
  black: "Rebooting",
  boot: "Rebooting",
  reveal: "Newra1n jailbreak complete",
};

let clock = 0;
let running = false;
let current = null;
let autoTimer = 0;

function paint(node, fill, value, label) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  fill.style.width = `${percent}%`;
  node.setAttribute("aria-valuenow", String(percent));
  if (label) label.textContent = `${percent}%`;
}

function setLogProgress(value) {
  paint(bar, barFill, value, pct);
}

function setBootProgress(value) {
  paint(bootBar, bootFill, value);
}

function stopMotion() {
  clock += 1;
}

function track(total, apply) {
  if (reduceMotion) return;
  const gen = clock;
  const started = performance.now();
  const tick = (now) => {
    if (gen !== clock) return;
    apply(Math.min(1, (now - started) / total));
    if (now - started < total) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function show(stage) {
  for (const [name, el] of Object.entries(sections)) {
    el.hidden = name !== stage;
  }
  document.body.dataset.stage = stage;
  const color = stage === "black" || stage === "boot" ? "#000000" : "#05060a";
  theme?.setAttribute("content", color);
  const message = liveText[stage] ?? "";
  if (live.textContent !== message) live.textContent = message;
}

function addLine(line) {
  const row = document.createElement("p");
  row.className = line.kind === "good" ? "good" : "info";
  row.textContent = line.text;
  log.append(row);
  if (reduceMotion) log.scrollTop = log.scrollHeight;
  else log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
}

function handleStage(stage) {
  show(stage);
  if (stage === "log") return;
  stopMotion();
  if (stage === "black") setLogProgress(1);
  if (stage === "boot") {
    setBootProgress(reduceMotion ? 1 : 0);
    track(BOOT_MS, setBootProgress);
  }
}

function start() {
  if (running) return;
  running = true;
  clearTimeout(autoTimer);
  stopMotion();
  go.disabled = true;
  log.replaceChildren();
  setLogProgress(0);
  setBootProgress(0);
  const schedule = scheduleLog();
  const total = totalMs(schedule);
  current = createRun({
    schedule,
    onStage: handleStage,
    onLine: addLine,
    onProgress: (value) => {
      if (reduceMotion) setLogProgress(value);
    },
  });
  current.start();
  track(total, setLogProgress);
}

function reset() {
  current?.cancel();
  running = false;
  stopMotion();
  clearTimeout(autoTimer);
  go.disabled = false;
  log.replaceChildren();
  setLogProgress(0);
  setBootProgress(0);
  show("landing");
}

for (const button of document.querySelectorAll(".switch")) {
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-checked") === "true";
    button.setAttribute("aria-checked", on ? "false" : "true");
  });
}

go.addEventListener("click", start);
again.addEventListener("click", reset);

if (wantsAuto(window.location.search)) {
  autoTimer = window.setTimeout(start, AUTO_MS);
}
