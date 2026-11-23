import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../home.css", import.meta.url), "utf8");

const routes = [
  "/aetherwell/",
  "/squishy/",
  "/flappy/",
  "/beats/",
  "/pixel/",
  "/physics/",
  "/typing/",
  "/procursus/",
  "/shellbox/",
  "/ios16/",
];

test("homepage links every experiment", () => {
  for (const href of routes) {
    assert.ok(home.includes(`href="${href}"`), href);
  }
});

test("homepage keeps the Procursus archive note and the local commands", () => {
  assert.match(home, /apt\.procurs\.us/);
  assert.match(home, /suite 3000/);
  for (const script of [
    "dev:aetherwell",
    "dev:squishy",
    "dev:flappy",
    "dev:beats",
    "dev:pixel",
    "dev:physics",
    "dev:typing",
    "dev:procursus",
  ]) {
    assert.ok(home.includes(script), script);
  }
});

test("browser demos are not labeled as new", () => {
  assert.doesNotMatch(home, /New on this site/);
  for (const name of ["Pixel", "Squishy", "Flappy", "Beats", "Physics", "Typing"]) {
    const card = home.slice(home.indexOf(`<h2>${name}</h2>`) - 80, home.indexOf(`<h2>${name}</h2>`));
    assert.match(card, /In the browser/, name);
  }
});

test("the header name is not a link back to this page", () => {
  const header = home.slice(home.indexOf("<header"), home.indexOf("</header>"));
  assert.match(header, /<p class="word">/);
  assert.doesNotMatch(header, /<a[^>]*class="word"/);
});

test("homepage is dark and sized for a phone", () => {
  assert.match(home, /viewport-fit=cover/);
  assert.match(home, /href="\/home\.css"/);
  assert.match(css, /color-scheme:\s*dark/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /min-height:\s*44px/);
});

test("page motion stays off the drawings", () => {
  assert.match(home, /src="\/motion\.js"/);
  assert.match(css, /@keyframes unveil/);
  assert.match(css, /@keyframes rise/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /animation:\s*none/);
  for (const drawing of [".moon", ".well", ".dough", ".bird", ".pad", ".burst", ".handset", ".caret"]) {
    assert.doesNotMatch(css, new RegExp(`${drawing.replace(".", "\\.")}\\s*\\{[^}]*animation`), drawing);
  }
});

test("placebo stays off the dashboard", () => {
  assert.doesNotMatch(home, /placebo/i);
  assert.doesNotMatch(css, /placebo/i);
});

test("detail pages still come home through the shared stylesheet", () => {
  for (const page of ["ios16/index.html", "shellbox/index.html"]) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    assert.match(html, /href="\/"/);
    assert.match(html, /href="\/styles\.css"/);
  }
});
