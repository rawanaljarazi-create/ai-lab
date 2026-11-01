export const WORDS = [
  "about", "above", "after", "again", "along", "also", "always", "among", "animal", "another",
  "answer", "around", "asked", "away", "back", "ball", "base", "became", "because", "been",
  "before", "began", "begin", "behind", "being", "below", "best", "better", "between", "bird",
  "black", "blue", "book", "both", "bring", "brown", "build", "built", "call", "came",
  "carry", "change", "children", "city", "close", "cold", "come", "could", "country", "dark",
  "day", "deep", "did", "different", "does", "done", "door", "down", "draw", "dream",
  "each", "early", "earth", "easy", "edge", "enough", "even", "ever", "every", "face",
  "family", "far", "fast", "feel", "feet", "field", "find", "fine", "fire", "first",
  "fish", "five", "floor", "follow", "food", "form", "found", "four", "from", "front",
  "full", "game", "gave", "girl", "give", "gold", "gone", "good", "great", "green",
  "ground", "group", "grow", "half", "hand", "hard", "have", "head", "hear", "heart",
  "help", "here", "high", "hill", "hold", "home", "hope", "horse", "house", "idea",
  "into", "just", "keep", "kind", "king", "knew", "know", "land", "large", "last",
  "late", "learn", "leave", "left", "letter", "life", "light", "like", "line", "little",
  "live", "long", "look", "love", "made", "make", "many", "mark", "mean", "might",
  "mile", "mind", "more", "morning", "most", "mother", "mountain", "move", "much", "must",
  "name", "near", "need", "never", "next", "night", "once", "only", "open", "other",
  "over", "page", "paper", "part", "people", "place", "plant", "play", "point", "put",
  "quick", "quiet", "rain", "read", "ready", "real", "right", "river", "road", "rock",
  "room", "round", "said", "same", "school", "sea", "second", "see", "seem", "sentence",
  "set", "several", "ship", "should", "show", "side", "simple", "since", "small", "sound",
  "spell", "start", "still", "story", "study", "such", "sun", "take", "talk", "tell",
  "than", "that", "their", "them", "then", "there", "these", "thing", "think", "this",
  "those", "thought", "three", "through", "time", "today", "together", "told", "too", "took",
  "tree", "true", "turn", "under", "until", "upon", "very", "walk", "want", "warm",
  "watch", "water", "wave", "well", "went", "were", "what", "when", "where", "which",
  "while", "white", "who", "whole", "why", "will", "wind", "window", "with", "word",
  "work", "world", "would", "write", "year", "young", "your",
];

export function createRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateWords({ count, rng, bank = WORDS } = {}) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("count must be a positive integer");
  }
  if (typeof rng !== "function") throw new Error("rng is required");
  if (!Array.isArray(bank) || bank.length === 0) throw new Error("word bank is empty");
  const words = [];
  for (let i = 0; i < count; i += 1) {
    const index = Math.min(bank.length - 1, Math.floor(rng() * bank.length));
    words.push(bank[index]);
  }
  return words;
}
