import {
  aptDownload,
  aptInstall,
  aptList,
  aptRemove,
  aptSearch,
  aptShow,
  aptUpdate,
  dpkgFiles,
  dpkgInstall,
  dpkgList,
  readInstalled,
} from "./apt.js";
import { CATALOG, debFileName, packageByName } from "./catalog.js";
import {
  baseName,
  canWrite,
  copyPath,
  formatLong,
  logicalResolve,
  lookup,
  mkdirp,
  movePath,
  readFile,
  removePath,
  writeFile,
} from "./fs.js";
import { seedFilesystem } from "./seed.js";
import { DEVICE, unameLine } from "./system.js";

const BUILTINS = [
  "ls", "cd", "pwd", "cat", "echo", "touch", "mkdir", "rm", "mv", "cp",
  "edit", "nano", "clear", "whoami", "id", "uname", "sw_vers", "neofetch",
  "fastfetch", "ps", "top", "history", "which", "env", "export", "grep",
  "head", "tail", "wc", "man", "help", "exit", "reset-env", "sudo",
];

const PATH_HANDLERS = new Set([
  "apt", "apt-get", "dpkg", "cowsay", "sl", "htop", "vim", "git", "curl", "wget",
  "python3", "ssh", "ldid", "uicache", "sbreload", "respring", "launchctl",
  "killall", "jbctl", "dopamine", "sileo", "open", "less", "perl", "sed", "gzip",
  "tar", "xz", "file", "openssl", "bash", "zsh", "sh",
]);

export function baseEnv(user) {
  const home = user === "root" ? "/var/root" : "/var/mobile";
  return {
    USER: user,
    LOGNAME: user,
    HOME: home,
    SHELL: "/var/jb/usr/bin/zsh",
    PATH: "/var/jb/usr/bin:/var/jb/bin:/var/jb/usr/sbin:/var/jb/sbin:/usr/bin:/bin:/usr/sbin:/sbin",
    LANG: "en_US.UTF-8",
    TERM: "xterm-256color",
    TMPDIR: "/private/var/tmp",
  };
}

export function createSession() {
  return {
    version: 1,
    fs: seedFilesystem(),
    user: "mobile",
    cwd: "/var/mobile",
    env: baseEnv("mobile"),
    history: [],
    stack: null,
    connected: true,
    queue: [],
    recent: [],
    oldpwd: "/var/mobile",
  };
}

export function resetSession(session) {
  const next = createSession();
  for (const key of Object.keys(session)) delete session[key];
  Object.assign(session, next);
}

export function bannerText(now = new Date()) {
  const stamp = now.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return [
    "NOT real Procursus.",
    "This is a browser simulation. There is no phone, no bootstrap, and apt.procurs.us is never contacted.",
    "",
    `Last login: ${stamp} UTC from 127.0.0.1`,
    `Procursus ${DEVICE.procursus} — rootless — Dopamine ${DEVICE.dopamine}`,
    `${DEVICE.product} · iOS ${DEVICE.productVersion} (${DEVICE.build}) · Darwin ${DEVICE.arch}`,
    "Sileo manages this bootstrap through apt.",
    "",
  ].join("\n");
}

export function promptOf(session) {
  const home = session.env.HOME;
  let shown = session.cwd;
  if (shown === home) shown = "~";
  else if (home && shown.startsWith(`${home}/`)) shown = `~${shown.slice(home.length)}`;
  return {
    user: session.user,
    host: DEVICE.hostname,
    cwd: shown,
    sigil: session.user === "root" ? "#" : "%",
  };
}

export function promptText(session) {
  const prompt = promptOf(session);
  return `${prompt.user}@${prompt.host} ${prompt.cwd} ${prompt.sigil}`;
}

function done(stdout = "", stderr = "", code = 0, effects = null) {
  const result = { stdout, stderr, code };
  if (effects) result.effects = effects;
  return result;
}

function deny(path) {
  return done("", `${path}: Permission denied\n`, 1);
}

function fsError(prefix, path, error) {
  const message = {
    ENOENT: "No such file or directory",
    ENOTDIR: "Not a directory",
    EISDIR: "Is a directory",
    EEXIST: "File exists",
    ENOTEMPTY: "Directory not empty",
    ELOOP: "Too many levels of symbolic links",
    EINVAL: "Invalid argument",
  }[error] ?? error;
  return done("", `${prefix}: ${path}: ${message}\n`, 1);
}

function findInPath(session, name) {
  if (!name) return null;
  if (name.includes("/")) {
    const path = logicalResolve(session.cwd, name, session.env.HOME);
    const found = lookup(session.fs, path, { followLast: true });
    if (!found.error && found.node.type === "file" && found.node.mode & 0o111) return path;
    return null;
  }
  for (const dir of session.env.PATH.split(":").filter(Boolean)) {
    const full = `${dir}/${name}`;
    const found = lookup(session.fs, full, { followLast: true });
    if (!found.error && found.node.type === "file" && found.node.mode & 0o111) return full;
  }
  return null;
}

export function commandNames(session) {
  const names = new Set(BUILTINS);
  for (const dir of session.env.PATH.split(":").filter(Boolean)) {
    const found = lookup(session.fs, dir, { followLast: true });
    if (found.error || found.node.type !== "dir") continue;
    for (const [name, node] of Object.entries(found.node.children)) {
      const target = node.type === "link" ? lookup(session.fs, `${dir}/${name}`, { followLast: true }) : { node };
      if (!target.error && target.node.type === "file" && target.node.mode & 0o111) names.add(name);
    }
  }
  return [...names].sort();
}

function resolveUserPath(session, input) {
  return logicalResolve(session.cwd, input, session.env.HOME);
}

function parseFlags(argv) {
  const flags = new Set();
  const rest = [];
  let number = null;
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (/^-\d+$/.test(arg)) {
      number = Number(arg.slice(1));
      continue;
    }
    if (arg.startsWith("-") && arg !== "-") {
      for (const char of arg.slice(1)) flags.add(char);
      if (flags.has("n") && argv[i + 1] && /^-?\d+$/.test(argv[i + 1])) number = Number(argv[++i]);
      continue;
    }
    rest.push(arg);
  }
  return { flags, rest, number };
}

