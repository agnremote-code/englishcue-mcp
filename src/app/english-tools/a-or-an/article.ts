// "A" or "an": the choice depends on the first sound, not the first letter.
// Pure rules + exception lists, shared by the checker and its tests.
/** Starts with a "you" sound (/j/): unit, university, use, usual, European, ewe. */
function youSound(lower: string): boolean {
  if (/^(eu|ewe)/.test(lower)) return true;
  if (/^(uber|udon|umami|upon|unanim)/.test(lower)) return lower.startsWith("unanim");
  // un- is usually a prefix (unhappy, unaware, unusual); only uni- words like unit, union, unique, university say "you",
  // and not uni- + prefix words (uninformed, unimportant, unidentified).
  if (lower.startsWith("un")) return /^uni/.test(lower) && !/^uni(n|mp|d)/.test(lower);
  // u + one consonant + vowel: use, usual, utensil, urine, ukulele, utility, Utah.
  return /^u[bcdfgklmprstvz][aeiouy]/.test(lower);
}
const SILENT_H = /^(hour|honest|honor|honour|heir|herb)/;
const W_SOUND = /^(one|once)/;
const AN_LETTERS = new Set(["a", "e", "f", "h", "i", "l", "m", "n", "o", "r", "s", "x"]);

export type ArticleResult = { article: "a" | "an"; reason: string };

/** Spoken English digits that start with a vowel sound: 8, 11, 18, 80–89, 800… */
function numberArticle(raw: string): ArticleResult {
  const n = raw.replace(/,/g, "").match(/^\d+/)?.[0] ?? "";
  const vowel = /^8/.test(n) || /^(11|18)$/.test(n) || /^(11|18)\d{3}$/.test(n) || /^(11|18)\d{6}$/.test(n);
  return vowel
    ? { article: "an", reason: `Said aloud, ${raw} starts with a vowel sound (“eight…”, “eleven…”, “eighteen…”).` }
    : { article: "a", reason: `Said aloud, ${raw} starts with a consonant sound.` };
}

export function chooseArticle(input: string): ArticleResult | null {
  const word = input.trim().replace(/^(a|an)\s+/i, "").split(/\s+/)[0]?.replace(/[^\p{L}\p{N}'’.-]/gu, "") ?? "";
  if (!word) return null;
  if (/^\d/.test(word)) return numberArticle(word);
  const lower = word.toLowerCase();
  // Abbreviations said letter by letter: FBI, MBA, NGO, UFO, X-ray.
  if (/^[A-Z]{2,5}s?$/.test(word) && !/[AEIOU].*[AEIOU]/.test(word.slice(1)) || /^[A-Z]-/.test(word)) {
    const first = lower[0];
    if (first === "u") return { article: "a", reason: `${word} is said letter by letter, and U sounds like “you” (a consonant sound).` };
    return AN_LETTERS.has(first)
      ? { article: "an", reason: `${word} is said letter by letter, and the name of the letter ${word[0]} starts with a vowel sound (“${letterName(first)}”).` }
      : { article: "a", reason: `${word} is said letter by letter, and the name of the letter ${word[0]} starts with a consonant sound (“${letterName(first)}”).` };
  }
  if (SILENT_H.test(lower)) return { article: "an", reason: `The h in “${word}” is silent, so the word starts with a vowel sound.${lower.startsWith("herb") ? " (In British English the h is pronounced: a herb.)" : ""}` };
  if (W_SOUND.test(lower)) return { article: "a", reason: `“${word}” starts with a w sound (“wun”), which is a consonant sound.` };
  if (youSound(lower)) return { article: "a", reason: `“${word}” starts with a “you” sound (/j/), which is a consonant sound, even though u or eu is a vowel letter.` };
  if (/^[aeiou]/.test(lower)) return { article: "an", reason: `“${word}” starts with a vowel sound.` };
  if (lower.startsWith("h")) return { article: "a", reason: `The h in “${word}” is pronounced, so it starts with a consonant sound. (Older British style sometimes says “an historic”, but “a historic” is standard today.)` };
  return { article: "a", reason: `“${word}” starts with a consonant sound.` };
}

function letterName(letter: string): string {
  const names: Record<string, string> = { a: "ay", b: "bee", c: "see", d: "dee", e: "ee", f: "ef", g: "jee", h: "aitch", i: "eye", j: "jay", k: "kay", l: "el", m: "em", n: "en", o: "oh", p: "pee", q: "cue", r: "ar", s: "es", t: "tee", u: "you", v: "vee", w: "double-u", x: "ex", y: "why", z: "zee" };
  return names[letter] ?? letter;
}
