import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const device = readFileSync(new URL("../src/device.js", import.meta.url), "utf8");
const log = readFileSync(new URL("../src/log.js", import.meta.url), "utf8");
const run = readFileSync(new URL("../src/run.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../../site/index.html", import.meta.url), "utf8");
const root = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
const build = readFileSync(new URL("../../scripts/build-site.mjs", import.meta.url), "utf8");
const source = [html, css, main, device, log, run].join("\n");

test("the page is a standalone phone screen", () => {
  assert.match(html, /name="apple-mobile-web-app-capable"\s+content="yes"/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /name="theme-color"/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-right/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /safe-area-inset-left/);
  assert.match(css, /overscroll-behavior:\s*none/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(main, /prefers-reduced-motion/);
  assert.match(html, /Newra1n jailbreak complete/);
  assert.match(html, /<title>Newra1n<\/title>/);
  assert.match(html, /<h1>Newra1n<\/h1>/);
  assert.doesNotMatch(html, /Placebo/);
  assert.match(html, /27\.0\.1/);
  assert.match(html, /calif\.io/);
  assert.match(html, /0 exploits were used/);
  assert.match(html, /You've been pranked/);
  assert.match(html, /Run again/);
  assert.match(html, />Jailbreak</);
  assert.match(html, />Tweaks</);
  assert.match(html, />Install Sileo</);
  assert.match(html, />Rootless</);
});

test("the shortcut query waits for the Jailbreak button", () => {
  assert.match(main, /go\.addEventListener\("click", start\)/);
  assert.doesNotMatch(main, /wantsAuto|location\.search|setTimeout\(start/);
});

test("the options never change the script", () => {
  assert.match(main, /scheduleLog\(\)/);
  assert.match(main, /aria-checked/);
  assert.doesNotMatch(main, /scheduleLog\([^)]+/);
});

test("the page does not touch the network, storage, or files", () => {
  const shipped = source.replaceAll("http://www.w3.org/2000/svg", "");
  const banned = [
    /CVE-\d/i,
    /0x[0-9a-f]/i,
    /https?:\/\//i,
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /sendBeacon/,
    /localStorage/,
    /sessionStorage/,
    /indexedDB/,
    /geolocation/,
    /mediaDevices/,
    /document\.cookie/,
    /mobileconfig/i,
    /<a\s/i,
    /navigator\.vibrate/,
  ];
  for (const pattern of banned) assert.doesNotMatch(shipped, pattern, String(pattern));
});

test("placebo is built and rewritten, and the homepage does not name it", () => {
  assert.doesNotMatch(home, /placebo/i);
  assert.ok(root.workspaces.includes("placebo"));
  assert.match(root.scripts.build, /-w placebo/);
  assert.match(root.scripts.test, /placebo\/test/);
  assert.match(build, /"placebo"/);
  const sources = vercel.rewrites.map((rule) => rule.source);
  assert.ok(sources.includes("/placebo"));
  assert.ok(sources.includes("/placebo/"));
  for (const rule of vercel.rewrites) {
    if (rule.source === "/placebo" || rule.source === "/placebo/") {
      assert.equal(rule.destination, "/placebo/index.html");
    }
  }
});