function listLong(session, path, flags) {
  const stat = lookup(session.fs, path, { followLast: false });
  if (stat.error) return fsError("ls", path, stat.error);
  const target = stat.node.type === "link" ? lookup(session.fs, path, { followLast: true }) : stat;
  const asDir = !flags.has("d") && !target.error && target.node.type === "dir";
  if (!asDir) return done(`${formatLong(path, stat.node)}\n`);
  const names = Object.keys(target.node.children).filter((name) => flags.has("a") || !name.startsWith("."));
  if (flags.has("a")) names.push(".", "..");
  names.sort((a, b) => a.localeCompare(b));
  if (!flags.has("l")) return done(names.length ? `${names.join("  ")}\n` : "");
  const rows = names.map((name) => {
    if (name === ".") return formatLong(".", target.node);
    if (name === "..") return formatLong("..", target.node);
    return formatLong(name, target.node.children[name]);
  });
  return done(`total ${Math.max(1, rows.length)}\n${rows.join("\n")}\n`);
}

function cmdLs(session, argv) {
  const { flags, rest } = parseFlags(argv);
  const paths = rest.length ? rest : ["."];
  const chunks = [];
  for (const input of paths) {
    const path = resolveUserPath(session, input);
    const listed = listLong(session, path, flags);
    if (listed.code !== 0) return listed;
    chunks.push(listed.stdout);
  }
  return done(chunks.join(paths.length > 1 ? "\n" : ""));
}

function cmdCd(session, argv) {
  const requested = argv[1] && argv[1] !== "~" ? argv[1] : session.env.HOME;
  const path = requested === "-" ? session.oldpwd : resolveUserPath(session, requested);
  const found = lookup(session.fs, path, { followLast: true });
  if (found.error) return fsError("cd", requested, found.error);
  if (found.node.type !== "dir") return fsError("cd", requested, "ENOTDIR");
  session.oldpwd = session.cwd;
  session.cwd = requested === "-" ? path : resolveUserPath(session, requested);
  return done(requested === "-" ? `${session.cwd}\n` : "");
}

function cmdPwd(session, argv) {
  if (argv.includes("-P")) {
    const found = lookup(session.fs, session.cwd, { followLast: true });
    return done(`${found.realPath ?? session.cwd}\n`);
  }
  return done(`${session.cwd}\n`);
}

function readText(session, path) {
  const resolved = resolveUserPath(session, path);
  const file = readFile(session.fs, resolved);
  if (file.error) return file;
  return { content: file.content, path: resolved };
}

function cmdCat(session, argv, stdin) {
  const files = argv.slice(1);
  if (!files.length) return done(stdin ?? "");
  const chunks = [];
  for (const file of files) {
    const read = readText(session, file);
    if (read.error) return fsError("cat", file, read.error);
    chunks.push(read.content.endsWith("\n") || read.content === "" ? read.content : `${read.content}\n`);
  }
  return done(chunks.join(""));
}

function cmdEcho(argv) {
  let newline = true;
  const args = argv.slice(1);
  if (args[0] === "-n") {
    newline = false;
    args.shift();
  }
  return done(`${args.join(" ")}${newline ? "\n" : ""}`);
}

function cmdTouch(session, argv) {
  const files = argv.slice(1).filter((arg) => arg !== "--");
  if (!files.length) return done("", "touch: missing file operand\n", 1);
  for (const file of files) {
    const path = resolveUserPath(session, file);
    if (!canWrite(session.fs, session.user, path)) return deny(`touch: ${file}`);
    const existing = lookup(session.fs, path, { followLast: true });
    if (!existing.error && existing.node.type === "dir") return fsError("touch", file, "EISDIR");
    if (!existing.error && existing.node.type === "file") {
      existing.node.mtime = Date.now();
      continue;
    }
    const wrote = writeFile(session.fs, path, "", {
      mode: 0o644,
      owner: session.user,
      group: session.user === "root" ? "wheel" : "mobile",
      mtime: Date.now(),
    });
    if (wrote.error) return fsError("touch", file, wrote.error);
  }
  return done();
}

function cmdMkdir(session, argv) {
  const { flags, rest } = parseFlags(argv);
  if (!rest.length) return done("", "mkdir: missing operand\n", 1);
  for (const input of rest) {
    const path = resolveUserPath(session, input);
    if (!canWrite(session.fs, session.user, path)) return deny(`mkdir: ${input}`);
    if (flags.has("p")) {
      const made = mkdirp(session.fs, path, {
        owner: session.user,
        group: session.user === "root" ? "wheel" : "mobile",
      });
      if (made.error) return fsError("mkdir", input, made.error);
      continue;
    }
    const existing = lookup(session.fs, path, { followLast: false });
    if (!existing.error) return fsError("mkdir", input, "EEXIST");
    const made = mkdirp(session.fs, path, {
      owner: session.user,
      group: session.user === "root" ? "wheel" : "mobile",
    });
    if (made.error) return fsError("mkdir", input, made.error);
  }
  return done();
}

function cmdRm(session, argv) {
  const { flags, rest } = parseFlags(argv);
  if (!rest.length) return done("", "rm: missing operand\n", 1);
  for (const input of rest) {
    const path = resolveUserPath(session, input);
    if (path === "/") return done("", "rm: refusing to remove / from this shell\n", 1);
    if (!canWrite(session.fs, session.user, path)) return deny(`rm: ${input}`);
    const removed = removePath(session.fs, path, { recursive: flags.has("r") || flags.has("R"), force: flags.has("f") });
    if (removed.error) return fsError("rm", input, removed.error);
  }
  return done();
}

function cmdCp(session, argv) {
  const { flags, rest } = parseFlags(argv);
  if (rest.length < 2) return done("", "cp: missing file operand\n", 1);
  const dest = rest.pop();
  for (const input of rest) {
    const from = resolveUserPath(session, input);
    const to = resolveUserPath(session, dest);
    if (!canWrite(session.fs, session.user, to)) return deny(`cp: ${dest}`);
    const copied = copyPath(session.fs, from, to, { recursive: flags.has("r") || flags.has("R") });
    if (copied.error) return fsError("cp", input, copied.error);
  }
  return done();
}

