export const CHARS_PER_WORD = 5;

export function wordsPerMinute(chars, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return (chars / CHARS_PER_WORD) / (elapsedMs / 60000);
}

export function accuracyRatio(correctPresses, incorrectPresses) {
  const correct = Number.isFinite(correctPresses) ? Math.max(0, correctPresses) : 0;
  const incorrect = Number.isFinite(incorrectPresses) ? Math.max(0, incorrectPresses) : 0;
  const total = correct + incorrect;
  if (total === 0) return 1;
  return correct / total;
}

export function countCorrect(target, typed) {
  const source = typeof target === "string" ? target : "";
  const attempt = typeof typed === "string" ? typed : "";
  const len = Math.min(source.length, attempt.length);
  let correct = 0;
  for (let i = 0; i < len; i += 1) {
    if (source[i] === attempt[i]) correct += 1;
  }
  return correct;
}

export function roundStat(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

export function percent(ratio) {
  if (!Number.isFinite(ratio)) return 0;
  const clamped = Math.min(1, Math.max(0, ratio));
  if (clamped >= 1) return 100;
  if (clamped <= 0) return 0;
  return Math.min(99, Math.max(1, Math.round(clamped * 100)));
}

export function formatClock(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / 1000);
}

export function recordBest(records, duration, wpmValue) {
  const safe = records && typeof records === "object" ? records : {};
  const key = String(duration);
  const previousRaw = Number(safe[key]);
  const previous = Number.isFinite(previousRaw) ? Math.round(previousRaw) : 0;
  const score = roundStat(wpmValue);
  const improved = score > previous;
  return {
    records: { ...safe, [key]: improved ? score : previous },
    improved,
    best: improved ? score : previous,
    previous,
  };
}

export function parseBests(raw) {
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return {};
    const records = {};
    for (const duration of [15, 30, 60]) {
      const value = Number(data[String(duration)]);
      if (Number.isFinite(value) && value > 0) records[String(duration)] = Math.round(value);
    }
    return records;
  } catch {
    return {};
  }
}

export function bestLabel(outcome) {
  if (!outcome?.improved) return "";
  if ((outcome.previous ?? 0) <= 0) return "First best";
  return "New best";
}

export function quipFor(wpmValue) {
  const wpm = roundStat(wpmValue);
  if (wpm >= 120) return "Unfair. The keyboard is just trying to keep up.";
  if (wpm >= 90) return "Fast enough to make the lamp flicker.";
  if (wpm >= 70) return "Quick hands. The page stayed with you.";
  if (wpm >= 50) return "A steady run. The words left on time.";
  if (wpm >= 30) return "Warming up. The next minute is faster.";
  return "The clock was patient. So was the page.";
}

export function hintFor(phase, best) {
  const mark = Number.isFinite(best) ? best : 0;
  if (phase === "running") return "Backspace fixes a letter. The clock keeps its count.";
  if (mark > 0) return `Best on this clock: ${mark} wpm. The first letter starts it.`;
  return "The first letter starts the clock.";
}
