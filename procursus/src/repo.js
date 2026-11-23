import { decompress } from "fzstd";
import { DEVICE } from "./system.js";

const INDEX_URL = "/procursus-apt/dists/3000/main/binary-iphoneos-arm64/Packages.zst";
const NODE_INDEX_URL = "https://apt.procurs.us/dists/3000/main/binary-iphoneos-arm64/Packages.zst";

let packages = [];
const byName = new Map();

function dependencyNames(field) {
  if (!field) return [];
  const names = [];
  for (const part of field.split(",")) {
    const first = part.split("|")[0].trim();
    const name = first.split(/[\s(]/)[0];
    if (name && name !== "${shlibs:Depends}") names.push(name);
  }
  return names;
}

function firstLine(value) {
  return String(value ?? "").split("\n")[0].trim();
}

function toPackage(fields) {
  return {
    name: fields.Package,
    version: fields.Version ?? "",
    arch: fields.Architecture ?? "iphoneos-arm64",
    section: fields.Section ?? "misc",
    size: Number(fields.Size ?? 0),
    installedSize: Number(fields["Installed-Size"] ?? 0),
    maintainer: fields.Maintainer ?? "Procursus Team <support@procurs.us>",
    author: fields.Author ?? fields.Maintainer ?? "Procursus Team",
    depends: dependencyNames(fields.Depends),
    preDepends: dependencyNames(fields["Pre-Depends"]),
    description: firstLine(fields.Description),
    details: fields.Description ?? "",
    filename: fields.Filename ?? "",
    homepage: fields.Homepage ?? DEVICE.source,
    essential: String(fields.Essential ?? "").toLowerCase() === "yes" || String(fields.Priority ?? "") === "required",
    files: [],
  };
}

function better(next, prev) {
  const nextNative = next.arch === "iphoneos-arm64";
  const prevNative = prev.arch === "iphoneos-arm64";
  if (nextNative !== prevNative) return nextNative;
  return next.version.localeCompare(prev.version, undefined, { numeric: true }) > 0;
}

export function parsePackages(text) {
  const map = new Map();
  for (const block of String(text).split(/\n\n+/)) {
    const fields = {};
    let key = null;
    for (const line of block.split("\n")) {
      if (!line) continue;
      if (line.startsWith(" ") || line.startsWith("\t")) {
        if (key) fields[key] += `\n${line.trim()}`;
        continue;
      }
      const split = line.indexOf(": ");
      if (split === -1) continue;
      key = line.slice(0, split);
      fields[key] = line.slice(split + 2);
    }
    if (!fields.Package) continue;
    const pkg = toPackage(fields);
    const previous = map.get(pkg.name);
    if (!previous || better(pkg, previous)) map.set(pkg.name, pkg);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function setPackages(list) {
  packages = list;
  byName.clear();
  for (const pkg of list) byName.set(pkg.name, pkg);
}

export function listPackages() {
  return packages;
}

export function packageByName(name) {
  return byName.get(name) ?? null;
}

export function packageCount() {
  return packages.length;
}

export function loadPackagesZst(bytes) {
  const text = new TextDecoder().decode(decompress(bytes));
  setPackages(parsePackages(text));
  return packages.length;
}

let indexFetcher = async () => {
  const url = typeof window === "undefined" ? NODE_INDEX_URL : INDEX_URL;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

export function setIndexFetcher(fetcher) {
  indexFetcher = fetcher;
}

export async function refreshIndex() {
  const bytes = await indexFetcher();
  if (!bytes) return packageCount();
  return loadPackagesZst(bytes);
}

export function debUrl(filename) {
  const path = String(filename).replace(/^\//, "");
  if (typeof window === "undefined") return `https://apt.procurs.us/${path}`;
  return `/procursus-apt/${path}`;
}