function cmdMv(session, argv) {
  const { rest } = parseFlags(argv);
  if (rest.length < 2) return done("", "mv: missing file operand\n", 1);
  const dest = rest.pop();
  for (const input of rest) {
    const from = resolveUserPath(session, input);
    const to = resolveUserPath(session, dest);
    if (!canWrite(session.fs, session.user, from) || !canWrite(session.fs, session.user, to)) return deny(`mv: ${input}`);
    const moved = movePath(session.fs, from, to);
    if (moved.error) return fsError("mv", input, moved.error);
  }
  return done();
}

function cmdEdit(session, argv) {
  const input = argv[1] ?? "untitled.txt";
  const path = resolveUserPath(session, input);
  const existing = readFile(session.fs, path);
  const content = existing.error ? "" : existing.content;
  if (existing.error && existing.error !== "ENOENT") return fsError(argv[0], input, existing.error);
  return done("", "", 0, { edit: { path, content, title: argv[0] } });
}

function cmdWhoami(session) {
  return done(`${session.user}\n`);
}

function cmdId(session) {
  if (session.user === "root") return done("uid=0(root) gid=0(wheel) groups=0(wheel)\n");
  return done("uid=501(mobile) gid=501(mobile) groups=501(mobile),20(staff)\n");
}

function cmdUname(argv) {
  if (argv.includes("-m")) return done(`${DEVICE.arch}\n`);
  if (argv.includes("-s")) return done("Darwin\n");
  return done(`${unameLine()}\n`);
}

function cmdSwVers(argv) {
  const product = argv.includes("-productName");
  const version = argv.includes("-productVersion");
  const build = argv.includes("-buildVersion");
  if (product) return done(`${DEVICE.productName}\n`);
  if (version) return done(`${DEVICE.productVersion}\n`);
  if (build) return done(`${DEVICE.build}\n`);
  return done(
    `ProductName:    ${DEVICE.productName}\nProductVersion: ${DEVICE.productVersion}\nBuildVersion:   ${DEVICE.build}\n`,
  );
}

function infoLines(session) {
  const installed = readInstalled(session.fs);
  return [
    `OS: iOS ${DEVICE.productVersion} ${DEVICE.arch}`,
    `Host: ${DEVICE.product}`,
    `Kernel: Darwin ${DEVICE.darwin}`,
    `Uptime: 2 hours, 14 mins`,
    `Shell: zsh 5.9`,
    `Bootstrap: Procursus ${DEVICE.procursus} (rootless)`,
    `Jailbreak: Dopamine ${DEVICE.dopamine}`,
    `Packages: ${installed.size}`,
    `User: ${session.user}`,
  ];
}

const PHONE = [
  "        .--------.",
  "       /          \\",
  "      |   ______   |",
  "      |  |      |  |",
  "      |  | iOS  |  |",
  "      |  |______|  |",
  "      |            |",
  "      |    ____    |",
  "       \\  |____|  /",
  "        `--------'",
];

function cmdNeofetch(session) {
  const facts = infoLines(session);
  const width = Math.max(...PHONE.map((line) => line.length));
  const rows = Math.max(PHONE.length, facts.length);
  const lines = [];
  for (let i = 0; i < rows; i += 1) {
    const art = (PHONE[i] ?? "").padEnd(width, " ");
    const fact = facts[i] ? `  ${facts[i]}` : "";
    lines.push(`${art}${fact}`);
  }
  return done(`${lines.join("\n")}\n`);
}

function cmdFastfetch(session) {
  return done(`${promptText(session)}\n${"-".repeat(promptText(session).length)}\n${infoLines(session).join("\n")}\n`);
}

function cmdPs() {
  return done(
    [
      "  PID TTY           TIME CMD",
      "    1 ??         0:01.20 launchd",
      "   88 ??         0:42.11 SpringBoard",
      "  140 ??         0:03.02 Sileo",
      "  188 ??         0:00.40 backboardd",
      "  203 ttys000    0:00.08 zsh",
      "",
    ].join("\n"),
  );
}

function cmdTop() {
  return done(
    [
      "Processes: 42 total, 2 running, 40 sleeping",
      "CPU usage: 6.1% user, 3.4% sys, 90.5% idle",
      "PhysMem: 2148M used, 5890M unused",
      "",
      "PID    COMMAND          %CPU  MEM",
      "88     SpringBoard      2.1   180M",
      "140    Sileo            0.4    96M",
      "203    zsh              0.1     8M",
      "1      launchd          0.0    12M",
      "",
    ].join("\n"),
  );
}

function cmdHistory(session) {
  const lines = session.history.map((line, index) => `${String(index + 1).padStart(4, " ")}  ${line}`);
  return done(lines.length ? `${lines.join("\n")}\n` : "");
}

function cmdWhich(session, argv) {
  const name = argv[1];
  if (!name) return done("", "which: missing argument\n", 1);
  const path = findInPath(session, name);
  if (path) return done(`${path}\n`);
  if (BUILTINS.includes(name)) return done(`${name}: shell builtin\n`);
  return done("", `which: no ${name} in (${session.env.PATH})\n`, 1);
}

function cmdEnv(session) {
  const lines = Object.keys(session.env).sort().map((key) => `${key}=${session.env[key]}`);
  return done(`${lines.join("\n")}\n`);
}

function cmdExport(session, argv) {
  const args = argv.slice(1);
  if (!args.length) return cmdEnv(session);
  for (const arg of args) {
    const eq = arg.indexOf("=");
    if (eq <= 0) return done("", `export: \`${arg}': not a valid identifier\n`, 1);
    session.env[arg.slice(0, eq)] = arg.slice(eq + 1);
  }
  return done();
}

function loadSources(session, files, stdin, label) {
  if (!files.length) return { sources: [{ name: null, text: stdin ?? "" }] };
  const sources = [];
  for (const file of files) {
    const read = readText(session, file);
    if (read.error) return { error: fsError(label, file, read.error) };
    sources.push({ name: file, text: read.content });
  }
  return { sources };
}

function cmdGrep(session, argv, stdin) {
  const { flags, rest } = parseFlags(argv);
  if (!rest.length) return done("", "grep: missing pattern\n", 1);
  const pattern = rest[0];
  const loaded = loadSources(session, rest.slice(1), stdin, "grep");
  if (loaded.error) return loaded.error;
  const needle = flags.has("i") ? pattern.toLowerCase() : pattern;
  const lines = [];
  let matched = false;
  for (const source of loaded.sources) {
    const rows = source.text.split(/\n/);
    rows.forEach((row, index) => {
      if (index === rows.length - 1 && row === "") return;
      const hay = flags.has("i") ? row.toLowerCase() : row;
      const hit = hay.includes(needle);
      if (flags.has("v") ? hit : !hit) return;
      matched = true;
      const prefix = source.name ? `${source.name}:` : "";
      const number = flags.has("n") ? `${index + 1}:` : "";
      lines.push(`${prefix}${number}${row}`);
    });
  }
  return done(lines.length ? `${lines.join("\n")}\n` : "", "", matched ? 0 : 1);
}

