/**
 * Public, read-only MCP server (Model Context Protocol, Streamable HTTP,
 * stateless JSON responses) at https://englishcue.app/mcp.
 *
 * AI assistants (Claude, ChatGPT, Cursor…) connect to it and call EnglishCue's
 * free teaching data: verb conjugation, a/an, collocations, confusing words,
 * phrasal verbs, idioms, vocabulary, level tests and a search over every public
 * page. Every answer links back to the matching englishcue.app page.
 *
 * No auth, no state, no writes: it only reads the bundled indexes and the
 * static page data in public/_seo-data (through the ASSETS binding).
 * Docs page: app/english-tools/mcp-server/page.tsx.
 */
import { allVerbs, verbBySlug, verbPage } from "../app/english-verbs/data";
import { conjugate, verbForms } from "../app/english-verbs/engine";
import { chooseArticle } from "../app/english-tools/a-or-an/article";
import { collocationBySlug, collocationEntries, collocationPage, type CollocationContent } from "../app/collocations/data";
import { confusingBySlug, confusingPairs, confusingPage, pairLabel, type ConfusingContent } from "../app/confusing-words/data";
import { phrasalByText, phrasalBySlug, phrasalPage, type PhrasalContent } from "../app/phrasal-verbs/data";
import { idiomBySlug, idiomByText, idioms, idiomPage, type IdiomContent } from "../app/idioms/data";
import { vocabularyPageBySlug, vocabularyPages, vocabularyPagePath, type VocabularyContent } from "../app/english-vocabulary/data";
import { levelTestBySlug, levelTests, levelTestPage, type LevelTestContent } from "../app/english-level-test/data";

export const MCP_PATH = "/mcp";
const ORIGIN = "https://englishcue.app";
const SERVER_INFO = { name: "englishcue", title: "EnglishCue", version: "1.0.0" };
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS = "EnglishCue (englishcue.app) has ready-to-teach English lessons for online English teachers. These tools return free reference material for teaching English: conjugations, a/an, collocations, commonly confused words, phrasal verbs, idioms, topic vocabulary, level tests by profession and a search over every free page. Each result includes the englishcue.app link; share it with the user so they can open the full page, quiz or printable.";

type Assets = { fetch(request: Request): Promise<Response> };
type Json = Record<string, unknown>;
type ToolResult = { text: string; error?: boolean };

const url = (path: string) => `${ORIGIN}${path}`;
const norm = (text: unknown) => String(text ?? "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
const slug = (text: unknown) => norm(text).replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const unmark = (text: string) => text.replace(/\[([^\]]+)\]/g, "$1");
const footer = (path: string, label = "Full page") => `\n\n${label}: ${url(path)}`;

async function readJson<T>(assets: Assets, path: string): Promise<T | undefined> {
  const response = await assets.fetch(new Request(`https://assets.local${path}`));
  return response.ok ? ((await response.json()) as T) : undefined;
}

// ---------------------------------------------------------------- search

type Doc = { title: string; url: string; text: string; section: string };
let docs: Promise<Doc[]> | undefined;
function searchIndex(assets: Assets): Promise<Doc[]> {
  docs ??= (async () => {
    const response = await assets.fetch(new Request("https://assets.local/llms.txt"));
    const body = response.ok ? await response.text() : "";
    const out: Doc[] = [];
    let section = "";
    for (const line of body.split("\n")) {
      if (line.startsWith("## ")) section = line.slice(3).trim();
      const m = /^- \[([^\]]+)\]\((https:\/\/englishcue\.app[^)]*)\):?\s*(.*)$/.exec(line);
      if (m && section !== "Optional") out.push({ title: m[1], url: m[2], text: m[3], section });
    }
    for (const verb of allVerbs) if (verbBySlug.has(verb.v)) out.push({ title: `${verb.v} conjugation`, url: url(verbPage(verb)), text: `Conjugation of the verb ${verb.v}: all tenses, forms and examples.`, section: "English verbs" });
    return out;
  })();
  docs.catch(() => { docs = undefined; });
  return docs;
}

