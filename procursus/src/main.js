import { aptUpdate } from "./apt.js";
import { mountSileo } from "./sileo.js";
import { bannerText, complete, createSession, promptOf, runLine, writeEditor } from "./shell.js";

const STORAGE_KEY = "procursus.sim.v1";

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSession();
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !data.session?.fs) return createSession();
    return data.session;
  } catch {
    return createSession();
  }
}

function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, session }));
}

const session = loadSession();
const app = document.querySelector("#app");
app.innerHTML = `
  <header class="top">
    <div class="brand">
      <a href="/">ai-lab</a>
      <strong>Procursus</strong>
      <small>Simulated rootless shell. No network, no device.</small>
    </div>
    <div class="switch" role="tablist" aria-label="View">
      <button type="button" id="show-term" role="tab" aria-selected="true">Terminal</button>
      <button type="button" id="show-sileo" role="tab" aria-selected="false">Sileo</button>
    </div>
  </header>
  <section id="term" class="term">
    <div id="screen" class="screen" tabindex="0">
      <div id="log" class="log"></div>
      <div class="cmdline">
        <span id="prompt" class="prompt"></span>
        <input id="input" aria-label="Terminal input" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="send" />
      </div>
    </div>
    <div class="keys" aria-label="Extra keys">
      <button type="button" data-key="Tab">Tab</button>
      <button type="button" data-key="Escape">Esc</button>
      <button type="button" data-key="Control">Ctrl</button>
      <button type="button" data-key="ArrowUp">↑</button>
      <button type="button" data-key="ArrowDown">↓</button>
      <button type="button" data-key="ArrowLeft">←</button>
      <button type="button" data-key="ArrowRight">→</button>
      <button type="button" data-key="/">/</button>
      <button type="button" data-key="-">-</button>
    </div>
  </section>
  <section id="sileo" class="sileo" hidden></section>
  <div id="respring" class="respring" hidden>
    <div class="spin"></div>
    <p>SpringBoard</p>
  </div>
  <div id="editor" class="editor" hidden>
    <header>
      <strong id="editor-title">edit</strong>
      <div>
        <button type="button" id="editor-cancel">Cancel</button>
        <button type="button" id="editor-save">Save</button>
      </div>
    </header>
    <p id="editor-error" class="warn" hidden></p>
    <textarea id="editor-text" aria-label="File editor" spellcheck="false" autocapitalize="none" autocorrect="off"></textarea>
  </div>
`;

const log = document.querySelector("#log");
const input = document.querySelector("#input");
const prompt = document.querySelector("#prompt");
const screen = document.querySelector("#screen");
const term = document.querySelector("#term");
const sileo = document.querySelector("#sileo");
const respring = document.querySelector("#respring");
const editor = document.querySelector("#editor");
const editorText = document.querySelector("#editor-text");
const editorError = document.querySelector("#editor-error");
const ctrlKey = document.querySelector('[data-key="Control"]');

let historyPos = session.history.length;
let draft = "";
let ctrl = false;
let editorPath = "";
let frameTimer = 0;

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function paintPrompt() {
  const parts = promptOf(session);
  prompt.innerHTML = `<span class="user">${esc(parts.user)}</span>@<span class="host">${esc(parts.host)}</span> <span class="cwd">${esc(parts.cwd)}</span> <span class="sigil">${esc(parts.sigil)}</span>`;
}

function write(text, kind) {
  if (!text) return;
  const node = document.createElement("span");
  if (kind) node.className = kind;
  node.textContent = text;
  log.append(node);
}

function scrollDown() {
  screen.scrollTop = screen.scrollHeight;
}

function showBanner() {
  write(bannerText());
  paintPrompt();
  scrollDown();
}

function setView(name) {
  const terminal = name === "term";
  term.hidden = !terminal;
  sileo.hidden = terminal;
  document.querySelector("#show-term").setAttribute("aria-selected", String(terminal));
  document.querySelector("#show-sileo").setAttribute("aria-selected", String(!terminal));
  document.body.dataset.view = name;
  if (terminal) input.focus();
  else sileoView.refresh();
}

function playRespring() {
  respring.hidden = false;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => {
    respring.hidden = true;
  }, reduce ? 250 : 1700);
}

function openEditor(file) {
  editorPath = file.path;
  editor.hidden = false;
  editorError.hidden = true;
  document.querySelector("#editor-title").textContent = `${file.title}  ${file.path}`;
  editorText.value = file.content;
  editorText.focus();
}

function playFrames(frames) {
  window.clearTimeout(frameTimer);
  const node = document.createElement("pre");
  node.className = "frames";
  log.append(node);
  let index = 0;
  const step = () => {
    node.textContent = frames[index];
    scrollDown();
    index += 1;
    if (index < frames.length) frameTimer = window.setTimeout(step, 90);
  };
  step();
}