function cmdHead(session, argv, stdin) {
  const { rest, number } = parseFlags(argv);
  const count = number ?? 10;
  const loaded = loadSources(session, rest, stdin, "head");
  if (loaded.error) return loaded.error;
  const chunks = loaded.sources.map((source) => source.text.split(/\n/).slice(0, count).join("\n"));
  const text = chunks.join("\n");
  return done(text.endsWith("\n") || text === "" ? text : `${text}\n`);
}

function cmdTail(session, argv, stdin) {
  const { rest, number } = parseFlags(argv);
  const count = number ?? 10;
  const loaded = loadSources(session, rest, stdin, "tail");
  if (loaded.error) return loaded.error;
  const chunks = loaded.sources.map((source) => {
    const rows = source.text.split(/\n/);
    if (rows[rows.length - 1] === "") rows.pop();
    return rows.slice(-count).join("\n");
  });
  const text = chunks.join("\n");
  return done(text ? `${text}\n` : "");
}

function cmdWc(session, argv, stdin) {
  const { flags, rest } = parseFlags(argv);
  const loaded = loadSources(session, rest, stdin, "wc");
  if (loaded.error) return loaded.error;
  const show = {
    lines: !flags.size || flags.has("l"),
    words: !flags.size || flags.has("w"),
    bytes: !flags.size || flags.has("c"),
  };
  const rows = loaded.sources.map((source) => {
    const lines = source.text === "" ? 0 : source.text.split(/\n/).length - (source.text.endsWith("\n") ? 1 : 0);
    const words = source.text.trim() ? source.text.trim().split(/\s+/).length : 0;
    const bytes = source.text.length;
    const cols = [];
    if (show.lines) cols.push(String(lines).padStart(7, " "));
    if (show.words) cols.push(String(words).padStart(7, " "));
    if (show.bytes) cols.push(String(bytes).padStart(7, " "));
    if (source.name) cols.push(source.name);
    return cols.join(" ");
  });
  return done(`${rows.join("\n")}\n`);
}

const MAN = {
  ls: "ls [-la] [path]\nList directory contents. -l is long form, -a includes hidden names, -d does not enter a directory.\n",
  cd: "cd [dir]\nChange the working directory. cd - returns to the previous directory.\n",
  apt: "apt update | search | install | remove | list | show | download\nSileo is the graphical manager for these same apt operations.\n",
  dpkg: "dpkg -l\ndpkg -i package.deb\ndpkg -L package\nLow-level package tool. apt install resolves dependencies; dpkg -i does not.\n",
  sudo: "sudo [-i] command\nRun a command as root. sudo -i opens a root shell. mobile has passwordless sudo.\n",
  sileo: "sileo\nOpen Sileo, the APT front end. Get, queue, and confirm a package to install it.\n",
  cowsay: "cowsay [message]\nA cow says the message. Install the cowsay package first.\n",
  edit: "edit [file]\nOpen the small text editor. nano is the same editor.\n",
  "reset-env": "reset-env\nErase the saved filesystem, packages, and history.\n",
};

function cmdMan(argv) {
  const name = argv[1] ?? "help";
  const page = MAN[name];
  if (!page) return done("", `No manual entry for ${name}\n`, 1);
  return done(page);
}

function cmdHelp() {
  return done(
    [
      "Procursus shell. Core commands are built in. Extra commands appear after apt install.",
      "",
      "files:    ls cd pwd cat echo touch mkdir rm mv cp edit nano",
      "text:     grep head tail wc",
      "session:  clear whoami id uname sw_vers ps top history which env export",
      "info:     neofetch fastfetch man help",
      "packages: apt dpkg    (Sileo calls apt for you)",
      "device:   sudo uicache sbreload respring ldid launchctl killall jbctl dopamine",
      "other:    exit reset-env sileo",
      "",
    ].join("\n"),
  );
}

function enterRoot(session) {
  if (!session.stack) {
    session.stack = { user: session.user, cwd: session.cwd, env: { ...session.env }, oldpwd: session.oldpwd };
  }
  session.user = "root";
  session.cwd = "/var/root";
  session.oldpwd = "/var/root";
  session.env = baseEnv("root");
}

function cmdExit(session) {
  if (session.stack) {
    const stacked = session.stack;
    session.user = stacked.user;
    session.cwd = stacked.cwd;
    session.env = stacked.env;
    session.oldpwd = stacked.oldpwd;
    session.stack = null;
    return done();
  }
  session.connected = false;
  return done("Connection to iPhone closed.\n", "", 0, { logout: true });
}

function cmdSudo(session, argv, stdin) {
  let args = argv.slice(1);
  while (args.length) {
    if (args[0] === "-i" || args[0] === "-s") {
      args = args.slice(1);
      if (!args.length) {
        enterRoot(session);
        return done();
      }
      continue;
    }
    if (args[0] === "-u") {
      args = args.slice(2);
      continue;
    }
    if (args[0] === "--") {
      args = args.slice(1);
      break;
    }
    if (args[0].startsWith("-")) return done("", `sudo: unknown option '${args[0]}'\n`, 1);
    break;
  }
  if (!args.length || (args.length === 1 && args[0] === "su")) {
    enterRoot(session);
    return done();
  }
  const previous = { user: session.user, env: session.env, cwd: session.cwd, oldpwd: session.oldpwd };
  session.user = "root";
  session.env = { ...session.env, USER: "root", LOGNAME: "root", HOME: "/var/root" };
  try {
    return runArgv(session, args, stdin);
  } finally {
    session.user = previous.user;
    session.env = previous.env;
    session.cwd = previous.cwd;
    session.oldpwd = previous.oldpwd;
  }
}

function fromApt(aptResult, effects) {
  return done(aptResult.stdout, aptResult.stderr, aptResult.code, effects ?? null);
}

