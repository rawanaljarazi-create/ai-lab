import assert from "node:assert/strict";
import test from "node:test";
import { detectClient, formFromClientHints } from "../src/device.js";

test("the low-entropy mobile client hint chooses phone or pc", () => {
  assert.deepEqual(formFromClientHints({ mobile: true }), { phone: true, source: "ua-ch" });
  assert.deepEqual(formFromClientHints({ mobile: false }), { phone: false, source: "ua-ch" });
  assert.equal(formFromClientHints(undefined), null);
});

test("the high-entropy mobile hint wins when the browser provides it", () => {
  assert.deepEqual(formFromClientHints({ mobile: false }, { mobile: true, platform: "Android" }), {
    phone: true,
    source: "ua-ch",
  });
  assert.deepEqual(formFromClientHints({ mobile: true }, { mobile: false, platform: "Linux" }), {
    phone: false,
    source: "ua-ch",
  });
});

test("a browser with client hints does not use the touch fallback", async () => {
  const client = await detectClient(
    { userAgentData: { mobile: false }, maxTouchPoints: 5 },
    { matchMedia: () => ({ matches: true }) }
  );
  assert.deepEqual(client, { phone: false, source: "ua-ch" });
});

test("phones without client hints still get touch controls", async () => {
  const client = await detectClient(
    { maxTouchPoints: 5 },
    { matchMedia: () => ({ matches: true }) }
  );
  assert.deepEqual(client, { phone: true, source: "fallback" });
});
