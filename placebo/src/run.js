export const AUTO_MS = 1000;
export const BLACK_MS = 800;
export const BOOT_MS = 4200;

export function wantsAuto(search) {
  const query = String(search || "").replace(/^\?/, "");
  return new URLSearchParams(query).get("auto") === "1";
}

export function createRun({
  schedule,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  blackMs = BLACK_MS,
  bootMs = BOOT_MS,
  onStage = () => {},
  onLine = () => {},
  onProgress = () => {},
}) {
  let timers = [];
  let stopped = true;

  function later(fn, ms) {
    const id = setTimer(() => {
      if (stopped) return;
      fn();
    }, ms);
    timers.push(id);
    return id;
  }

  function cancel() {
    stopped = true;
    for (const id of timers) clearTimer(id);
    timers = [];
  }

  function reboot() {
    onStage("black");
    later(() => {
      onStage("boot");
      later(() => {
        onStage("reveal");
      }, bootMs);
    }, blackMs);
  }

  function start() {
    cancel();
    stopped = false;
    const total = schedule.reduce((sum, line) => sum + line.ms, 0);
    let cursor = 0;
    onStage("log");
    onProgress(0);
    for (const line of schedule) {
      const at = cursor;
      later(() => {
        onLine(line);
        onProgress(total === 0 ? 1 : (at + line.ms) / total);
      }, at);
      cursor += line.ms;
    }
    later(() => {
      onProgress(1);
      reboot();
    }, cursor);
  }

  return { start, cancel };
}