function cmdApt(session, argv) {
  const asRoot = session.user === "root";
  const flags = new Set(argv.filter((arg) => arg.startsWith("-")));
  const pos = argv.slice(1).filter((arg) => !arg.startsWith("-"));
  const sub = pos[0];
  if (!sub) return done(MAN.apt);
  if (sub === "update") return fromApt(aptUpdate(session.fs, { asRoot }));
  if (sub === "search") return fromApt(aptSearch(session.fs, pos.slice(1).join(" ")));
  if (sub === "install") return fromApt(aptInstall(session.fs, pos.slice(1), { asRoot }));
  if (sub === "remove" || sub === "purge") {
    return fromApt(aptRemove(session.fs, pos.slice(1), { asRoot, forceEssential: flags.has("--force-remove-essential") }));
  }
  if (sub === "list") return fromApt(aptList(session.fs, { installed: flags.has("--installed") }));
  if (sub === "show") return fromApt(aptShow(session.fs, pos[1]));
  if (sub === "download") {
    if (!pos[1]) return done("", "E: No packages specified\n", 1);
    const path = resolveUserPath(session, debFileName(packageByName(pos[1]) ?? { name: pos[1], version: "0" }));
    if (!canWrite(session.fs, session.user, path)) return deny(`apt: ${session.cwd}`);
    return fromApt(aptDownload(session.fs, session.cwd, pos[1], { home: session.env.HOME, owner: session.user }));
  }
  return done("", `E: Invalid operation ${sub}\n`, 1);
}

function cmdDpkg(session, argv) {
  const asRoot = session.user === "root";
  if (argv[1] === "-l" || argv[1] === "--list") return fromApt(dpkgList(session.fs));
  if (argv[1] === "-L") return fromApt(dpkgFiles(session.fs, argv[2]));
  if (argv[1] === "-s") return fromApt(aptShow(session.fs, argv[2]));
  if (argv[1] === "-i" || argv[1] === "--install") {
    if (!argv[2]) return done("", "dpkg: error: --install needs a .deb archive\n", 1);
    return fromApt(dpkgInstall(session.fs, session.cwd, argv[2], { asRoot, home: session.env.HOME }));
  }
  return done("Usage: dpkg -l | dpkg -L pkg | dpkg -s pkg | dpkg -i archive.deb\n");
}

function wrapCow(message) {
  const width = 28;
  const words = message.trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words.length ? words : ["moo"]) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  const size = Math.max(...lines.map((line) => line.length));
  const body = lines.map((line, index) => {
    const padded = line.padEnd(size, " ");
    if (lines.length === 1) return `< ${padded} >`;
    if (index === 0) return `/ ${padded} \\`;
    if (index === lines.length - 1) return `\\ ${padded} /`;
    return `| ${padded} |`;
  });
  return [
    ` ${"_".repeat(size + 2)}`,
    ...body,
    ` ${"-".repeat(size + 2)}`,
    "        \\   ^__^",
    "         \\  (oo)\\_______",
    "            (__)\\       )\\/\\",
    "                ||----w |",
    "                ||     ||",
    "",
  ].join("\n");
}

function cmdCowsay(argv, stdin) {
  const message = argv.slice(1).join(" ") || stdin || "moo";
  return done(wrapCow(message));
}

const TRAIN = [
  "      ====        ________                ___________",
  "  _D _|  |_______/        \\__I_I_____===__|_________|",
  "   |(_)---  |   H\\________/ |   |        =|___ ___|",
  "   /     |  |   H  |  |     |   |         ||_| |_||",
  "  |      |  |   H  |__--------------------| [___] |",
  "  | ________|___H__/__|_____/[][]~\\_______|       |",
  "  |/ |   |-----------I_____I [][] []  D   |=======|__",
  "__/ =| o |=-~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__",
  " |/-=|___|=    O=====O=====O=====O      |_____/~\\___/",
  "  \\_/      \\__/  \\__/  \\__/  \\__/         \\_/    ",
];

function cmdSl() {
  const frames = [];
  for (let pad = 18; pad >= 0; pad -= 3) {
    frames.push(TRAIN.map((line) => `${" ".repeat(pad)}${line}`).join("\n"));
  }
  return done(`${frames[frames.length - 1]}\n`, "", 0, { frames });
}

function cmdHtop() {
  return done(
    [
      "  PID USER      PRI  NI  VIRT   RES   SHR S CPU% MEM%   TIME+  Command",
      "   88 mobile     20   0  1280M  180M  42M S  2.1  2.2   0:42.11 SpringBoard",
      "  140 mobile     20   0   640M   96M  20M S  0.4  1.2   0:03.02 Sileo",
      "  203 mobile     20   0    18M    8M   2M S  0.1  0.1   0:00.08 zsh",
      "    1 root       20   0    24M   12M   4M S  0.0  0.1   0:01.20 launchd",
      "",
    ].join("\n"),
  );
}

function cmdGit(session, argv) {
  if (argv[1] === "--version" || argv[1] === "version") return done("git version 2.47.0\n");
  if (argv[1] === "init") {
    const path = resolveUserPath(session, ".git/HEAD");
    if (!canWrite(session.fs, session.user, path)) return deny("git");
    writeFile(session.fs, path, "ref: refs/heads/main\n", { mode: 0o644, owner: session.user, group: "mobile" });
    return done(`Initialized empty Git repository in ${session.cwd}/.git/\n`);
  }
  let dir = session.cwd;
  let found = false;
  while (dir) {
    const head = lookup(session.fs, `${dir === "/" ? "" : dir}/.git`, { followLast: true });
    if (!head.error) {
      found = true;
      break;
    }
    if (dir === "/") break;
    dir = `/${dir.split("/").filter(Boolean).slice(0, -1).join("/")}`;
  }
  if (argv[1] === "status") {
    if (!found) return done("", "fatal: not a git repository (or any of the parent directories): .git\n", 128);
    return done("On branch main\nnothing to commit, working tree clean\n");
  }
  return done("", "usage: git [--version] [init] [status]\n", 1);
}

function networkError(name, host) {
  return done("", `${name}: (7) Failed to connect to ${host || "host"}: this simulation has no network\n`, 7);
}

