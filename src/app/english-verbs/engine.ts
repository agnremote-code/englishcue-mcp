// EnglishCue verb engine: the forms and every tense of an English verb.
// American spelling first, British variants alongside. Spelling rules are
// deterministic; the facts they cannot know (irregular forms, whether the
// final consonant doubles, how the endings sound) come from the verb record,
// which scripts/english-verbs/build.mjs computes and verifies against the CMU
// Pronouncing Dictionary and an independent conjugator before any page ships.
import { britishVariants, irregularVerbs, secondMeaning } from "./irregular";

export type VerbRecord = {
  /** Base form, American spelling. */
  v: string;
  /** British spelling of the base when it differs (organise). */
  uk?: string;
  /** Final consonant doubles: 1 in American and British English (stop), 2 only in British English (travel). */
  dbl?: 1 | 2;
  /** How the -s ending sounds: /s/, /z/ or /ɪz/. */
  s: "s" | "z" | "iz";
  /** How the regular -ed ending sounds (regular verbs only): /t/, /d/ or /ɪd/. */
  ed?: "t" | "d" | "id";
  /** 1 = stative (not normally used in continuous forms), 2 = stative in its main meaning but also used in continuous forms. */
  st?: 1 | 2;
  /** 1 = takes an object (has a passive), 0 = never takes an object. */
  tr: 0 | 1;
  /** Rank in the list of common verbs (1 = most common). */
  rank: number;
};

export type VerbForms = {
  base: string; third: string; past: string[]; pp: string[]; ing: string;
  irregular: boolean;
  /** British forms that differ from the American ones. */
  uk?: { base?: string; third?: string; past?: string[]; pp?: string[]; ing?: string };
  /** Plain-language spelling notes for this verb's regular forms. */
  rules: string[];
  /** A second meaning with different past forms (lie → lied, hang → hanged). */
  also?: { meaning: string; past: string; pp: string };
};

const VOWEL = /[aeiou]/;

export function thirdPerson(base: string, dbl?: 1 | 2): string {
  if (base === "be") return "is";
  if (base === "have") return "has";
  if (dbl === 1 && /[aeiou]z$/.test(base)) return `${base}zes`;
  if (/(s|x|z|ch|sh)$/.test(base)) return `${base}es`;
  if (/[^aeiou]o$/.test(base)) return `${base}es`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
  return `${base}s`;
}

export function ingForm(base: string, double: boolean): string {
  if (base === "be") return "being";
  if (/ie$/.test(base)) return `${base.slice(0, -2)}ying`;
  if (/(ee|ye|oe)$/.test(base)) return `${base}ing`;
  if (/e$/.test(base) && base.length > 2) return `${base.slice(0, -1)}ing`;
  if (/[^aeiou]ic$/.test(base)) return `${base}king`;
  if (double) return `${base}${base.at(-1)}ing`;
  return `${base}ing`;
}

