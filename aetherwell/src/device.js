export function formFromClientHints(low, high = null) {
  if (!low || typeof low.mobile !== "boolean") return null;
  const phone = typeof high?.mobile === "boolean" ? high.mobile : low.mobile;
  return { phone, source: "ua-ch" };
}

export async function detectClient(nav = navigator, win = window) {
  const hints = nav.userAgentData;
  if (hints && typeof hints.mobile === "boolean") {
    let high = null;
    if (typeof hints.getHighEntropyValues === "function") {
      try {
        high = await Promise.race([
          hints.getHighEntropyValues(["mobile", "platform", "model"]),
          new Promise((resolve) => setTimeout(() => resolve(null), 400)),
        ]);
      } catch {
        high = null;
      }
    }
    return formFromClientHints(hints, high);
  }
  const coarse = win.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  return { phone: coarse && (nav.maxTouchPoints || 0) > 0, source: "fallback" };
}
