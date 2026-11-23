import { decompress } from "fzstd";
import { linkNode, lookup, mkdirp, writeFile } from "./fs.js";

const MACHO = [0xcf, 0xfa, 0xed, 0xfe];
const MACHO_BE = [0xfe, 0xed, 0xfa, 0xcf];
const FAT = [0xca, 0xfe, 0xba, 0xbe];

export function isMachO(bytes) {
  if (!bytes || bytes.length < 4) return false;
  return [MACHO, MACHO_BE, FAT].some((magic) => magic.every((byte, index) => bytes[index] === byte));
}

function isText(bytes) {
  const length = Math.min(bytes.length, 1024);
  for (let index = 0; index < length; index += 1) {
    if (bytes[index] === 0) return false;
  }
  return true;
}

function readAr(bytes) {
  const header = new TextDecoder().decode(bytes.subarray(0, 8));
  if (header !== "!<arch>\n") throw new Error("not a debian archive");
  const members = [];
  let offset = 8;
  while (offset + 60 <= bytes.length) {
    const name = new TextDecoder().decode(bytes.subarray(offset, offset + 16)).trim().replace(/\/$/, "");
    const size = Number(new TextDecoder().decode(bytes.subarray(offset + 48, offset + 58)).trim());
    const start = offset + 60;
    members.push({ name, bytes: bytes.subarray(start, start + size) });
    offset = start + size + (size % 2);
  }
  return members;
}

function inflate(name, bytes) {
  if (name.endsWith(".zst")) return decompress(bytes);
  if (name.endsWith(".tar")) return bytes;
  throw new Error(`cannot decompress ${name}`);
}

function octal(bytes, start, length) {
  const text = new TextDecoder().decode(bytes.subarray(start, start + length)).replace(/\0.*$/, "").trim();
  if (!text) return 0;
  return Number.parseInt(text, 8) || 0;
}

function textField(bytes, start, length) {
  return new TextDecoder().decode(bytes.subarray(start, start + length)).replace(/\0.*$/, "");
}

export function parseTar(bytes) {
  const entries = [];
  let offset = 0;
  let longName = "";
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const type = header[156];
    const size = octal(header, 124, 12);
    const mode = octal(header, 100, 8) || 0o644;
    const prefix = textField(header, 345, 155);
    const name = longName || `${prefix}${prefix && !prefix.endsWith("/") ? "/" : ""}${textField(header, 0, 100)}`;
    longName = "";
    const dataStart = offset + 512;
    const data = bytes.subarray(dataStart, dataStart + size);
    offset = dataStart + (Math.ceil(size / 512) * 512);
    if (type === 76 || type === 75) {
      longName = new TextDecoder().decode(data).replace(/\0.*$/, "");
      continue;
    }
    const linkname = textField(header, 157, 100);
    entries.push({
      name: name.replace(/^\.\/?/, "").replace(/\/$/, ""),
      type: type === 0 || type === 48 ? "file" : type === 53 ? "dir" : type === 50 || type === 49 ? "link" : "other",
      mode,
      linkname,
      bytes: data,
    });
  }
  return entries;
}

function absoluteLink(path, target) {
  if (!target) return path;
  if (target.startsWith("/")) return target;
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return `/${parts.join("/")}`;
}

export function extractDeb(debBytes) {
  const members = readAr(debBytes);
  const data = members.find((member) => member.name.startsWith("data.tar"));
  if (!data) throw new Error("deb has no data.tar");
  const tarBytes = data.name.endsWith(".zst") ? inflate(data.name, data.bytes) : data.bytes;
  return parseTar(tarBytes).filter((entry) => entry.name);
}

function writeOctal(target, offset, length, value) {
  const text = Math.max(0, value).toString(8).padStart(length - 1, "0");
  target.set(new TextEncoder().encode(text.slice(0, length - 1)), offset);
}

function arMember(name, bytes) {
  const header = new Uint8Array(60);
  header.set(new TextEncoder().encode(name.padEnd(16, " ").slice(0, 16)), 0);
  header.set(new TextEncoder().encode("0".repeat(12)), 16);
  header.set(new TextEncoder().encode("0".repeat(6)), 28);
  header.set(new TextEncoder().encode("0".repeat(6)), 34);
  header.set(new TextEncoder().encode("100644  "), 40);
  header.set(new TextEncoder().encode(String(bytes.length).padStart(10, " ")), 48);
  header.set(new TextEncoder().encode("`\n"), 58);
  const padded = bytes.length % 2 ? new Uint8Array([10]) : new Uint8Array();
  return [header, bytes, padded];
}

export function buildDeb(entries) {
  const chunks = [];
  for (const entry of entries) {
    const data = new TextEncoder().encode(entry.text ?? "");
    const header = new Uint8Array(512);
    header.set(new TextEncoder().encode(entry.path.replace(/^\//, "").slice(0, 100)), 0);
    writeOctal(header, 100, 8, entry.mode ?? 0o755);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, data.length);
    writeOctal(header, 136, 12, 0);
    header[156] = 48;
    header.set(new TextEncoder().encode("ustar"), 257);
    for (let index = 148; index < 156; index += 1) header[index] = 32;
    let sum = 0;
    for (const byte of header) sum += byte;
    writeOctal(header, 148, 8, sum);
    const pad = (512 - (data.length % 512)) % 512;
    const block = new Uint8Array(512 + data.length + pad);
    block.set(header, 0);
    block.set(data, 512);
    chunks.push(block);
  }
  chunks.push(new Uint8Array(1024));
  const tar = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    tar.set(chunk, at);
    at += chunk.length;
  }
  const parts = [new TextEncoder().encode("!<arch>\n"), ...arMember("debian-binary", new TextEncoder().encode("2.0\n")), ...arMember("data.tar", tar)];
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function unpackDeb(root, debBytes) {
  const entries = extractDeb(debBytes);
  const paths = [];
  for (const entry of entries) {
    const path = `/${entry.name}`;
    if (entry.type === "dir") {
      mkdirp(root, path, { mode: entry.mode || 0o755 });
      continue;
    }
    if (entry.type === "link") {
      const parts = path.split("/").filter(Boolean);
      const base = parts.pop();
      const parent = `/${parts.join("/")}`;
      mkdirp(root, parent);
      const found = lookup(root, parent, { followLast: true });
      if (!found.error) found.node.children[base] = linkNode(absoluteLink(path, entry.linkname), { mode: entry.mode || 0o777 });
      paths.push(path);
      continue;
    }
    if (entry.type !== "file") continue;
    const text = isText(entry.bytes);
    const macho = isMachO(entry.bytes);
    if (text && !macho) {
      writeFile(root, path, new TextDecoder().decode(entry.bytes), { mode: entry.mode || 0o644, size: entry.bytes.length });
    } else {
      const parts = path.split("/").filter(Boolean);
      const base = parts.pop();
      mkdirp(root, `/${parts.join("/")}`);
      const parent = lookup(root, `/${parts.join("/")}`, { followLast: true });
      if (!parent.error) {
        parent.node.children[base] = {
          type: "file",
          mode: entry.mode || 0o755,
          owner: "root",
          group: "wheel",
          mtime: Date.now(),
          content: "",
          size: entry.bytes.length,
          encoding: "binary",
          bytes: entry.bytes,
          macho,
        };
      }
    }
    paths.push(path);
  }
  return paths;
}