export function edForm(base: string, double: boolean): string {
  if (/e$/.test(base)) return `${base}d`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ied`;
  if (/[^aeiou]ic$/.test(base)) return `${base}ked`;
  if (double) return `${base}${base.at(-1)}ed`;
  return `${base}ed`;
}

function spellingRules(record: VerbRecord, irregular: boolean): string[] {
  const { v } = record;
  const rules: string[] = [];
  const third = thirdPerson(v, record.dbl);
  if (third !== `${v}s` && v !== "be" && v !== "have") {
    if (/ies$/.test(third)) rules.push(`Consonant + y: change y to i and add -es (${v} → ${third}).`);
    else rules.push(`Add -es after ${/o$/.test(v) ? "a consonant + o" : "s, x, z, ch or sh"} (${v} → ${third}).`);
  }
  const ing = ingForm(v, record.dbl === 1);
  if (/ie$/.test(v)) rules.push(`Change -ie to -y before -ing (${v} → ${ing}).`);
  else if (/(ee|ye|oe)$/.test(v)) rules.push(`Keep the final e before -ing (${v} → ${ing}).`);
  else if (/e$/.test(v) && v !== "be") rules.push(`Drop the final e before -ing (${v} → ${ing}).`);
  else if (/[^aeiou]ic$/.test(v)) rules.push(`Add k after a final c (${v} → ${ing}).`);
  if (record.dbl === 1) rules.push(`Double the final consonant before -ing${irregular ? "" : " and -ed"}: the last syllable is stressed and ends in one vowel + one consonant (${v} → ${ing}${irregular ? "" : `, ${edForm(v, true)}`}).`);
  if (record.dbl === 2) rules.push(`American English keeps one l (${edForm(v, false)}, ${ingForm(v, false)}); British English doubles it (${edForm(v, true)}, ${ingForm(v, true)}).`);
  if (!irregular && /[^aeiou]y$/.test(v)) rules.push(`Consonant + y: change y to i before -ed (${v} → ${edForm(v, false)}), but keep it before -ing (${ing}).`);
  if (!irregular && /[aeiou]y$/.test(v)) rules.push(`Vowel + y: just add -s, -ed and -ing (${v}s, ${v}ed, ${v}ing).`);
  return rules;
}

export function verbForms(record: VerbRecord): VerbForms {
  const { v } = record;
  const irr = irregularVerbs[v];
  const usDouble = record.dbl === 1;
  const forms: VerbForms = {
    base: v, third: thirdPerson(v, record.dbl), ing: ingForm(v, usDouble),
    past: irr ? irr.past : [edForm(v, usDouble)], pp: irr ? irr.pp : [edForm(v, usDouble)],
    irregular: Boolean(irr), rules: spellingRules(record, Boolean(irr)),
  };
  const uk: NonNullable<VerbForms["uk"]> = {};
  if (record.uk) {
    // enrol, fulfil: British spelling ends in one l after a stressed vowel, so it doubles.
    const ukDouble = /[aeiou]l$/.test(record.uk) && v.endsWith("ll");
    uk.base = record.uk; uk.third = thirdPerson(record.uk); uk.ing = ingForm(record.uk, ukDouble);
    if (!irr) uk.past = uk.pp = [edForm(record.uk, ukDouble)];
  }
  if (record.dbl === 2) {
    uk.ing = ingForm(v, true);
    if (!irr) uk.past = uk.pp = [edForm(v, true)];
  }
  if (v === "get") { uk.pp = ["got"]; }
  const british = britishVariants[v];
  if (british) {
    uk.past = [...new Set([...(uk.past ?? forms.past), ...british.past])];
    uk.pp = [...new Set([...(uk.pp ?? forms.pp), ...british.pp])];
  }
  if (Object.keys(uk).length) forms.uk = uk;
  if (secondMeaning[v]) forms.also = secondMeaning[v];
  return forms;
}

export const isVowelStart = (word: string) => VOWEL.test(word[0] ?? "");

// ---------------------------------------------------------------- tenses

export const PERSONS = ["I", "you", "he/she/it", "we", "they"] as const;
type Person = (typeof PERSONS)[number];
const BE_PRESENT: Record<Person, string> = { I: "am", you: "are", "he/she/it": "is", we: "are", they: "are" };
const BE_PRESENT_NEG: Record<Person, string> = { I: "am not", you: "aren't", "he/she/it": "isn't", we: "aren't", they: "aren't" };
const BE_PAST = (p: Person) => (p === "I" || p === "he/she/it" ? "was" : "were");
const HAVE = (p: Person) => (p === "he/she/it" ? "has" : "have");
const DO = (p: Person) => (p === "he/she/it" ? "does" : "do");

export type TenseRow = [person: string, form: string];
export type Tense = { id: string; name: string; use: string; rows: TenseRow[]; negative?: TenseRow[]; question?: TenseRow[] };

const rows = (fn: (p: Person) => string): TenseRow[] => PERSONS.map((p) => [p, fn(p)]);

/** Every tense of the verb in the active voice; continuous tenses are left out of stative verbs. */
export function conjugate(record: VerbRecord): { active: Tense[]; passive: Tense[]; imperative: { affirmative: string; negative: string } } {
  const f = verbForms(record);
  const isBe = f.base === "be";
  const past = f.past[0];
  const pp = f.pp[0];
  const ing = f.ing;
  const continuous = record.st !== 1;
  // "be being" works in the present and past continuous (you're being silly); the longer continuous forms are not used.
  const longContinuous = continuous && !isBe;
  const active: Tense[] = [];

  active.push({
    id: "present-simple", name: "Present simple", use: "habits, facts and routines",
    rows: rows((p) => (isBe ? BE_PRESENT[p] : p === "he/she/it" ? f.third : f.base)),
    negative: rows((p) => (isBe ? BE_PRESENT_NEG[p] : `${DO(p) === "does" ? "doesn't" : "don't"} ${f.base}`)),
    question: rows((p) => capitalize(isBe ? `${BE_PRESENT[p]} ${p}…?` : `${DO(p)} ${p} ${f.base}…?`)),
  });
  if (continuous) active.push({ id: "present-continuous", name: "Present continuous", use: "actions in progress now and arrangements", rows: rows((p) => `${BE_PRESENT[p]} ${ing}`) });
  active.push({
    id: "past-simple", name: "Past simple", use: "finished actions at a past time",
    rows: rows((p) => (isBe ? BE_PAST(p) : f.past.join(" / "))),
    negative: rows((p) => (isBe ? `${BE_PAST(p)}n't` : `didn't ${f.base}`)),
    question: rows((p) => capitalize(isBe ? `${BE_PAST(p)} ${p}…?` : `did ${p} ${f.base}…?`)),
  });
  if (continuous) active.push({ id: "past-continuous", name: "Past continuous", use: "an action in progress at a past moment", rows: rows((p) => `${BE_PAST(p)} ${ing}`) });
  active.push({
    id: "present-perfect", name: "Present perfect", use: "experiences and past actions connected to now",
    rows: rows((p) => `${HAVE(p)} ${f.pp.join(" / ")}`),
    negative: rows((p) => `${HAVE(p)}n't ${pp}`),
    question: rows((p) => capitalize(`${HAVE(p)} ${p} ${pp}…?`)),
  });
  if (longContinuous) active.push({ id: "present-perfect-continuous", name: "Present perfect continuous", use: "an activity from the past until now", rows: rows((p) => `${HAVE(p)} been ${ing}`) });
  active.push({ id: "past-perfect", name: "Past perfect", use: "an action before another past action", rows: rows(() => `had ${pp}`) });
  if (longContinuous) active.push({ id: "past-perfect-continuous", name: "Past perfect continuous", use: "an activity up to a past moment", rows: rows(() => `had been ${ing}`) });
  active.push({
    id: "future-will", name: "Future simple (will)", use: "predictions, promises and instant decisions",
    rows: rows(() => `will ${f.base}`), negative: rows(() => `won't ${f.base}`), question: rows((p) => `Will ${p} ${f.base}…?`),
  });
  active.push({ id: "going-to", name: "Be going to", use: "plans and predictions from evidence", rows: rows((p) => `${BE_PRESENT[p]} going to ${f.base}`) });
  if (longContinuous) active.push({ id: "future-continuous", name: "Future continuous", use: "an action in progress at a future moment", rows: rows(() => `will be ${ing}`) });
  active.push({ id: "future-perfect", name: "Future perfect", use: "an action finished before a future moment", rows: rows(() => `will have ${pp}`) });
  if (longContinuous) active.push({ id: "future-perfect-continuous", name: "Future perfect continuous", use: "duration up to a future moment", rows: rows(() => `will have been ${ing}`) });
  active.push({ id: "conditional", name: "Conditional (would)", use: "imagined situations and polite requests", rows: rows(() => `would ${f.base}`) });
  active.push({ id: "conditional-perfect", name: "Conditional perfect", use: "imagined past situations", rows: rows(() => `would have ${pp}`) });

  const passive: Tense[] = [];
  if (record.tr === 1 && !isBe) {
    const ppForm = f.pp.at(-1) === "got" && f.base === "get" ? "gotten / got" : f.pp.join(" / ");
    passive.push({ id: "passive-present", name: "Present simple passive", use: "", rows: rows((p) => `${BE_PRESENT[p]} ${ppForm}`) });
    passive.push({ id: "passive-past", name: "Past simple passive", use: "", rows: rows((p) => `${BE_PAST(p)} ${ppForm}`) });
    passive.push({ id: "passive-present-perfect", name: "Present perfect passive", use: "", rows: rows((p) => `${HAVE(p)} been ${ppForm}`) });
    passive.push({ id: "passive-will", name: "Future passive (will)", use: "", rows: rows(() => `will be ${ppForm}`) });
  }
  const imperative = isBe ? { affirmative: "Be…!", negative: "Don't be…!" } : { affirmative: `${capitalize(f.base)}!`, negative: `Don't ${f.base}!` };
  return { active, passive, imperative };
}

export const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Every written form of the verb, American and British, for checking answers. */
export function allForms(record: VerbRecord): Set<string> {
  const f = verbForms(record);
  const set = new Set<string>([f.base, f.third, f.ing, ...f.past, ...f.pp]);
  if (f.uk) for (const value of Object.values(f.uk)) for (const item of [value].flat()) if (item) set.add(item);
  if (f.also) set.add(f.also.past);
  if (f.base === "be") for (const item of ["am", "is", "are", "was", "were", "been", "being"]) set.add(item);
  return set;
}
