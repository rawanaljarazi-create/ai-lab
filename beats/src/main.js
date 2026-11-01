import { audio, play } from "./audio.js";
import { activeTracks, clampBpm, createPattern, decode, demoPattern, encode, nextStep, STEPS, stepSeconds, toggle, TRACKS } from "./sequencer.js";

const grid = document.getElementById("grid");
const playBtn = document.getElementById("play");
const bpmInput = document.getElementById("bpm");
const bpmOut = document.getElementById("bpm-value");

let pattern = location.hash.length > 1 ? decode(location.hash.slice(1)) : demoPattern();
let bpm = 110;
let step = 0;
let nextTime = 0;
let timer = null;
const cells = [];

TRACKS.forEach((track, t) => {
  const label = document.createElement("span");
  label.className = `label ${track.id}`;
  label.textContent = track.label;
  grid.append(label);
  cells[t] = [];
  for (let s = 0; s < STEPS; s++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `cell ${track.id}${s % 4 === 0 ? " beat" : ""}`;
    b.setAttribute("aria-label", `${track.label} step ${s + 1}`);
    b.addEventListener("click", () => {
      pattern = toggle(pattern, t, s);
      render();
      if (pattern[t][s] && !timer) play(track.id, audio().currentTime, s);
    });
    grid.append(b);
    cells[t][s] = b;
  }
});

function render(playing = -1) {
  pattern.forEach((row, t) => row.forEach((on, s) => {
    cells[t][s].classList.toggle("on", on);
    cells[t][s].setAttribute("aria-pressed", String(on));
    cells[t][s].classList.toggle("now", s === playing);
  }));
  history.replaceState(null, "", `#${encode(pattern)}`);
}

function schedule() {
  const ac = audio();
  while (nextTime < ac.currentTime + 0.1) {
    const s = step;
    for (const t of activeTracks(pattern, s)) play(TRACKS[t].id, nextTime, s);
    const delay = Math.max(0, (nextTime - ac.currentTime) * 1000);
    setTimeout(() => timer && render(s), delay);
    nextTime += stepSeconds(bpm);
    step = nextStep(step);
  }
}

function start() {
  const ac = audio();
  ac.resume();
  step = 0;
  nextTime = ac.currentTime + 0.05;
  timer = setInterval(schedule, 25);
  playBtn.textContent = "Stop";
  playBtn.setAttribute("aria-pressed", "true");
}

function stop() {
  clearInterval(timer);
  timer = null;
  render();
  playBtn.textContent = "Play";
  playBtn.setAttribute("aria-pressed", "false");
}

playBtn.addEventListener("click", () => (timer ? stop() : start()));
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target === document.body) { e.preventDefault(); timer ? stop() : start(); }
});
bpmInput.addEventListener("input", () => { bpm = clampBpm(bpmInput.value); bpmOut.textContent = bpm; });
document.getElementById("clear").addEventListener("click", () => { pattern = createPattern(); render(); });
document.getElementById("demo").addEventListener("click", () => { pattern = demoPattern(); render(); });

render();