function handleEffects(effects) {
  if (!effects) return;
  if (effects.clear) log.textContent = "";
  if (effects.frames?.length) playFrames(effects.frames);
  if (effects.edit) openEditor(effects.edit);
  if (effects.respring) playRespring();
  if (effects.openSileo) setView("sileo");
  if (effects.logout) input.placeholder = "enter to reconnect";
  if (effects.reset) {
    input.placeholder = "";
    showBanner();
  }
}

function submit(line) {
  if (!session.connected && line.trim() === "") {
    session.connected = true;
    input.placeholder = "";
    showBanner();
    saveSession(session);
    return;
  }
  write(`${prompt.textContent} ${line}\n`);
  const result = runLine(session, line);
  if (result.effects?.clear || result.effects?.reset) log.textContent = "";
  if (!(result.effects?.frames)) write(result.stdout);
  write(result.stderr, "err");
  handleEffects(result.effects);
  historyPos = session.history.length;
  draft = "";
  paintPrompt();
  saveSession(session);
  sileoView.refresh();
  scrollDown();
}

function insert(text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const caret = start + text.length;
  input.setSelectionRange(caret, caret);
}

function onTab() {
  const result = complete(session, input.value, input.selectionStart ?? input.value.length);
  if (result.matches.length > 1 && result.line === input.value) {
    write(`${prompt.textContent} ${input.value}\n${result.matches.join("  ")}\n`);
    scrollDown();
    return;
  }
  input.value = result.line;
  input.setSelectionRange(result.cursor, result.cursor);
}

function onControl(key) {
  ctrl = false;
  ctrlKey.classList.remove("on");
  if (key === "c") {
    write(`${prompt.textContent} ${input.value}^C\n`);
    input.value = "";
    scrollDown();
    return;
  }
  if (key === "l") {
    log.textContent = "";
    return;
  }
  if (key === "u") input.value = "";
  if (key === "d" && input.value === "") submit("exit");
}

input.addEventListener("keydown", (event) => {
  if (ctrl && event.key.length === 1) {
    event.preventDefault();
    onControl(event.key.toLowerCase());
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const line = input.value;
    input.value = "";
    submit(line);
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    onTab();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    input.value = "";
    ctrl = false;
    ctrlKey.classList.remove("on");
    return;
  }
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    if (event.key === "ArrowUp") {
      if (historyPos === session.history.length) draft = input.value;
      historyPos = Math.max(0, historyPos - 1);
    } else {
      historyPos = Math.min(session.history.length, historyPos + 1);
    }
    input.value = historyPos === session.history.length ? draft : session.history[historyPos];
  }
});

document.querySelectorAll(".keys button").forEach((button) => {
  const keep = (event) => event.preventDefault();
  button.addEventListener("mousedown", keep);
  button.addEventListener("touchstart", keep, { passive: false });
  button.addEventListener("click", () => {
    const key = button.dataset.key;
    input.focus();
    if (key === "Tab") onTab();
    else if (key === "Escape") input.value = "";
    else if (key === "Control") {
      ctrl = !ctrl;
      ctrlKey.classList.toggle("on", ctrl);
    } else if (key === "ArrowUp" || key === "ArrowDown") {
      input.dispatchEvent(new KeyboardEvent("keydown", { key }));
    } else if (key === "ArrowLeft" || key === "ArrowRight") {
      const delta = key === "ArrowLeft" ? -1 : 1;
      const pos = (input.selectionStart ?? 0) + delta;
      input.setSelectionRange(pos, pos);
    } else insert(key);
  });
});

screen.addEventListener("click", (event) => {
  if (event.target.closest("a, button, input, textarea")) return;
  input.focus();
});

document.querySelector("#show-term").addEventListener("click", () => setView("term"));
document.querySelector("#show-sileo").addEventListener("click", () => setView("sileo"));

document.querySelector("#editor-cancel").addEventListener("click", () => {
  editor.hidden = true;
  input.focus();
});
document.querySelector("#editor-save").addEventListener("click", () => {
  const saved = writeEditor(session, editorPath, editorText.value);
  if (!saved.ok) {
    editorError.hidden = false;
    editorError.textContent = saved.error;
    return;
  }
  editor.hidden = true;
  saveSession(session);
  write(`wrote ${editorPath}\n`);
  input.focus();
});

const sileoView = mountSileo(sileo, session, {
  onChange() {
    saveSession(session);
  },
  onRespring() {
    playRespring();
  },
  onRefresh() {
    this.lastRefresh = aptUpdate(session.fs, { asRoot: true });
    saveSession(session);
  },
  lastRefresh: { stdout: "", stderr: "", code: 0 },
});

showBanner();
setView("term");
input.focus();