async function search(assets: Assets, args: Json): Promise<ToolResult> {
  const query = norm(args.query);
  if (!query) return { text: "Please give a search query, for example “present perfect worksheet” or “job interview questions”.", error: true };
  const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20);
  const terms = query.split(" ").filter((t) => t.length > 1);
  const scored = (await searchIndex(assets)).map((doc) => {
    const title = norm(doc.title), body = `${norm(doc.text)} ${norm(doc.section)}`;
    let score = title === query ? 50 : title.includes(query) ? 20 : body.includes(query) ? 8 : 0;
    for (const t of terms) score += (title.includes(t) ? 4 : 0) + (body.includes(t) ? 1 : 0);
    if (terms.length && !terms.every((t) => title.includes(t) || body.includes(t))) score -= 6;
    return { doc, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  if (!scored.length) return { text: `No EnglishCue page matches “${query}”. Browse everything at ${url("/llms.txt")}.` };
  return { text: `EnglishCue pages for “${query}”:\n\n${scored.map(({ doc }) => `- ${doc.title} (${doc.section})\n  ${doc.url}${doc.text ? `\n  ${doc.text.slice(0, 220)}` : ""}`).join("\n")}` };
}

// ---------------------------------------------------------------- tools

function conjugateVerb(args: Json): ToolResult {
  const verb = norm(args.verb).replace(/^to /, "");
  const record = allVerbs.find((v) => v.v === verb) ?? allVerbs.find((v) => { const f = verbForms(v); return [f.third, f.ing, ...f.past, ...f.pp].includes(verb); });
  if (!record) return { text: `“${verb}” is not in the EnglishCue verb list (1,000+ verbs). Try the base form, for example “go” or “write”. Conjugator: ${url("/english-tools/verb-conjugator")}`, error: true };
  const f = verbForms(record);
  const c = conjugate(record);
  const tenses = c.active.map((t) => `${t.name}: ${t.rows.map(([p, form]) => `${p} ${form}`).join(", ")}${t.negative ? ` | negative: ${t.negative[2]?.[0]} ${t.negative[2]?.[1]}` : ""}${t.question ? ` | question: ${t.question[2]?.[1]}` : ""}`);
  const path = verbBySlug.has(record.v) ? verbPage(record) : "/english-tools/verb-conjugator";
  return { text: `${record.v} (${f.irregular ? "irregular" : "regular"} verb)\nBase: ${f.base} · 3rd person: ${f.third} · Past simple: ${f.past.join(" / ")} · Past participle: ${f.pp.join(" / ")} · -ing: ${f.ing}${f.uk ? `\nBritish forms: ${Object.entries(f.uk).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join("/") : v}`).join(", ")}` : ""}${f.also ? `\nAlso: ${f.also.meaning} → ${f.also.past}, ${f.also.pp}` : ""}\n\n${tenses.join("\n")}\n\nImperative: ${c.imperative.affirmative} / ${c.imperative.negative}${footer(path, "Full conjugation with examples")}` };
}

function aOrAn(args: Json): ToolResult {
  const phrase = String(args.phrase ?? "").trim();
  const result = phrase ? chooseArticle(phrase) : null;
  if (!result) return { text: "Please give a word or phrase, for example “hour”, “university” or “MBA”.", error: true };
  return { text: `${result.article} ${phrase}\n${result.reason}${footer("/english-tools/a-or-an", "A or an checker")}` };
}

async function collocations(assets: Assets, args: Json): Promise<ToolResult> {
  const word = slug(args.word);
  const entry = collocationBySlug.get(word);
  if (!entry) return { text: `No collocation page for “${word}” yet. Available words: ${collocationEntries.map((e) => e.h).join(", ")}.${footer("/collocations", "All collocations")}`, error: true };
  const content = await readJson<CollocationContent>(assets, `/_seo-data/collocations/${entry.s}.json`);
  if (!content) return { text: "This page is temporarily unavailable.", error: true };
  const groups = content.groups.map((g) => `${g.name}:\n${g.items.map((x) => `- ${x.c}: ${x.m}. “${x.e}”`).join("\n")}`).join("\n\n");
  const mistakes = content.mistakes.length ? `\n\nCommon mistakes:\n${content.mistakes.map(([w, r]) => `- Not “${w}” but “${r}”`).join("\n")}` : "";
  return { text: `Collocations with “${entry.h}” (${entry.k}, ${entry.l}, ${entry.n} collocations)\n${content.intro}\n\n${groups}${mistakes}${footer(collocationPage(entry), "Full page with a quiz")}` };
}

async function confusingWords(assets: Assets, args: Json): Promise<ToolResult> {
  const words = (Array.isArray(args.words) ? args.words : String(args.words ?? "").split(/,|\bvs\.?\b|\bor\b|\//)).map(norm).filter(Boolean);
  if (!words.length) return { text: "Please give the words to compare, for example [\"affect\", \"effect\"].", error: true };
  const ranked = confusingPairs.map((p) => ({ p, hits: words.filter((w) => p.w.includes(w)).length })).filter((x) => x.hits).sort((a, b) => b.hits - a.hits);
  const entry = ranked[0]?.p;
  if (!entry) return { text: `No page compares ${words.join(" and ")} yet. All pairs: ${url("/confusing-words")}`, error: true };
  const content = await readJson<ConfusingContent>(assets, `/_seo-data/confusing-words/${entry.s}.json`);
  if (!content) return { text: "This page is temporarily unavailable.", error: true };
  const defs = content.defs.map((d) => `${d.word} (${d.pos}): ${d.meaning}\n  e.g. ${d.examples.join(" / ")}`).join("\n");
  const quiz = content.quiz.slice(0, 6).map((q) => `- ${q.replace(/\[[^\]]+\]/, "_____")} → ${/\[([^\]]+)\]/.exec(q)?.[1]}`).join("\n");
  return { text: `${pairLabel(entry)} (level ${entry.l})\n\n${defs}\n\nTip: ${content.tip}${content.notes.length ? `\nNote: ${content.notes.join(" ")}` : ""}\n\nPractice (answers after the arrow):\n${quiz}${footer(confusingPage(entry), "Full page with an interactive quiz")}` };
}

async function phrasalVerb(assets: Assets, args: Json): Promise<ToolResult> {
  const text = norm(args.phrasal_verb);
  const entry = phrasalByText.get(text) ?? phrasalBySlug.get(slug(text));
  if (!entry) return { text: `“${text}” is not in the EnglishCue phrasal verb list yet. Browse all: ${url("/phrasal-verbs")}`, error: true };
  const content = await readJson<PhrasalContent>(assets, `/_seo-data/phrasal-verbs/${entry.s}.json`);
  if (!content) return { text: "This page is temporarily unavailable.", error: true };
  const kinds = { i: "intransitive", sep: "separable", insep: "inseparable" } as const;
  const meanings = content.meanings.map((m, i) => `${i + 1}. ${m.meaning} (${kinds[m.type]}${m.synonyms.length ? `; similar: ${m.synonyms.join(", ")}` : ""})\n   ${m.examples.map(unmark).join(" / ")}`).join("\n");
  return { text: `${entry.pv} (level ${entry.l})\n${meanings}${content.notes.length ? `\n\nNotes: ${content.notes.join(" ")}` : ""}${content.opposites.length ? `\nOpposites: ${content.opposites.join(", ")}` : ""}${footer(phrasalPage(entry), "Full page with exercises")}` };
}

async function idiom(assets: Assets, args: Json): Promise<ToolResult> {
  const text = norm(args.idiom);
  const entry = idiomByText.get(text) ?? idiomBySlug.get(slug(text)) ?? idioms.find((i) => i.i.toLowerCase().includes(text) && text.length > 3);
  if (!entry) return { text: `“${text}” is not in the EnglishCue idiom list yet. Browse all: ${url("/idioms")}`, error: true };
  const content = await readJson<IdiomContent>(assets, `/_seo-data/idioms/${entry.s}.json`);
  return { text: `${entry.i}\nMeaning: ${entry.m}\nLevel: ${entry.l} · Register: ${entry.r}${content ? `\nExamples: ${content.examples.map(unmark).join(" / ")}${content.notes.length ? `\nNotes: ${content.notes.join(" ")}` : ""}${content.similar.length ? `\nSimilar: ${content.similar.join(", ")}` : ""}` : ""}${footer(idiomPage(entry))}` };
}

async function vocabulary(assets: Assets, args: Json): Promise<ToolResult> {
  const topic = norm(args.topic), level = norm(args.level).toUpperCase();
  const exact = vocabularyPageBySlug.get(String(args.slug ?? ""));
  const matches = exact ? [exact, ...vocabularyPages.filter((p) => p.topic === exact.topic && p !== exact)] : vocabularyPages.filter((p) => (norm(p.topic.title).includes(topic) || p.slug.includes(slug(topic))) && (!level || p.level === level));
  const page = matches[0];
  if (!page) {
    const topics = [...new Set(vocabularyPages.map((p) => p.topic.title))];
    return { text: `No vocabulary page for “${topic}”${level ? ` at ${level}` : ""}. Topics: ${topics.join(", ")}. Levels: A1–C1.${footer("/english-vocabulary", "All vocabulary")}`, error: true };
  }
  const content = await readJson<VocabularyContent>(assets, `/_seo-data/vocabulary/${page.slug}.json`);
  if (!content) return { text: "This page is temporarily unavailable.", error: true };
  const other = matches.length > 1 ? `\nOther levels: ${matches.slice(1).map((p) => `${p.level} ${url(vocabularyPagePath(p))}`).join(", ")}` : "";
  return { text: `${page.topic.title} vocabulary, ${page.level} (${content.words.length} words)\n${content.intro}\n\n${content.words.map((w) => `- ${w.word} (${w.pos}): ${w.meaning}. “${unmark(w.example)}”`).join("\n")}\n\nSpeaking questions:\n${content.questions.map((q) => `- ${q}`).join("\n")}${other}${footer(vocabularyPagePath(page), "Full page with exercises")}` };
}

async function levelTest(assets: Assets, args: Json): Promise<ToolResult> {
  const want = slug(args.profession);
  const entry = levelTestBySlug.get(want) ?? levelTests.find((t) => want && (t.s.includes(want) || want.includes(t.s.replace(/s$/, ""))));
  if (!entry) return { text: `Level tests exist for: ${levelTests.map((t) => t.t).join(", ")}.${footer("/english-level-test", "All level tests")}`, error: !!want };
  const content = await readJson<LevelTestContent>(assets, `/_seo-data/level-tests/${entry.s}.json`);
  if (!content) return { text: "This page is temporarily unavailable.", error: true };
  const questions = content.questions.map((q, i) => `${i + 1}. [${q.l}] ${q.q}\n   Options: ${[...q.o].sort().join(" / ")}\n   Answer: ${q.o[0]}. ${q.x}`).join("\n");
  return { text: `English level test for ${entry.t.toLowerCase()} (${entry.n} questions, A2–C2)\n${entry.i}\n\n${questions}\n\nScoring: the level is the highest one where the learner gets at least 3 of 4 right, counting up from A2.${footer(levelTestPage(entry), "Take it online with instant scoring")}` };
}

// ---------------------------------------------------------------- registry

const str = (description: string) => ({ type: "string", description });
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const TOOLS: { name: string; title: string; description: string; inputSchema: Json; run: (assets: Assets, args: Json) => ToolResult | Promise<ToolResult> }[] = [
  { name: "search_teaching_resources", title: "Search EnglishCue", description: "Search EnglishCue's free English teaching pages: grammar lessons, printable worksheets, conversation questions, ESL activities and games, teaching guides, verbs, vocabulary, phrasal verbs, idioms, collocations, confusing words and level tests. Returns titles, links and summaries.", inputSchema: { type: "object", properties: { query: str("What to find, e.g. “present perfect worksheet”, “B1 conversation questions about travel”, “icebreaker games”."), limit: { type: "integer", minimum: 1, maximum: 20, description: "Maximum results (default 8)." } }, required: ["query"] }, run: search },
  { name: "conjugate_verb", title: "Conjugate an English verb", description: "Conjugate an English verb in every tense (simple, continuous, perfect, future, conditional), with irregular forms, British variants and the imperative. Also accepts a form like “went” or “written”.", inputSchema: { type: "object", properties: { verb: str("The verb, e.g. “go”, “write”, “study”.") }, required: ["verb"] }, run: (_a, args) => conjugateVerb(args) },
  { name: "a_or_an", title: "A or an?", description: "Decide whether a word or phrase takes “a” or “an”, with the reason (silent h, “you” sound, abbreviations, numbers).", inputSchema: { type: "object", properties: { phrase: str("The word or phrase, e.g. “hour”, “university”, “MBA”, “8-year-old”.") }, required: ["phrase"] }, run: (_a, args) => aOrAn(args) },
  { name: "get_collocations", title: "Collocations of a word", description: "Common English collocations of a key word (make, do, take, have, get, give, keep, pay, catch, break, save, lose, spend, heavy, strong, high, deep, big, hard, time, money, attention, problem), grouped by meaning, with examples and common mistakes.", inputSchema: { type: "object", properties: { word: str("The key word, e.g. “make” or “heavy”.") }, required: ["word"] }, run: collocations },
  { name: "compare_confusing_words", title: "Commonly confused words", description: "Explain the difference between commonly confused English words (affect/effect, lend/borrow, make/do, say/tell…) with meanings, examples, a memory tip and practice sentences with answers.", inputSchema: { type: "object", properties: { words: { type: "array", items: { type: "string" }, description: "Two or three words, e.g. [\"affect\", \"effect\"]." } }, required: ["words"] }, run: confusingWords },
  { name: "explain_phrasal_verb", title: "Explain a phrasal verb", description: "Meanings of an English phrasal verb, whether it is separable, synonyms, examples and notes.", inputSchema: { type: "object", properties: { phrasal_verb: str("The phrasal verb, e.g. “give up”, “look after”.") }, required: ["phrasal_verb"] }, run: phrasalVerb },
  { name: "explain_idiom", title: "Explain an idiom", description: "Meaning, level, register and examples of an English idiom.", inputSchema: { type: "object", properties: { idiom: str("The idiom, e.g. “break the ice”.") }, required: ["idiom"] }, run: idiom },
  { name: "get_vocabulary_list", title: "Topic vocabulary list", description: "A vocabulary list for a topic and CEFR level (A1–C1) with meanings, example sentences and speaking questions, ready for an English class.", inputSchema: { type: "object", properties: { topic: str("The topic, e.g. “food”, “travel”, “work”, “health”."), level: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1"], description: "CEFR level (optional)." } }, required: ["topic"] }, run: vocabulary },
  { name: "get_level_test", title: "English level test by profession", description: "A 20-question English placement test (A2–C2) set in a profession (nurses, business, software developers, hotel staff, teachers…), with answers, explanations and scoring. Call without a profession to list them.", inputSchema: { type: "object", properties: { profession: str("The profession, e.g. “nurses”, “business”, “software developers”.") } }, run: levelTest },
];

// ---------------------------------------------------------------- transport

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handleMessage(assets: Assets, message: Json): Promise<Json | null> {
  const { id, method } = message;
  const params = (message.params ?? {}) as Json;
  if (typeof method !== "string") return rpcError(id, -32600, "Invalid request");
  if (id === undefined || id === null) return null; // notification
  switch (method) {
    case "initialize": {
      const asked = String(params.protocolVersion ?? "");
      return { jsonrpc: "2.0", id, result: { protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[1], capabilities: { tools: { listChanged: false } }, serverInfo: { ...SERVER_INFO, websiteUrl: ORIGIN }, instructions: INSTRUCTIONS } };
    }
    case "ping": return { jsonrpc: "2.0", id, result: {} };
    case "tools/list": return { jsonrpc: "2.0", id, result: { tools: TOOLS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema, annotations: { title, ...readOnly } })) } };
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${String(params.name)}`);
      try {
        const out = await tool.run(assets, (params.arguments ?? {}) as Json);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: out.text }], isError: !!out.error } };
      } catch {
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "EnglishCue could not answer right now. Please try again." }], isError: true } };
      }
    }
    case "resources/list": return { jsonrpc: "2.0", id, result: { resources: [] } };
    case "prompts/list": return { jsonrpc: "2.0", id, result: { prompts: [] } };
    default: return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function handleMcp(request: Request, assets: Assets): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method === "GET" || request.method === "HEAD") {
    // No server-initiated stream: this server is stateless. Browsers get a pointer to the docs.
    if ((request.headers.get("accept") ?? "").includes("text/html")) return Response.redirect(url("/english-tools/mcp-server"), 302);
    return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
  }
  if (request.method === "DELETE") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
  const raw = await request.text();
  if (raw.length > 64_000) return json(rpcError(null, -32600, "Request too large"), 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json(rpcError(null, -32700, "Parse error"), 400); }
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.slice(0, 20).map((m) => handleMessage(assets, (m ?? {}) as Json)))).filter(Boolean);
    return replies.length ? json(replies) : new Response(null, { status: 202, headers: CORS });
  }
  const reply = await handleMessage(assets, (body ?? {}) as Json);
  return reply ? json(reply) : new Response(null, { status: 202, headers: CORS });
}