function cmdCurl(session, argv) {
  const args = argv.slice(1).filter((arg) => arg !== "-L" && arg !== "-s" && arg !== "-S");
  const target = args.find((arg) => !arg.startsWith("-"));
  if (!target) return done("", "curl: try 'curl --help'\n", 2);
  if (target.startsWith("file://")) {
    const read = readText(session, target.slice("file://".length));
    if (read.error) return fsError("curl", target, read.error);
    return done(read.content.endsWith("\n") ? read.content : `${read.content}\n`);
  }
  if (/^https?:\/\//.test(target)) {
    const host = target.split("/")[2] ?? target;
    return networkError("curl", host);
  }
  return networkError("curl", target);
}

function cmdWget(argv) {
  const target = argv.slice(1).find((arg) => !arg.startsWith("-"));
  if (!target) return done("", "wget: missing URL\n", 1);
  return networkError("wget", target.split("/")[2] || target);
}

function evalPrint(source) {
  const output = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^print\((.*)\)\s*$/.exec(line);
    if (!match) return { error: "SyntaxError: this simulated python3 only runs print()\n" };
    const arg = match[1].trim();
    if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
      output.push(arg.slice(1, -1));
      continue;
    }
    if (/^-?\d+(\.\d+)?$/.test(arg)) {
      output.push(arg);
      continue;
    }
    if (!/^[\d\s+\-*/().]+$/.test(arg)) return { error: "SyntaxError: this simulated python3 only runs print()\n" };
    try {
      output.push(String(Function(`"use strict"; return (${arg})`)()));
    } catch {
      return { error: "SyntaxError: this simulated python3 only runs print()\n" };
    }
  }
  return { text: output.length ? `${output.join("\n")}\n` : "" };
}

function cmdPython(session, argv) {
  if (argv.includes("--version") || argv.includes("-V")) return done("Python 3.12.7\n");
  const flag = argv.indexOf("-c");
  if (flag !== -1) {
    const evaluated = evalPrint(argv.slice(flag + 1).join(" "));
    if (evaluated.error) return done("", evaluated.error, 1);
    return done(evaluated.text);
  }
  const file = argv.slice(1).find((arg) => !arg.startsWith("-"));
  if (!file) return done("Python 3.12.7 (simulated, print only)\nType python3 -c 'print(\"hi\")'\n");
  const read = readText(session, file);
  if (read.error) return fsError("python3", file, read.error);
  const evaluated = evalPrint(read.content);
  if (evaluated.error) return done("", evaluated.error, 1);
  return done(evaluated.text);
}

function cmdSsh(argv) {
  const host = argv.slice(1).find((arg) => !arg.startsWith("-")) ?? "host";
  return done("", `ssh: connect to host ${host} port 22: Network is unreachable (simulated)\n`, 255);
}

function cmdLdid(argv) {
  const sign = argv.indexOf("-S");
  if (sign === -1) return done("usage: ldid -S binary\n");
  const file = argv[sign + 1] && !argv[sign + 1].startsWith("-") ? argv[sign + 1] : "a.out";
  return done(`ldid: ad-hoc signed ${file}\n`);
}

function cmdUicache(session) {
  const apps = lookup(session.fs, "/var/jb/Applications", { followLast: true });
  const names = apps.error ? [] : Object.keys(apps.node.children).filter((name) => name.endsWith(".app"));
  const lines = names.map((name) => `uicache: caching /var/jb/Applications/${name}`);
  lines.push("uicache: done");
  return done(`${lines.join("\n")}\n`);
}

function cmdLaunchctl(session) {
  const installed = readInstalled(session.fs);
  const lines = ["PID\tStatus\tLabel", "1\t0\tcom.apple.launchd", "88\t0\tcom.apple.SpringBoard"];
  if (installed.has("sileo")) lines.push("140\t0\torg.coolstar.sileo");
  lines.push("-\t0\tcom.apple.backboardd");
  return done(`${lines.join("\n")}\n`);
}

function cmdKillall(argv) {
  const name = argv[1];
  if (!name) return done("", "killall: missing process name\n", 1);
  if (name === "SpringBoard" || name === "backboardd") {
    return done(`killall: ${name}: respring\n`, "", 0, { respring: true });
  }
  if (name === "Sileo") return done("killall: Sileo: no matching processes were found in this shell\n", "", 1);
  return done("", `No matching processes belonging to you were found\n`, 1);
}

function cmdJb(argv) {
  const lines = [
    "NOT real. This status is not a jailbreak.",
    `Dopamine ${DEVICE.dopamine}`,
    "jailbreak: active",
    "type: rootless",
    `bootstrap: procursus ${DEVICE.procursus}`,
    "path: /var/jb",
    `target: ${DEVICE.jb}`,
    `ios: ${DEVICE.productVersion} (${DEVICE.build})`,
    `device: ${DEVICE.product}`,
    `kernel: Darwin ${DEVICE.darwin} ${DEVICE.arch}`,
  ];
  if (argv[0] === "jbctl" && argv[1] && argv[1] !== "status") return done("", "jbctl: only 'status' is available here\n", 1);
  return done(`${lines.join("\n")}\n`);
}

function cmdOpen(argv) {
  const target = (argv[1] ?? "").toLowerCase();
  if (!target || target.includes("sileo")) return done("", "", 0, { openSileo: true });
  return done("", `open: ${argv[1]}: unsupported simulated url\n`, 1);
}

function cmdGeneric(argv) {
  const name = baseName(argv[0]);
  const pkg = CATALOG.find((item) => item.files.some((file) => file.path.endsWith(`/${name}`)));
  if (argv.includes("--version") || argv.includes("-V")) return done(`${name} (Procursus) ${pkg?.version ?? ""}\n`);
  if (name === "less" && argv[1]) return null;
  return done(`${name}: simulated ${name}. Try ${name} --version.\n`);
}

