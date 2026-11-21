import { CATALOG, debFileName, packageByName } from "./catalog.js";
import { countNodes, linkNode, logicalResolve, lookup, mkdirp, readFile, removePath, writeFile } from "./fs.js";
import { DEVICE, LISTS_PATH, STATUS_PATH } from "./system.js";

export function renderStatus(names) {
  const blocks = [];
  for (const name of names) {
    const pkg = typeof name === "string" ? packageByName(name) : name;
    if (!pkg) continue;
    const lines = [
      `Package: ${pkg.name}`,
      "Status: install ok installed",
      `Priority: ${pkg.essential ? "required" : "optional"}`,
      `Section: ${pkg.section}`,
      `Installed-Size: ${pkg.installedSize}`,
      `Maintainer: ${pkg.maintainer}`,
      `Architecture: ${pkg.arch}`,
      `Version: ${pkg.version}`,
    ];
    if (pkg.depends.length) lines.push(`Depends: ${pkg.depends.join(", ")}`);
    lines.push(`Description: ${pkg.description}`, "");
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n");
}

export function readInstalled(root) {
  const file = readFile(root, STATUS_PATH);
  const map = new Map();
  if (file.error || !file.content.trim()) return map;
  for (const block of file.content.split(/\n(?=Package: )/)) {
    const name = /^Package: (.+)$/m.exec(block)?.[1];
    const version = /^Version: (.+)$/m.exec(block)?.[1];
    const status = /^Status: (.+)$/m.exec(block)?.[1] ?? "";
    if (name && status.includes("installed")) map.set(name, { name, version });
  }
  return map;
}

function writeStatus(root, names) {
  writeFile(root, STATUS_PATH, renderStatus(names), { mode: 0o644, mtime: Date.now() });
}

export function applyFiles(root, pkg) {
  for (const file of pkg.files) {
    if (file.link) {
      const parts = file.path.split("/").filter(Boolean);
      const name = parts.pop();
      const parentPath = `/${parts.join("/")}`;
      mkdirp(root, parentPath);
      const parent = lookup(root, parentPath);
      if (!parent.error) parent.node.children[name] = linkNode(file.link);
      continue;
    }
    writeFile(root, file.path, file.content, { mode: file.mode ?? 0o644, mtime: Date.now() });
  }
}

export function removeFiles(root, pkg) {
  for (const file of pkg.files) removePath(root, file.path, { force: true });
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function databaseLine(root) {
  return `(Reading database ... ${countNodes(root)} files and directories currently installed.)`;
}

export function planInstall(root, names) {
  const installed = readInstalled(root);
  const packages = [];
  const missing = [];
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const pkg = packageByName(name);
    if (!pkg) {
      missing.push(name);
      return;
    }
    for (const dep of pkg.depends) visit(dep);
    if (!installed.has(name)) packages.push(pkg);
  };
  for (const name of names) visit(name);
  return { packages, missing, installed };
}

function denied() {
  return {
    code: 1,
    stdout: "",
    stderr:
      "E: Could not open lock file /var/jb/var/lib/apt/lists/lock - open (13: Permission denied)\nE: Unable to lock the list directory\n",
    respring: false,
  };
}

export function aptUpdate(root, options = {}) {
  if (!options.asRoot) return denied();
  const body = CATALOG.map((pkg) =>
    [
      `Package: ${pkg.name}`,
      `Version: ${pkg.version}`,
      `Architecture: ${pkg.arch}`,
      `Section: ${pkg.section}`,
      `Installed-Size: ${pkg.installedSize}`,
      `Maintainer: ${pkg.maintainer}`,
      pkg.depends.length ? `Depends: ${pkg.depends.join(", ")}` : null,
      `Filename: pool/main/${pkg.name[0]}/${pkg.name}/${debFileName(pkg)}`,
      `Size: ${pkg.size}`,
      `Description: ${pkg.description}`,
      "",
    ]
      .filter(Boolean)
      .join("\n"),
  ).join("\n");
  writeFile(root, LISTS_PATH, body, { mode: 0o644, mtime: Date.now() });
  const stdout = [
    `Get:1 ${DEVICE.source} ${DEVICE.suite} InRelease [4,096 B]`,
    `Get:2 ${DEVICE.source} ${DEVICE.suite}/main iphoneos-arm64 Packages [${human(body.length)}]`,
    `Fetched ${human(body.length + 4096)} in 0s (1,204 kB/s)`,
    "Reading package lists... Done",
    "Building dependency tree... Done",
    "All packages are up to date.",
    "",
  ].join("\n");
  return { code: 0, stdout, stderr: "", respring: false };
}

export function aptSearch(_root, query) {
  const needle = query.trim().toLowerCase();
  const hits = CATALOG.filter((pkg) => {
    if (!needle) return true;
    return (
      pkg.name.includes(needle) ||
      pkg.description.toLowerCase().includes(needle) ||
      pkg.section.toLowerCase().includes(needle)
    );
  }).sort((a, b) => a.name.localeCompare(b.name));
  const stdout = hits
    .map((pkg) => `${pkg.name}/${DEVICE.suite} ${pkg.version} ${pkg.arch}\n  ${pkg.description}`)
    .join("\n");
  return { code: 0, stdout: stdout ? `${stdout}\n` : "", stderr: "", respring: false };
}

export function aptList(root, options = {}) {
  const installed = readInstalled(root);
  const rows = CATALOG.filter((pkg) => !options.installed || installed.has(pkg.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((pkg) => {
      const mark = installed.has(pkg.name) ? " [installed]" : "";
      return `${pkg.name}/${DEVICE.suite} ${pkg.version} ${pkg.arch}${mark}`;
    });
  return { code: 0, stdout: rows.length ? `${rows.join("\n")}\n` : "", stderr: "", respring: false };
}

export function aptShow(root, name) {
  const pkg = packageByName(name);
  if (!pkg) return { code: 1, stdout: "", stderr: `E: No packages found\n`, respring: false };
  const installed = readInstalled(root);
  const stdout = [
    `Package: ${pkg.name}`,
    `Version: ${pkg.version}`,
    `Architecture: ${pkg.arch}`,
    `Section: ${pkg.section}`,
    `Maintainer: ${pkg.maintainer}`,
    `Installed-Size: ${pkg.installedSize}`,
    pkg.depends.length ? `Depends: ${pkg.depends.join(", ")}` : "Depends: ",
    `Homepage: ${DEVICE.source}`,
    `Description: ${pkg.description}`,
    installed.has(pkg.name) ? "Status: install ok installed" : "Status: not installed",
    "",
  ].join("\n");
  return { code: 0, stdout, stderr: "", respring: false };
}

export function aptInstall(root, names, options = {}) {
  if (!options.asRoot) return denied();
  const requested = names.filter(Boolean);
  if (!requested.length) return { code: 1, stdout: "", stderr: "E: No packages specified\n", respring: false };
  const plan = planInstall(root, requested);
  if (plan.missing.length) {
    return {
      code: 100,
      stdout: "",
      stderr: plan.missing.map((name) => `E: Unable to locate package ${name}`).join("\n") + "\n",
      respring: false,
    };
  }
  if (!plan.packages.length) {
    const lines = requested.map((name) => {
      const pkg = packageByName(name);
      return `${name} is already the newest version (${pkg.version}).`;
    });
    return {
      code: 0,
      stdout: `${lines.join("\n")}\n0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\n`,
      stderr: "",
      respring: false,
    };
  }
  const wanted = new Set(requested);
  const extra = plan.packages.filter((pkg) => !wanted.has(pkg.name));
  const bytes = plan.packages.reduce((sum, pkg) => sum + pkg.size, 0);
  const disk = plan.packages.reduce((sum, pkg) => sum + pkg.installedSize, 0);
  const lines = ["Reading package lists... Done", "Building dependency tree... Done"];
  if (extra.length) {
    lines.push("The following additional packages will be installed:", `  ${extra.map((pkg) => pkg.name).join(" ")}`);
  }
  lines.push(
    "The following NEW packages will be installed:",
    `  ${plan.packages.map((pkg) => pkg.name).join(" ")}`,
    `0 upgraded, ${plan.packages.length} newly installed, 0 to remove and 0 not upgraded.`,
    `Need to get ${human(bytes)} of archives.`,
    `After this operation, ${human(disk * 1024)} of additional disk space will be used.`,
  );
  plan.packages.forEach((pkg, index) => {
    lines.push(
      `Get:${index + 1} ${DEVICE.source} ${DEVICE.suite}/main iphoneos-arm64 ${pkg.name} iphoneos-arm64 ${pkg.version} [${human(pkg.size)}]`,
    );
  });
  lines.push(`Fetched ${human(bytes)} in 0s (612 kB/s)`);
  lines.push(databaseLine(root));
  for (const pkg of plan.packages) {
    lines.push(
      `Selecting previously unselected package ${pkg.name}.`,
      `Preparing to unpack .../${debFileName(pkg)} ...`,
      `Unpacking ${pkg.name} (${pkg.version}) ...`,
    );
  }
  for (const pkg of plan.packages) lines.push(`Setting up ${pkg.name} (${pkg.version}) ...`);
  const installed = readInstalled(root);
  for (const pkg of plan.packages) {
    applyFiles(root, pkg);
    installed.set(pkg.name, { name: pkg.name, version: pkg.version });
  }
  writeStatus(root, [...installed.keys()]);
  return {
    code: 0,
    stdout: `${lines.join("\n")}\n`,
    stderr: "",
    respring: plan.packages.some((pkg) => pkg.respring),
  };
}

export function aptRemove(root, names, options = {}) {
  if (!options.asRoot) return denied();
  const requested = names.filter(Boolean);
  if (!requested.length) return { code: 1, stdout: "", stderr: "E: No packages specified\n", respring: false };
  const installed = readInstalled(root);
  const missing = requested.filter((name) => !packageByName(name));
  if (missing.length) {
    return { code: 100, stdout: "", stderr: missing.map((name) => `E: Unable to locate package ${name}`).join("\n") + "\n", respring: false };
  }
  const essential = requested.filter((name) => packageByName(name).essential);
  if (essential.length && !options.forceEssential) {
    return {
      code: 1,
      stdout: "",
      stderr: `E: Essential packages cannot be removed: ${essential.join(", ")}\nE: Pass --force-remove-essential if you are certain.\n`,
      respring: false,
    };
  }
  const removing = requested.filter((name) => installed.has(name)).map((name) => packageByName(name));
  const skipped = requested.filter((name) => !installed.has(name));
  const lines = ["Reading package lists... Done", "Building dependency tree... Done"];
  for (const name of skipped) lines.push(`Package '${name}' is not installed, so not removed`);
  if (!removing.length) return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "", respring: false };
  const disk = removing.reduce((sum, pkg) => sum + pkg.installedSize, 0);
  lines.push(
    "The following packages will be REMOVED:",
    `  ${removing.map((pkg) => pkg.name).join(" ")}`,
    `0 upgraded, 0 newly installed, ${removing.length} to remove and 0 not upgraded.`,
    `After this operation, ${human(disk * 1024)} disk space will be freed.`,
    databaseLine(root),
  );
  for (const pkg of removing) {
    lines.push(`Removing ${pkg.name} (${pkg.version}) ...`);
    removeFiles(root, pkg);
    installed.delete(pkg.name);
  }
  writeStatus(root, [...installed.keys()]);
  return {
    code: 0,
    stdout: `${lines.join("\n")}\n`,
    stderr: "",
    respring: removing.some((pkg) => pkg.respring),
  };
}

export function aptDownload(root, cwd, name, options = {}) {
  const pkg = packageByName(name);
  if (!pkg) return { code: 100, stdout: "", stderr: `E: Unable to locate package ${name}\n`, respring: false };
  const path = logicalResolve(cwd, debFileName(pkg), options.home ?? "");
  const body = `Package: ${pkg.name}\nVersion: ${pkg.version}\nArchitecture: ${pkg.arch}\n`;
  const wrote = writeFile(root, path, body, { mode: 0o644, owner: options.owner ?? "mobile", group: "mobile", mtime: Date.now() });
  if (wrote.error) return { code: 1, stdout: "", stderr: `E: Failed to write ${path}\n`, respring: false };
  return {
    code: 0,
    stdout: `Get:1 ${DEVICE.source} ${DEVICE.suite}/main iphoneos-arm64 ${pkg.name} iphoneos-arm64 ${pkg.version} [${human(pkg.size)}]\nFetched ${human(pkg.size)} in 0s (400 kB/s)\n`,
    stderr: "",
    respring: false,
    path,
  };
}

export function dpkgList(root) {
  const installed = [...readInstalled(root).keys()].sort();
  const header = [
    "Desired=Unknown/Install/Remove/Purge/Hold",
    "| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend",
    "|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)",
    "||/ Name             Version          Architecture     Description",
    "+++-================-================-================-================================",
  ];
  const rows = installed.map((name) => {
    const pkg = packageByName(name);
    const version = pkg?.version ?? readInstalled(root).get(name).version;
    return `ii  ${name.padEnd(16, " ")} ${String(version).padEnd(16, " ")} ${"iphoneos-arm64".padEnd(16, " ")} ${pkg?.description ?? ""}`;
  });
  return { code: 0, stdout: `${header.concat(rows).join("\n")}\n`, stderr: "", respring: false };
}

export function dpkgInstall(root, cwd, filePath, options = {}) {
  if (!options.asRoot) return denied();
  const path = logicalResolve(cwd, filePath, options.home ?? "");
  const file = readFile(root, path);
  if (file.error) return { code: 1, stdout: "", stderr: `dpkg: error: cannot access archive '${filePath}': No such file or directory\n`, respring: false };
  const name = /^Package: (.+)$/m.exec(file.content)?.[1];
  const pkg = packageByName(name);
  if (!pkg) return { code: 1, stdout: "", stderr: `dpkg: error processing archive ${filePath}: package not in the Procursus index\n`, respring: false };
  const installed = readInstalled(root);
  const missingDeps = pkg.depends.filter((dep) => !installed.has(dep));
  if (missingDeps.length) {
    const lines = [`dpkg: dependency problems prevent configuration of ${pkg.name}:`];
    for (const dep of missingDeps) {
      lines.push(` ${pkg.name} depends on ${dep}; however:`, `  Package ${dep} is not installed.`);
    }
    lines.push(`dpkg: error processing archive ${filePath}:\n dependency problems - leaving unconfigured`);
    return { code: 1, stdout: "", stderr: `${lines.join("\n")}\n`, respring: false };
  }
  applyFiles(root, pkg);
  installed.set(pkg.name, { name: pkg.name, version: pkg.version });
  writeStatus(root, [...installed.keys()]);
  const stdout = [
    `Selecting previously unselected package ${pkg.name}.`,
    databaseLine(root),
    `Preparing to unpack ${filePath} ...`,
    `Unpacking ${pkg.name} (${pkg.version}) ...`,
    `Setting up ${pkg.name} (${pkg.version}) ...`,
    "",
  ].join("\n");
  return { code: 0, stdout, stderr: "", respring: pkg.respring };
}

export function dpkgFiles(root, name) {
  const installed = readInstalled(root);
  if (!installed.has(name)) return { code: 1, stdout: "", stderr: `dpkg-query: package '${name}' is not installed\n`, respring: false };
  const pkg = packageByName(name);
  const paths = pkg?.files.map((file) => file.path) ?? [];
  return { code: 0, stdout: paths.length ? `${paths.join("\n")}\n` : "", stderr: "", respring: false };
}
