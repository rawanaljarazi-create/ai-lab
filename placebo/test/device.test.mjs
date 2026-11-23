import assert from "node:assert/strict";
import test from "node:test";
import { deviceLabel, parseDevice } from "../src/device.js";

const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const ipad =
  "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const ipod =
  "Mozilla/5.0 (iPod touch; CPU iPhone OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1";
const mac =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";
const linux =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

test("an iPhone user agent keeps the model and the dotted iOS version", () => {
  assert.deepEqual(parseDevice(iphone), { model: "iPhone", version: "18.1.1" });
  assert.equal(deviceLabel(iphone).line, "iPhone · iOS 18.1.1");
});

test("an iPad user agent is not labeled as an iPhone", () => {
  assert.deepEqual(parseDevice(ipad), { model: "iPad", version: "16.6" });
});

test("an iPod user agent wins over the iPhone OS token", () => {
  assert.deepEqual(parseDevice(ipod), { model: "iPod", version: "12.5.7" });
});

test("a two-part iOS version does not grow a trailing zero", () => {
  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X)";
  assert.equal(parseDevice(ua).version, "18.2");
});

test("desktop user agents fall back to iPhone with no invented version", () => {
  assert.deepEqual(parseDevice(mac), { model: "iPhone", version: "" });
  assert.deepEqual(parseDevice(linux), { model: "iPhone", version: "" });
  assert.deepEqual(parseDevice(""), { model: "iPhone", version: "" });
  assert.equal(deviceLabel(mac).line, "iPhone");
});