function runExternal(session, argv, stdin) {
  const name = baseName(argv[0]);
  if (name === "apt" || name === "apt-get") return cmdApt(session, ["apt", ...argv.slice(1)]);
  if (name === "dpkg") return cmdDpkg(session, argv);
  if (name === "cowsay") return cmdCowsay(argv, stdin);
  if (name === "sl") return cmdSl();
  if (name === "htop") return cmdHtop();
  if (name === "vim") return cmdEdit(session, ["vim", ...argv.slice(1)]);
  if (name === "git") return cmdGit(session, argv);
  if (name === "curl") return cmdCurl(session, argv);
  if (name === "wget") return cmdWget(argv);
  if (name === "python3") return cmdPython(session, argv);
  if (name === "ssh") return cmdSsh(argv);
  if (name === "ldid") return cmdLdid(argv);
  if (name === "uicache") return cmdUicache(session);
  if (name === "sbreload") return done("sbreload: restarting SpringBoard\n", "", 0, { respring: true });
  if (name === "respring") return done("respring: restarting SpringBoard\n", "", 0, { respring: true });
  if (name === "launchctl") return cmdLaunchctl(session);
  if (name === "killall") return cmdKillall(argv);
  if (name === "jbctl" || name === "dopamine") return cmdJb(argv);
  if (name === "sileo" || name === "open") return cmdOpen(argv);
  if (name === "less") {
    const file = argv.slice(1).find((arg) => !arg.startsWith("-"));
    if (file) return cmdCat(session, ["cat", file], stdin);
  }
  if (name === "bash" || name === "zsh" || name === "sh") {
    const flag = argv.indexOf("-c");
    if (flag !== -1) return runLine(session, argv.slice(flag + 1).join(" "), { record: false });
    return done(`${name}: this session is already an interactive shell\n`);
  }
  return cmdGeneric(argv);
}

function runArgv(session, argv, stdin) {
  if (!argv.length) return done();
  const [name] = argv;
  if (name.includes("=") && argv.length === 1 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(name)) {
    const eq = name.indexOf("=");
    session.env[name.slice(0, eq)] = name.slice(eq + 1);
    return done();
  }
  if (BUILTINS.includes(name)) {
    if (name === "ls") return cmdLs(session, argv);
    if (name === "cd") return cmdCd(session, argv);
    if (name === "pwd") return cmdPwd(session, argv);
    if (name === "cat") return cmdCat(session, argv, stdin);
    if (name === "echo") return cmdEcho(argv);
    if (name === "touch") return cmdTouch(session, argv);
    if (name === "mkdir") return cmdMkdir(session, argv);
    if (name === "rm") return cmdRm(session, argv);
    if (name === "mv") return cmdMv(session, argv);
    if (name === "cp") return cmdCp(session, argv);
    if (name === "edit" || name === "nano") return cmdEdit(session, argv);
    if (name === "clear") return done("", "", 0, { clear: true });
    if (name === "whoami") return cmdWhoami(session);
    if (name === "id") return cmdId(session);
    if (name === "uname") return cmdUname(argv);
    if (name === "sw_vers") return cmdSwVers(argv);
    if (name === "neofetch") return cmdNeofetch(session);
    if (name === "fastfetch") return cmdFastfetch(session);
    if (name === "ps") return cmdPs();
    if (name === "top") return cmdTop();
    if (name === "history") return cmdHistory(session);
    if (name === "which") return cmdWhich(session, argv);
    if (name === "env") return cmdEnv(session);
    if (name === "export") return cmdExport(session, argv);
    if (name === "grep") return cmdGrep(session, argv, stdin);
    if (name === "head") return cmdHead(session, argv, stdin);
    if (name === "tail") return cmdTail(session, argv, stdin);
    if (name === "wc") return cmdWc(session, argv, stdin);
    if (name === "man") return cmdMan(argv);
    if (name === "help") return cmdHelp();
    if (name === "exit") return cmdExit(session);
    if (name === "reset-env") {
      resetSession(session);
      return done("environment reset\n", "", 0, { reset: true, clear: true });
    }
    if (name === "sudo") return cmdSudo(session, argv, stdin);
  }
  const binary = findInPath(session, name);
  if (!binary) return done("", `zsh: command not found: ${name}\n`, 127);
  if (PATH_HANDLERS.has(baseName(name)) || PATH_HANDLERS.has(baseName(binary))) return runExternal(session, argv, stdin);
  return done(`${baseName(name)}: simulated binary\n`);
}

function lex(line) {
  const tokens = [];
  let current = "";
  let quote = null;
  let expand = true;
  let started = false;
  const flush = () => {
    if (!started) return;
    tokens.push({ type: "word", value: current, expand });
    current = "";
    expand = true;
    started = false;
  };
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote === "'") {
      started = true;
      expand = false;
      if (char === "'") quote = null;
      else current += char;
      continue;
    }
    if (quote === '"') {
      started = true;
      if (char === '"') quote = null;
      else if (char === "\\" && i + 1 < line.length) current += line[++i];
      else current += char;
      continue;
    }
    if (char === "\\") {
      started = true;
      if (i + 1 < line.length) current += line[++i];
      continue;
    }
    if (char === "'" || char === '"') {
      started = true;
      quote = char;
      if (char === "'") expand = false;
      continue;
    }
    if (char === " " || char === "\t") {
      flush();
      continue;
    }
    if (char === "|" && line[i + 1] !== "|") {
      flush();
      tokens.push({ type: "op", value: "|" });
      continue;
    }
    if (char === "&" && line[i + 1] === "&") {
      flush();
      tokens.push({ type: "op", value: "&&" });
      i += 1;
      continue;
    }
    if (char === ";") {
      flush();
      tokens.push({ type: "op", value: ";" });
      continue;
    }
    if (char === ">") {
      flush();
      if (line[i + 1] === ">") {
        tokens.push({ type: "op", value: ">>" });
        i += 1;
      } else tokens.push({ type: "op", value: ">" });
      continue;
    }
    started = true;
    current += char;
  }
  flush();
  if (quote) return { error: "zsh: unmatched quote\n" };
  return { tokens };
}

function globWord(session, word) {
  if (!/[*?]/.test(word)) return [word];
  const slash = word.lastIndexOf("/");
  const dirPart = slash === -1 ? "." : word.slice(0, slash) || "/";
  const pattern = slash === -1 ? word : word.slice(slash + 1);
  const dir = resolveUserPath(session, dirPart);
  const found = lookup(session.fs, dir, { followLast: true });
  if (found.error || found.node.type !== "dir") return [word];
  const expression = `^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`;
  const names = Object.keys(found.node.children)
    .filter((name) => new RegExp(expression).test(name) && (pattern.startsWith(".") || !name.startsWith(".")))
    .sort();
  if (!names.length) return [word];
  const prefix = slash === -1 ? "" : word.slice(0, slash + 1);
  return names.map((name) => `${prefix}${name}`);
}

