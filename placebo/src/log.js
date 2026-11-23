export const LOG_LINES = [
  { kind: "info", text: "[*] Newra1n 27.0.1 · calif.io", base: 450 },
  { kind: "info", text: "[*] Checking this device", base: 800 },
  { kind: "good", text: "[+] Supported environment", base: 600 },
  { kind: "info", text: "[*] Preparing a workspace", base: 700 },
  { kind: "info", text: "[*] Spraying kernel objects...", base: 1800 },
  { kind: "info", text: "[*] Objects allocated", base: 500 },
  { kind: "info", text: "[*] Objects linked", base: 500 },
  { kind: "info", text: "[*] Scanning for a gap", base: 1400 },
  { kind: "info", text: "[*] Gap looks usable", base: 700 },
  { kind: "good", text: "[+] Got kernel r/w", base: 900 },
  { kind: "info", text: "[*] Bypassing PPL", base: 2000 },
  { kind: "info", text: "[*] Rechecking the bypass", base: 800 },
  { kind: "good", text: "[+] Bypass held", base: 700 },
  { kind: "info", text: "[*] Building a page map", base: 1200 },
  { kind: "info", text: "[*] Map covers the staged pages", base: 800 },
  { kind: "info", text: "[*] Extracting bootstrap", base: 1700, rootless: true },
  { kind: "info", text: "[*] Archive opened", base: 600, rootless: true },
  { kind: "info", text: "[*] Preparing a rootless prefix", base: 1200, rootless: true },
  { kind: "info", text: "[*] Prefix reserved", base: 700, rootless: true },
  { kind: "info", text: "[*] Installing Sileo", base: 1600 },
  { kind: "info", text: "[*] Package lists refreshed", base: 800 },
  { kind: "info", text: "[*] Enabling tweaks", base: 900 },
  { kind: "info", text: "[*] Preferences written", base: 600 },
  { kind: "info", text: "[*] Cleaning temporary state", base: 800 },
  { kind: "info", text: "[*] Temporary files removed", base: 600 },
  { kind: "info", text: "[*] Session snapshot stored", base: 600 },
  { kind: "good", text: "[+] Userspace is ready", base: 700 },
  { kind: "info", text: "[*] Asking for a userspace reboot", base: 800 },
  { kind: "good", text: "[+] Done, userspace rebooting...", base: 1100 },
];

function rollOf(random) {
  const value = Number(random());
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function fitDelays(weights, target) {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const exact = weights.map((weight) => (weight / sum) * target);
  const ms = exact.map((value) => Math.floor(value));
  let leftover = target - ms.reduce((total, value) => total + value, 0);
  const ranked = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let step = 0; step < leftover; step += 1) {
    ms[ranked[step % ranked.length].index] += 1;
  }
  return ms;
}

export function scriptLines({ rootless = true } = {}) {
  return LOG_LINES.filter((line) => rootless || line.rootless !== true);
}

export function scheduleLog(random = Math.random, options = {}) {
  const roll = () => rollOf(random);
  const lines = scriptLines(options);
  const target = 21000 + Math.floor(roll() * 8001);
  const weights = lines.map((line) => line.base * (0.7 + roll() * 0.6));
  const ms = fitDelays(weights, target);
  return lines.map((line, index) => ({
    kind: line.kind,
    text: line.text,
    ms: ms[index],
  }));
}

export function totalMs(schedule) {
  return schedule.reduce((sum, line) => sum + line.ms, 0);
}
