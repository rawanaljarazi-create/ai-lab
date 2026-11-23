import { readInstalled } from "./apt.js";
import { listPackages, packageByName } from "./repo.js";

const FEATURED = ["cowsay", "sl", "htop", "neofetch", "git", "python3", "curl", "ldid", "zsh", "nano"];
import { clearQueue, confirmQueue, queueInstall, queueRemove } from "./queue.js";
import { DEVICE } from "./system.js";

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hue(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 33 + char.charCodeAt(0)) % 360;
  return hash;
}

function icon(name) {
  const color = hue(name);
  return `<span class="icon" style="background:linear-gradient(160deg, hsl(${color} 32% 42%), hsl(${color} 28% 24%))">${esc(name.slice(0, 1).toUpperCase())}</span>`;
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function queueItem(session, name) {
  return session.queue.find((item) => item.name === name) ?? null;
}

function actionButton(session, pkg) {
  const queued = queueItem(session, pkg.name);
  const installed = readInstalled(session.fs).has(pkg.name);
  if (queued?.action === "install") return `<button class="get queued" data-act="unqueue" data-pkg="${esc(pkg.name)}">QUEUED</button>`;
  if (queued?.action === "remove") return `<button class="get queued" data-act="unremove" data-pkg="${esc(pkg.name)}">QUEUED</button>`;
  if (installed) return `<button class="get modify" data-act="modify" data-pkg="${esc(pkg.name)}">MODIFY</button>`;
  return `<button class="get" data-act="get" data-pkg="${esc(pkg.name)}">GET</button>`;
}

function packageRow(session, pkg) {
  return `<article class="pkg" data-open="${esc(pkg.name)}">
    ${icon(pkg.name)}
    <h3>${esc(pkg.name)}</h3>
    <p class="desc">${esc(pkg.description)}</p>
    <p class="ver">${esc(pkg.version)}</p>
    ${actionButton(session, pkg)}
  </article>`;
}

function banner(pkg) {
  const color = hue(pkg.name);
  return `<button class="banner" data-open="${esc(pkg.name)}" style="background:linear-gradient(145deg, hsl(${color} 30% 28%), hsl(${color} 22% 12%))">
    <span>${esc(pkg.section)}</span>
    <strong>${esc(pkg.name)}</strong>
  </button>`;
}

export function mountSileo(root, session, hooks) {
  const view = {
    tab: "featured",
    stack: [],
    query: "",
    sheet: null,
    log: "",
    error: "",
    force: false,
  };

  const refresh = () => {
    root.innerHTML = render();
    bind();
  };

  function title() {
    const top = view.stack[view.stack.length - 1];
    if (view.sheet === "log") return view.error ? "Error" : "Done";
    if (top?.kind === "detail") return packageByName(top.name)?.name ?? "Package";
    if (top?.kind === "installed") return "Installed";
    if (top?.kind === "all") return "All Packages";
    return { featured: "Featured", fresh: "New", sources: "Sources", packages: "Packages", search: "Search" }[view.tab];
  }

  function body() {
    const top = view.stack[view.stack.length - 1];
    if (top?.kind === "detail") return detail(packageByName(top.name));
    if (top?.kind === "installed") return list(listPackages().filter((pkg) => readInstalled(session.fs).has(pkg.name)));
    if (top?.kind === "all") return list(listPackages());
    if (view.tab === "featured") return featured();
    if (view.tab === "fresh") return fresh();
    if (view.tab === "sources") return sources();
    if (view.tab === "packages") return packagesHome();
    return search();
  }

  function featured() {
    const featuredPackages = FEATURED.map((name) => packageByName(name)).filter(Boolean);
    return `<section class="block">
      <p class="kicker">Procursus</p>
      <div class="banners">${featuredPackages.map(banner).join("")}</div>
      <h3 class="section">Utilities</h3>
      <div class="group">${featuredPackages.map((pkg) => packageRow(session, pkg)).join("")}</div>
    </section>`;
  }

  function fresh() {
    const rows = listPackages().filter((pkg) => pkg.section === "Games").slice(0, 40);
    if (!rows.length) return `<p class="empty">There are no new packages indexed yet.</p>`;
    return `<div class="group">${rows.map((pkg) => packageRow(session, pkg)).join("")}</div>`;
  }

  function sources() {
    const count = listPackages().length;
    return `<div class="group sources">
      <article class="source">
        ${icon("procursus")}
        <h3>Procursus</h3>
        <p class="desc">${esc(DEVICE.source)}</p>
        <p class="ver">${count} packages · suite ${esc(DEVICE.suite)} · main</p>
      </article>
    </div>
    <p class="fine">Not a real apt.procurs.us index. Refresh only rewrites the local package list.</p>
    <button class="wide" data-act="refresh">Refresh Sources</button>`;
  }

  function packagesHome() {
    const installed = readInstalled(session.fs);
    return `<div class="group menu">
      <button data-act="updates"><span>Updates</span><em>0</em></button>
      <button data-act="installed"><span>Installed</span><em>${installed.size}</em></button>
      <button data-act="all"><span>All Packages</span><em>${listPackages().length}</em></button>
    </div>`;
  }

  function search() {
    const needle = view.query.trim().toLowerCase();
    const hits = needle
      ? listPackages().filter((pkg) =>
        pkg.name.includes(needle) ||
        pkg.description.toLowerCase().includes(needle) ||
        pkg.author.toLowerCase().includes(needle))
      : [];
    const recent = session.recent.map((term) => `<button class="chip" data-act="recent" data-term="${esc(term)}">${esc(term)}</button>`).join("");
    return `<label class="search"><span class="sr">Search for Packages</span>
      <input id="sileo-search" value="${esc(view.query)}" placeholder="Search for Packages" enterkeyhint="search" autocapitalize="none" autocorrect="off" spellcheck="false" />
    </label>
    ${needle ? `<div class="group">${hits.map((pkg) => packageRow(session, pkg)).join("") || `<p class="empty">No packages found.</p>`}</div>` : `<h3 class="section">Recently Searched</h3><div class="chips">${recent || `<p class="empty">Search the Procursus index.</p>`}</div>`}`;
  }

  function list(packages) {
    const rows = [...packages].sort((a, b) => a.name.localeCompare(b.name));
    if (!rows.length) return `<p class="empty">No packages.</p>`;
    return `<div class="group">${rows.map((pkg) => packageRow(session, pkg)).join("")}</div>`;
  }

  function detail(pkg) {
    if (!pkg) return `<p class="empty">Package unavailable.</p>`;
    const installed = readInstalled(session.fs);
    const deps = pkg.depends.length
      ? pkg.depends.map((name) => `${esc(name)}${installed.has(name) ? " (installed)" : ""}`).join(", ")
      : "none";
    return `<section class="detail">
      <div class="hero">${icon(pkg.name)}<div><h3>${esc(pkg.name)}</h3><p>by ${esc(pkg.author)}</p></div>${actionButton(session, pkg)}</div>
      <p class="blurb">${esc(pkg.description)}</p>
      <dl>
        <div><dt>Version</dt><dd>${esc(pkg.version)}</dd></div>
        <div><dt>Section</dt><dd>${esc(pkg.section)}</dd></div>
        <div><dt>Size</dt><dd>${esc(human(pkg.size))}</dd></div>
        <div><dt>Source</dt><dd>Procursus ${esc(DEVICE.suite)}</dd></div>
        <div><dt>Depends</dt><dd>${deps}</dd></div>
      </dl>
      <p class="fine">Confirm runs apt. ${pkg.respring ? "This tweak asks to restart SpringBoard afterwards." : "Libraries and tools do not respring."}</p>
    </section>`;
  }

  function sheet() {
    if (view.sheet === "modify") {
      const pkg = packageByName(view.modify);
      return `<div class="sheet"><div class="card">
        <h3>${esc(pkg?.name ?? "Package")}</h3>
        <button data-act="reinstall" data-pkg="${esc(view.modify)}">Reinstall</button>
        <button data-act="remove" data-pkg="${esc(view.modify)}">Uninstall</button>
        <button data-act="close-sheet">Cancel</button>
      </div></div>`;
    }
    if (view.sheet === "review") {
      const rows = session.queue.map((item) => {
        const pkg = packageByName(item.name);
        return `<li><span>${item.action === "remove" ? "Uninstall" : "Install"}</span> ${esc(pkg?.name ?? item.name)} <em>${esc(pkg?.version ?? "")}</em></li>`;
      }).join("");
      const essential = session.queue.some((item) => item.action === "remove" && packageByName(item.name)?.essential);
      return `<div class="sheet"><div class="card">
        <h3>${essential ? "Essential package" : "Queued"}</h3>
        ${essential ? `<p class="warn">Removing an essential package can break apt itself. Sileo will pass --force-remove-essential only if you continue.</p>` : ""}
        <ul>${rows}</ul>
        ${view.error ? `<p class="warn">${esc(view.error)}</p>` : ""}
        <button class="primary" data-act="run">${essential ? "Remove Anyway" : "Confirm"}</button>
        <button data-act="clear">Clear Queue</button>
      </div></div>`;
    }
    if (view.sheet === "log") {
      return `<div class="sheet"><div class="card logcard">
        <h3>${view.error ? "Error" : "Done"}</h3>
        <pre>${esc(view.log)}</pre>
        ${view.respring ? `<button class="primary" data-act="spring">Restart SpringBoard</button>` : ""}
        <button data-act="close-log">Done</button>
      </div></div>`;
    }
    if (view.sheet === "updates") {
      return `<div class="sheet"><div class="card"><h3>No New Packages</h3><p>There are no updates in this local Procursus index.</p><button data-act="close-sheet">OK</button></div></div>`;
    }
    return "";
  }

  function render() {
    const count = session.queue.length;
    const back = view.stack.length ? "" : "hidden";
    return `<header class="sileo-nav">
      <button class="back" data-act="back" ${back}>Back</button>
      <h2>${esc(title())}</h2>
    </header>
    <p class="sileo-warn">Packages are the Procursus suite 3000 archive from apt.procurs.us.</p>
    <div class="sileo-body">${body()}</div>
    <div class="queue-bar" ${count ? "" : "hidden"}>
      <div><strong>Queued</strong><span>${count} Package${count === 1 ? "" : "s"}</span></div>
      <button class="confirm" data-act="review">Confirm</button>
    </div>
    <nav class="tabs" aria-label="Sileo">
      ${tab("featured", "Featured")}${tab("fresh", "New")}${tab("sources", "Sources")}${tab("packages", "Packages")}${tab("search", "Search")}
    </nav>
    ${sheet()}`;
  }

  function tab(id, label) {
    const selected = view.tab === id && view.stack.length === 0;
    return `<button data-tab="${id}" aria-selected="${selected ? "true" : "false"}">${glyph(id)}<span>${label}</span></button>`;
  }

  function bind() {
    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        view.tab = button.dataset.tab;
        view.stack = [];
        view.sheet = null;
        refresh();
        if (view.tab === "search") root.querySelector("#sileo-search")?.focus();
      });
    });
    root.querySelectorAll("[data-open]").forEach((node) => {
      node.addEventListener("click", (event) => {
        const nested = event.target.closest("button");
        if (nested && nested !== event.currentTarget) return;
        view.stack.push({ kind: "detail", name: node.dataset.open });
        refresh();
      });
    });
    root.querySelectorAll("[data-act]").forEach((button) => {
      button.addEventListener("click", () => act(button));
    });
    const search = root.querySelector("#sileo-search");
    if (search) {
      search.addEventListener("input", () => {
        view.query = search.value;
        const caret = search.selectionStart;
        refresh();
        const next = root.querySelector("#sileo-search");
        if (next) {
          next.focus();
          next.setSelectionRange(caret, caret);
        }
      });
      search.addEventListener("change", () => remember(search.value));
    }
  }

  function remember(value) {
    const term = value.trim();
    if (term.length < 2) return;
    session.recent = [term, ...session.recent.filter((item) => item !== term)].slice(0, 8);
    hooks.onChange();
  }

  async function act(button) {
    const action = button.dataset.act;
    const name = button.dataset.pkg;
    if (action === "back") {
      view.stack.pop();
      refresh();
      return;
    }
    if (action === "get" || action === "unqueue" || action === "reinstall") {
      const result = queueInstall(session, name);
      view.sheet = null;
      view.error = result.ok ? "" : result.error;
      if (!result.ok) view.sheet = "review";
      hooks.onChange();
      refresh();
      return;
    }
    if (action === "remove") {
      queueRemove(session, name);
      view.sheet = null;
      hooks.onChange();
      refresh();
      return;
    }
    if (action === "unremove") {
      queueRemove(session, name);
      hooks.onChange();
      refresh();
      return;
    }
    if (action === "modify") {
      view.modify = name;
      view.sheet = "modify";
      refresh();
      return;
    }
    if (action === "review") {
      view.sheet = "review";
      view.error = "";
      refresh();
      return;
    }
    if (action === "clear" || action === "close-sheet") {
      if (action === "clear") clearQueue(session);
      view.sheet = null;
      hooks.onChange();
      refresh();
      return;
    }
    if (action === "run") {
      const essential = session.queue.some((item) => item.action === "remove" && packageByName(item.name)?.essential);
      const result = await confirmQueue(session, { forceEssential: essential });
      view.log = `${result.stdout}${result.stderr}`.trim();
      view.error = result.code !== 0;
      view.respring = result.code === 0 && result.respring;
      view.sheet = "log";
      hooks.onChange();
      refresh();
      return;
    }
    if (action === "close-log") {
      view.sheet = null;
      view.stack = view.stack.filter((item) => item.kind !== "detail");
      refresh();
      return;
    }
    if (action === "spring") {
      view.sheet = null;
      refresh();
      hooks.onRespring();
      return;
    }
    if (action === "refresh") {
      const result = await hooks.onRefresh();
      view.sheet = "log";
      view.error = result.code !== 0;
      view.log = `${result.stdout}${result.stderr}`.trim();
      view.respring = false;
      refresh();
      return;
    }
    if (action === "installed") {
      view.stack.push({ kind: "installed" });
      refresh();
      return;
    }
    if (action === "all") {
      view.stack.push({ kind: "all" });
      refresh();
      return;
    }
    if (action === "updates") {
      view.sheet = "updates";
      refresh();
      return;
    }
    if (action === "recent") {
      view.query = button.dataset.term;
      refresh();
    }
  }

  refresh();
  return { refresh, showSearch() { view.tab = "search"; view.stack = []; refresh(); } };
}

function glyph(id) {
  const paths = {
    featured: "M12 3l2.2 6.4H21l-5.4 4 2.1 6.6L12 16.8 6.3 20l2.1-6.6L3 9.4h6.8z",
    fresh: "M12 4v10m0 0l-4-4m4 4l4-4M5 19h14",
    sources: "M5 6h14M5 12h14M5 18h10",
    packages: "M4 7l8-3 8 3-8 3-8-3zm0 5l8 3 8-3M4 17l8 3 8-3",
    search: "M11 6a5 5 0 015 5 5 5 0 01-5 5 5 5 0 01-5-5 5 5 0 015-5zm4 8l3 3",
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[id]}"/></svg>`;
}