function expandToken(session, token) {
  let value = token.value;
  if (!token.expand) return [value];
  if (value === "~") value = session.env.HOME;
  else if (value.startsWith("~/")) value = session.env.HOME + value.slice(1);
  value = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, braced, bare) => {
    return session.env[braced || bare] ?? "";
  });
  return globWord(session, value);
}

function parseLine(session, tokens) {
  const list = [];
  let sep = null;
  let pipe = [];
  let command = { argv: [], redirect: null };
  const pushCommand = () => {
    pipe.push(command);
    command = { argv: [], redirect: null };
  };
  for (const token of tokens) {
    if (token.type === "word") {
      const words = expandToken(session, token);
      if (command.redirect && command.redirect.target == null) {
        command.redirect.target = words[0];
        command.argv.push(...words.slice(1));
      } else command.argv.push(...words);
      continue;
    }
    if (token.value === ">" || token.value === ">>") {
      command.redirect = { append: token.value === ">>", target: null };
      continue;
    }
    if (token.value === "|") {
      pushCommand();
      continue;
    }
    pushCommand();
    list.push({ sep, pipe });
    sep = token.value;
    pipe = [];
  }
  pushCommand();
  list.push({ sep, pipe });
  return list;
}

function applyRedirect(session, command, stdout) {
  if (!command.redirect || command.redirect.target == null) return { stdout, error: null };
  const path = resolveUserPath(session, command.redirect.target);
  if (!canWrite(session.fs, session.user, path)) return { stdout: "", error: deny(path) };
  let next = stdout;
  if (command.redirect.append) {
    const existing = readFile(session.fs, path);
    if (!existing.error) next = existing.content + stdout;
  }
  const wrote = writeFile(session.fs, path, next, {
    mode: 0o644,
    owner: session.user,
    group: session.user === "root" ? "wheel" : "mobile",
  });
  if (wrote.error) return { stdout: "", error: fsError("zsh", path, wrote.error) };
  return { stdout: "", error: null };
}

export function runLine(session, line, options = {}) {
  const trimmed = line.trim();
  if (!trimmed) return done();
  if (options.record !== false) {
    session.history.push(line);
    if (session.history.length > 200) session.history.shift();
  }
  if (!session.connected && trimmed !== "reset-env") {
    return done("", "zsh: session closed. Press enter to reconnect.\n", 1);
  }
  const lexed = lex(line);
  if (lexed.error) return done("", lexed.error, 1);
  const list = parseLine(session, lexed.tokens);
  let stdout = "";
  let stderr = "";
  let code = 0;
  const effects = {};
  let previousOk = true;
  for (const item of list) {
    if (item.sep === "&&" && !previousOk) continue;
    let stdin = "";
    let pipelineCode = 0;
    let pipelineOut = "";
    let pipelineErr = "";
    let pipelineEffects = null;
    for (const command of item.pipe) {
      if (!command.argv.length) continue;
      const result = runArgv(session, command.argv, stdin);
      const redirected = applyRedirect(session, command, result.stdout);
      if (redirected.error) {
        pipelineCode = redirected.error.code;
        pipelineErr += redirected.error.stderr;
        pipelineOut = "";
        break;
      }
      stdin = redirected.stdout;
      pipelineOut = redirected.stdout;
      pipelineErr += result.stderr;
      pipelineCode = result.code;
      if (result.effects) pipelineEffects = { ...pipelineEffects, ...result.effects };
      if (result.code !== 0) break;
    }
    stdout += pipelineOut;
    stderr += pipelineErr;
    code = pipelineCode;
    if (pipelineEffects) Object.assign(effects, pipelineEffects);
    previousOk = pipelineCode === 0;
  }
  const result = done(stdout, stderr, code, Object.keys(effects).length ? effects : null);
  return result;
}

function commonPrefix(values) {
  if (!values.length) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < value.length && prefix[index] === value[index]) index += 1;
    prefix = prefix.slice(0, index);
  }
  return prefix;
}

function pathMatches(session, partial) {
  const slash = partial.lastIndexOf("/");
  const dirPart = slash === -1 ? "." : partial.slice(0, slash + 1);
  const base = slash === -1 ? partial : partial.slice(slash + 1);
  const logicalDir = resolveUserPath(session, dirPart.replace(/\/$/, "") || "/");
  const found = lookup(session.fs, dirPart === "/" ? "/" : logicalDir, { followLast: true });
  if (found.error || found.node.type !== "dir") return [];
  return Object.keys(found.node.children)
    .filter((name) => name.startsWith(base) && (base.startsWith(".") || !name.startsWith(".")))
    .sort()
    .map((name) => {
      const child = found.node.children[name];
      let directory = child.type === "dir";
      if (child.type === "link") {
        const target = lookup(session.fs, `${logicalDir}/${name}`, { followLast: true });
        directory = !target.error && target.node.type === "dir";
      }
      const prefix = slash === -1 ? "" : partial.slice(0, slash + 1);
      return `${prefix}${name}${directory ? "/" : ""}`;
    });
}

export function complete(session, line, cursor) {
  const before = line.slice(0, cursor);
  const match = before.match(/(^|[\s;|&])([^\s;|&]*)$/);
  const partial = match ? match[2] : "";
  const start = before.length - partial.length;
  const previous = before.slice(0, start);
  const isCommand = previous.trim() === "" || /(?:^|[;&|])\s*$/.test(previous) || /(?:^|[;&|])\s*sudo\s+$/.test(previous);
  const matches = (isCommand && !partial.includes("/")
    ? commandNames(session).filter((name) => name.startsWith(partial))
    : pathMatches(session, partial));
  if (!matches.length) return { line, cursor, matches: [] };
  const prefix = commonPrefix(matches);
  if (matches.length > 1 && prefix.length === partial.length) return { line, cursor, matches };
  const extra = matches.length === 1 && !prefix.endsWith("/") ? " " : "";
  const next = line.slice(0, start) + prefix + extra + line.slice(cursor);
  return { line: next, cursor: start + prefix.length + extra.length, matches };
}

export function writeEditor(session, path, content) {
  if (!canWrite(session.fs, session.user, path)) return { ok: false, error: "Permission denied" };
  const wrote = writeFile(session.fs, path, content, {
    mode: 0o644,
    owner: session.user,
    group: session.user === "root" ? "wheel" : "mobile",
  });
  if (wrote.error) return { ok: false, error: wrote.error };
  return { ok: true };
}