// ---------------------------------------------------------------- Markdown twins

/** Pages that also exist as plain Markdown for AI agents: /collocations/make → /collocations/make.md. */
const TWINS: [RegExp, (slug: string) => boolean, (assets: Assets, slug: string) => ToolResult | Promise<ToolResult>][] = [
  [/^\/english-verbs\/([a-z-]+)$/, (s) => verbBySlug.has(s), (_a, s) => conjugateVerb({ verb: s })],
  [/^\/collocations\/([a-z0-9-]+)$/, (s) => collocationBySlug.has(s), (a, s) => collocations(a, { word: s })],
  [/^\/confusing-words\/([a-z0-9-]+)$/, (s) => confusingBySlug.has(s), (a, s) => confusingWords(a, { words: confusingBySlug.get(s)!.w })],
  [/^\/phrasal-verbs\/([a-z0-9-]+)$/, (s) => phrasalBySlug.has(s), (a, s) => phrasalVerb(a, { phrasal_verb: s })],
  [/^\/idioms\/([a-z0-9-]+)$/, (s) => idiomBySlug.has(s), (a, s) => idiom(a, { idiom: s })],
  [/^\/english-vocabulary\/([a-z0-9-]+)$/, (s) => vocabularyPageBySlug.has(s), (a, s) => vocabulary(a, { slug: s })],
  [/^\/english-level-test\/([a-z0-9-]+)$/, (s) => levelTestBySlug.has(s), (a, s) => levelTest(a, { profession: s })],
];
function twinFor(pathname: string) {
  for (const [pattern, exists, render] of TWINS) {
    const m = pattern.exec(pathname);
    if (m && exists(m[1])) return (assets: Assets) => render(assets, m[1]);
  }
  return null;
}
/** The Markdown URL of an HTML page, when it has one (for the Link header). */
export const markdownTwinOf = (pathname: string) => (twinFor(pathname) ? `${pathname}.md` : null);
/** Answers GET /…/x.md (or an HTML URL requested with Accept: text/markdown); null when the page has no twin. */
export async function markdownResponse(request: Request, pathname: string, assets: Assets): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const asked = pathname.endsWith(".md");
  const base = asked ? pathname.slice(0, -3) : pathname;
  if (!asked && !/^text\/markdown/i.test(request.headers.get("accept") ?? "")) return null;
  const render = twinFor(base);
  if (!render) return null;
  const out = await render(assets);
  if (out.error) return null;
  const [first, ...rest] = out.text.split("\n");
  const body = `# ${first}\n\n${rest.join("\n").trim()}\n\n---\nSource: ${url(base)} · EnglishCue, ready-to-teach English lessons for teachers. AI assistants can also use the free MCP server at ${url(MCP_PATH)}.\n`;
  return new Response(request.method === "HEAD" ? null : body, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600", Link: `<${url(base)}>; rel="canonical"`, "X-Robots-Tag": "noindex", Vary: "Accept", "Access-Control-Allow-Origin": "*" } });
}

