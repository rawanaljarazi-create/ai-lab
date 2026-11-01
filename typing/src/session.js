import {
  accuracyRatio,
  countCorrect,
  wordsPerMinute,
} from "./metrics.js";
import { generateWords } from "./words.js";

export const DURATIONS = [15, 30, 60];
export const INITIAL_WORDS = 80;
export const REFILL_WORDS = 40;
export const MIN_AHEAD = 80;

export function createSession(options = {}) {
  const duration = options.duration ?? 30;
  if (!DURATIONS.includes(duration)) {
    throw new Error("duration must be 15, 30, or 60");
  }
  const rng = options.rng ?? Math.random;
  const refill = options.refill !== false;
  let words;
  if (options.words != null) {
    if (!Array.isArray(options.words) || options.words.length === 0) {
      throw new Error("words must be a non-empty list");
    }
    words = options.words.slice();
  } else {
    words = generateWords({ count: INITIAL_WORDS, rng });
  }
  return {
    phase: "ready",
    duration,
    words,
    target: words.join(" "),
    typed: "",
    correctPresses: 0,
    incorrectPresses: 0,
    startedAt: null,
    endedAt: null,
    rng,
    refill,
  };
}

export function restart(session, overrides = {}) {
  return createSession({
    duration: overrides.duration ?? session.duration,
    words: overrides.words,
    rng: overrides.rng ?? session.rng,
    refill: overrides.refill ?? session.refill,
  });
}

export function isTypeable(key) {
  return typeof key === "string" && key.length === 1 && key >= " " && key !== "\u007f";
}

export function press(session, key, now) {
  if (!Number.isFinite(now)) {
    return { accepted: false, finished: session.phase === "done" };
  }
  if (session.phase === "done") return { accepted: false, finished: true };
  if (session.phase === "running" && expire(session, now)) {
    return { accepted: false, finished: true };
  }

  if (key === "Backspace") {
    if (session.phase !== "running" || session.typed.length === 0) {
      return { accepted: false, finished: false };
    }
    session.typed = session.typed.slice(0, -1);
    return { accepted: true, finished: false };
  }

  if (!isTypeable(key)) return { accepted: false, finished: false };

  if (session.phase === "ready") {
    session.phase = "running";
    session.startedAt = now;
  }

  topUp(session);
  if (session.typed.length >= session.target.length) {
    finish(session, now);
    return { accepted: false, finished: true };
  }

  const expected = session.target[session.typed.length];
  session.typed += key;
  if (key === expected) session.correctPresses += 1;
  else session.incorrectPresses += 1;

  topUp(session);
  if (session.typed.length >= session.target.length) {
    finish(session, now);
    return { accepted: true, finished: true };
  }
  return { accepted: true, finished: false };
}

export function expire(session, now) {
  if (session.phase !== "running" || session.startedAt == null || !Number.isFinite(now)) {
    return false;
  }
  if (now - session.startedAt < session.duration * 1000) return false;
  finish(session, session.startedAt + session.duration * 1000);
  return true;
}

export function elapsedMs(session, now) {
  if (session.startedAt == null) return 0;
  const end = session.phase === "done" && session.endedAt != null ? session.endedAt : now;
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - session.startedAt);
}

export function summary(session, now) {
  const elapsed = elapsedMs(session, now);
  const correctChars = countCorrect(session.target, session.typed);
  const typedChars = session.typed.length;
  return {
    wpm: wordsPerMinute(correctChars, elapsed),
    rawWpm: wordsPerMinute(typedChars, elapsed),
    accuracy: accuracyRatio(session.correctPresses, session.incorrectPresses),
    correctChars,
    typedChars,
    correctPresses: session.correctPresses,
    incorrectPresses: session.incorrectPresses,
    elapsedMs: elapsed,
    remainingMs: Math.max(0, session.duration * 1000 - elapsed),
  };
}

export function paint(session) {
  const target = session.target;
  const typed = session.typed;
  const cursor = Math.min(typed.length, target.length);
  const wordStart = target.lastIndexOf(" ", Math.max(0, cursor - 1)) + 1;
  let wordEnd = target.indexOf(" ", cursor);
  if (wordEnd === -1) wordEnd = target.length;
  const cells = [];
  for (let i = 0; i < target.length; i += 1) {
    let state = "pending";
    if (i < typed.length) state = typed[i] === target[i] ? "correct" : "incorrect";
    else if (i === cursor && session.phase !== "done") state = "caret";
    let word = "future";
    if (i < wordStart) word = "past";
    else if (i < wordEnd) word = "current";
    cells.push({ char: target[i], state, word });
  }
  return cells;
}

export function glyph(char, state) {
  if (char === " " && state === "incorrect") return "·";
  return char;
}

export function topUp(session, minAhead = MIN_AHEAD) {
  if (session.phase === "done" || !session.refill) return false;
  if (session.target.length - session.typed.length >= minAhead) return false;
  const extra = generateWords({ count: REFILL_WORDS, rng: session.rng });
  session.words.push(...extra);
  session.target = session.words.join(" ");
  return true;
}

function finish(session, now) {
  session.phase = "done";
  session.endedAt = now;
}
