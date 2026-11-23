import { aptInstall, aptRemove, planInstall, readInstalled } from "./apt.js";
import { packageByName } from "./repo.js";

function explicit(queue, action) {
  return queue.filter((item) => item.action === action && item.explicit).map((item) => item.name);
}

function rebuild(root, installs, removes) {
  const installed = readInstalled(root);
  const plan = planInstall(root, installs);
  const queue = [];
  for (const name of removes) {
    if (installed.has(name) && packageByName(name)) queue.push({ name, action: "remove", explicit: true });
  }
  for (const pkg of plan.packages) {
    queue.push({ name: pkg.name, action: "install", explicit: installs.includes(pkg.name) });
  }
  return { queue, missing: plan.missing };
}

export function queueInstall(session, name) {
  const installs = explicit(session.queue, "install");
  const removes = explicit(session.queue, "remove").filter((item) => item !== name);
  const nextInstalls = installs.includes(name) ? installs.filter((item) => item !== name) : [...installs, name];
  const rebuilt = rebuild(session.fs, nextInstalls, removes);
  if (rebuilt.missing.length && !installs.includes(name)) {
    return { ok: false, error: `Unable to locate package ${name}` };
  }
  session.queue = rebuilt.queue;
  return { ok: true };
}

export function queueRemove(session, name) {
  const installs = explicit(session.queue, "install").filter((item) => item !== name);
  const removes = explicit(session.queue, "remove");
  const nextRemoves = removes.includes(name) ? removes.filter((item) => item !== name) : [...removes, name];
  session.queue = rebuild(session.fs, installs, nextRemoves).queue;
  return { ok: true };
}

export function clearQueue(session) {
  session.queue = [];
}

export async function confirmQueue(session, options = {}) {
  const removes = session.queue.filter((item) => item.action === "remove").map((item) => item.name);
  const installs = session.queue.filter((item) => item.action === "install").map((item) => item.name);
  let stdout = "";
  let stderr = "";
  let code = 0;
  let respring = false;
  if (removes.length) {
    const removed = aptRemove(session.fs, removes, { asRoot: true, forceEssential: Boolean(options.forceEssential) });
    stdout += removed.stdout;
    stderr += removed.stderr;
    code = removed.code;
    respring = removed.respring;
  }
  if (installs.length && code === 0) {
    const installed = await aptInstall(session.fs, installs, { asRoot: true });
    stdout += installed.stdout;
    stderr += installed.stderr;
    code = installed.code;
    respring = respring || installed.respring;
  }
  if (code === 0) session.queue = [];
  return { stdout, stderr, code, respring };
}