// ---------------------------------------------------------------- REST API, OpenAPI and discovery

export const API_PREFIX = "/api/public/v1/";
export const DISCOVERY_PATHS = new Set(["/openapi.json", "/.well-known/mcp.json", "/.well-known/mcp/server-card.json"]);

function openApi() {
  const paths: Json = {};
  for (const tool of TOOLS) {
    const props = (tool.inputSchema.properties ?? {}) as Record<string, Json>;
    const required = (tool.inputSchema.required ?? []) as string[];
    paths[`${API_PREFIX}${tool.name}`] = {
      get: {
        operationId: tool.name, summary: tool.title, description: tool.description,
        parameters: Object.entries(props).map(([name, schema]) => ({ name, in: "query", required: required.includes(name), description: String(schema.description ?? ""), schema: schema.type === "array" ? { type: "string", description: "Comma-separated list" } : { ...schema, description: undefined } })),
        responses: { "200": { description: "The answer as text, with the englishcue.app link.", content: { "application/json": { schema: { type: "object", properties: { result: { type: "string" }, isError: { type: "boolean" } } } } } } },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "EnglishCue free English teaching API", version: SERVER_INFO.version, description: `${INSTRUCTIONS} The same tools are available as an MCP server at ${url(MCP_PATH)}.`, termsOfService: url("/terms"), contact: { url: ORIGIN } },
    servers: [{ url: ORIGIN }],
    paths,
    "x-privacy-policy": url("/privacy"),
  };
}
const serverCard = () => ({
  $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  name: "app.englishcue/englishcue", title: SERVER_INFO.title, description: "Free English teaching tools: verb conjugation, a/an, collocations, confusing words, phrasal verbs, idioms, vocabulary lists, level tests and search over EnglishCue's free lessons and worksheets.",
  version: SERVER_INFO.version, websiteUrl: url("/english-tools/mcp-server"),
  remotes: [{ type: "streamable-http", url: url(MCP_PATH) }],
  tools: TOOLS.map(({ name, title, description }) => ({ name, title, description })),
  documentation: url("/english-tools/mcp-server"), openapi: url("/openapi.json"),
});

/** GET /api/public/v1/<tool>?…, /openapi.json and the MCP server card; null for any other path. */
export async function handlePublicApi(request: Request, pathname: string, assets: Assets): Promise<Response | null> {
  // Domain proof for publishing app.englishcue/* to the official MCP Registry (public key only).
  if (pathname === "/.well-known/mcp-registry-auth") return new Response("v=MCPv1; k=ed25519; p=M6G5fP6aSKSDLP8RTJbF+aPQjhJ1O4Up3uZpj8ok3iA=\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  if (DISCOVERY_PATHS.has(pathname)) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const body = pathname === "/openapi.json" ? openApi() : serverCard();
    return new Response(JSON.stringify(body, null, 2), { headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  }
  if (!pathname.startsWith(API_PREFIX)) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { ...CORS, Allow: "GET, OPTIONS" } });
  const tool = TOOLS.find((t) => t.name === pathname.slice(API_PREFIX.length));
  if (!tool) return json({ result: `Unknown tool. See ${url("/openapi.json")}`, isError: true }, 404);
  const args: Json = {};
  const props = (tool.inputSchema.properties ?? {}) as Record<string, Json>;
  for (const [key, value] of new URL(request.url).searchParams) if (key in props) args[key] = props[key].type === "array" ? value.split(",").map((v) => v.trim()) : value;
  try {
    const out = await tool.run(assets, args);
    return json({ result: out.text, isError: !!out.error }, out.error ? 404 : 200);
  } catch {
    return json({ result: "EnglishCue could not answer right now. Please try again.", isError: true }, 503);
  }
}

export const mcpToolList = () => TOOLS.map(({ name, title, description }) => ({ name, title, description }));
