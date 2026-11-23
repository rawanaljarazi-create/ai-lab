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

test("detail pages still come home through the shared stylesheet", () => {
  for (const page of ["ios16/index.html", "shellbox/index.html"]) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    assert.match(html, /href="\/"/);
    assert.match(html, /href="\/styles\.css"/);
  }
});
