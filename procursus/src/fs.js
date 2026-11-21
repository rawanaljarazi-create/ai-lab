export const SEED_TIME = Date.UTC(2024, 9, 12, 18, 0, 0);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dirNode(meta = {}) {
  return {
    type: "dir",
    mode: meta.mode ?? 0o755,
    owner: meta.owner ?? "root",
    group: meta.group ?? "wheel",
    mtime: meta.mtime ?? SEED_TIME,
    children: {},
  };
}

export function fileNode(content, meta = {}) {
  return {
    type: "file",
    mode: meta.mode ?? 0o644,
    owner: meta.owner ?? "root",
    group: meta.group ?? "wheel",
    mtime: meta.mtime ?? SEED_TIME,
    content: String(content),
  };
}

export function linkNode(target, meta = {}) {
  return {
    type: "link",
    mode: 0o777,
    owner: meta.owner ?? "root",
    group: meta.group ?? "wheel",
    mtime: meta.mtime ?? SEED_TIME,
    target,
  };
}

export function logicalResolve(cwd, input, home = "") {
  let raw = input ?? "";
  if (home && (raw === "~" || raw.startsWith("~/"))) raw = home + raw.slice(1);
  const path = raw.startsWith("/") ? raw : `${cwd}/${raw}`;
  const parts = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

export function lookup(root, logicalPath, options = {}) {
  const followLast = options.followLast !== false;
  const parts = String(logicalPath ?? "/").split("/").filter(Boolean);
  if (parts.length === 0) return { node: root, realPath: "/", name: "" };
  let node = root;
  const real = [];
  let index = 0;
  let hops = 0;
  while (index < parts.length) {
    if (node.type !== "dir") return { error: "ENOTDIR", realPath: `/${real.join("/")}` };
    const name = parts[index];
    const child = node.children[name];
    const isLast = index === parts.length - 1;
    if (!child) return { error: "ENOENT", parent: node, name, realPath: `/${real.join("/")}` || "/" };
    if (child.type === "link" && (!isLast || followLast)) {
      hops += 1;
      if (hops > 24) return { error: "ELOOP" };
      if (!child.target.startsWith("/")) return { error: "EINVAL" };
      const rest = parts.slice(index + 1);
      parts.splice(0, parts.length, ...child.target.split("/").filter(Boolean), ...rest);
      index = 0;
      node = root;
      real.length = 0;
      continue;
    }
    node = child;
    real.push(name);
    index += 1;
  }
  return { node, realPath: `/${real.join("/")}`, name: real[real.length - 1] };
}

export function lookupParent(root, logicalPath) {
  const parts = String(logicalPath).split("/").filter(Boolean);
  if (parts.length === 0) return { error: "EINVAL" };
  const name = parts.pop();
  const parent = lookup(root, `/${parts.join("/")}`, { followLast: true });
  if (parent.error) return { error: parent.error };
  if (parent.node.type !== "dir") return { error: "ENOTDIR" };
  return { parent: parent.node, parentPath: parent.realPath, name };
}

export function mkdirp(root, logicalPath, meta = {}) {
  const parts = String(logicalPath).split("/").filter(Boolean);
  let node = root;
  let index = 0;
  let hops = 0;
  while (index < parts.length) {
    if (node.type !== "dir") return { error: "ENOTDIR" };
    const name = parts[index];
    const child = node.children[name];
    if (!child) {
      const created = dirNode(meta);
      node.children[name] = created;
      node = created;
      index += 1;
      continue;
    }
    if (child.type === "link") {
      hops += 1;
      if (hops > 24) return { error: "ELOOP" };
      if (!child.target.startsWith("/")) return { error: "EINVAL" };
      const rest = parts.slice(index + 1);
      parts.splice(0, parts.length, ...child.target.split("/").filter(Boolean), ...rest);
      index = 0;
      node = root;
      continue;
    }
    if (child.type !== "dir") return { error: "ENOTDIR" };
    node = child;
    index += 1;
  }
  return {};
}

export function writeFile(root, logicalPath, content, meta = {}) {
  const parts = String(logicalPath).split("/").filter(Boolean);
  const name = parts.pop();
  if (!name) return { error: "EINVAL" };
  const made = mkdirp(root, `/${parts.join("/")}`, {
    owner: meta.owner ?? "root",
    group: meta.group ?? "wheel",
    mode: 0o755,
  });
  if (made.error) return made;
  const parent = lookup(root, `/${parts.join("/")}`, { followLast: true });
  if (parent.error) return parent;
  if (parent.node.type !== "dir") return { error: "ENOTDIR" };
  const existing = parent.node.children[name];
  if (existing && existing.type === "dir") return { error: "EISDIR" };
  parent.node.children[name] = fileNode(content, {
    mode: meta.mode ?? existing?.mode ?? 0o644,
    owner: meta.owner ?? existing?.owner ?? "root",
    group: meta.group ?? existing?.group ?? "wheel",
    mtime: meta.mtime ?? Date.now(),
  });
  return {};
}

export function readFile(root, logicalPath) {
  const found = lookup(root, logicalPath, { followLast: true });
  if (found.error) return found;
  if (found.node.type === "dir") return { error: "EISDIR" };
  if (found.node.type !== "file") return { error: "EINVAL" };
  return { content: found.node.content, node: found.node, realPath: found.realPath };
}

export function removePath(root, logicalPath, options = {}) {
  if (logicalPath === "/") {
    if (!options.recursive) return { error: "EISDIR" };
    root.children = {};
    return {};
  }
  const located = lookupParent(root, logicalPath);
  if (located.error) return options.force ? {} : located;
  const node = located.parent.children[located.name];
  if (!node) return options.force ? {} : { error: "ENOENT" };
  if (node.type === "dir" && !options.recursive) return { error: "EISDIR" };
  delete located.parent.children[located.name];
  located.parent.mtime = Date.now();
  return {};
}

function cloneNode(node) {
  if (node.type === "dir") {
    const children = {};
    for (const [name, child] of Object.entries(node.children)) children[name] = cloneNode(child);
    return { ...node, mtime: Date.now(), children };
  }
  return { ...node, mtime: Date.now() };
}

function place(root, fromName, node, to) {
  const dest = lookup(root, to, { followLast: true });
  if (!dest.error && dest.node.type === "dir") {
    dest.node.children[fromName] = node;
    dest.node.mtime = Date.now();
    return {};
  }
  const parent = lookupParent(root, to);
  if (parent.error) return parent;
  parent.parent.children[parent.name] = node;
  parent.parent.mtime = Date.now();
  return {};
}

export function copyPath(root, from, to, options = {}) {
  const src = lookup(root, from, { followLast: true });
  if (src.error) return src;
  if (src.node.type === "dir" && !options.recursive) return { error: "EISDIR" };
  const name = from.split("/").filter(Boolean).pop();
  return place(root, name, cloneNode(src.node), to);
}

export function movePath(root, from, to) {
  const located = lookupParent(root, from);
  if (located.error) return located;
  const src = located.parent.children[located.name];
  if (!src) return { error: "ENOENT" };
  const placed = place(root, located.name, cloneNode(src), to);
  if (placed.error) return placed;
  delete located.parent.children[located.name];
  return {};
}

export function canWrite(root, user, logicalPath) {
  if (user === "root") return true;
  let path = logicalPath || "/";
  while (true) {
    const found = lookup(root, path, { followLast: true });
    if (!found.error) {
      const real = found.realPath;
      return ["/private/var/mobile", "/private/var/tmp"].some(
        (prefix) => real === prefix || real.startsWith(`${prefix}/`),
      );
    }
    if (path === "/") return false;
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    path = `/${parts.join("/")}`;
  }
}

export function modeBits(mode) {
  let text = "";
  for (const shift of [6, 3, 0]) {
    const part = (mode >> shift) & 7;
    text += part & 4 ? "r" : "-";
    text += part & 2 ? "w" : "-";
    text += part & 1 ? "x" : "-";
  }
  return text;
}

export function formatLsDate(ms, now = Date.now()) {
  const date = new Date(ms);
  const month = MONTHS[date.getUTCMonth()];
  const day = String(date.getUTCDate()).padStart(2, " ");
  const recent = Math.abs(now - ms) < 1000 * 60 * 60 * 24 * 180;
  if (recent) {
    const hh = String(date.getUTCHours()).padStart(2, "0");
    const mm = String(date.getUTCMinutes()).padStart(2, "0");
    return `${month} ${day} ${hh}:${mm}`;
  }
  return `${month} ${day}  ${date.getUTCFullYear()}`;
}

export function formatLong(name, node) {
  const kind = node.type === "dir" ? "d" : node.type === "link" ? "l" : "-";
  const size = node.type === "file" ? node.content.length : node.type === "link" ? node.target.length : 512;
  const date = formatLsDate(node.mtime);
  const extra = node.type === "link" ? ` -> ${node.target}` : "";
  const owner = node.owner.padEnd(8, " ");
  const group = node.group.padEnd(8, " ");
  return `${kind}${modeBits(node.mode)}  1 ${owner} ${group} ${String(size).padStart(6, " ")} ${date} ${name}${extra}`;
}

export function baseName(path) {
  const parts = String(path).split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "/";
}

export function countNodes(node) {
  if (!node || node.type !== "dir") return 1;
  let total = 1;
  for (const child of Object.values(node.children)) total += countNodes(child);
  return total;
}
