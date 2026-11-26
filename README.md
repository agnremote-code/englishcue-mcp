# EnglishCue MCP server

A free, public, read-only [Model Context Protocol](https://modelcontextprotocol.io) server for English teachers and learners, run by [EnglishCue](https://englishcue.app).

- **Endpoint:** `https://englishcue.app/mcp` (Streamable HTTP, stateless JSON, no key, no sign-in)
- **Registry name:** `app.englishcue/englishcue` in the [official MCP Registry](https://registry.modelcontextprotocol.io)
- **Docs and client setup:** https://englishcue.app/english-tools/mcp-server

## Tools

| Tool | What it returns |
| --- | --- |
| `search_teaching_resources` | Free EnglishCue pages (lesson plans, worksheets, grammar, vocabulary…) that match a query |
| `conjugate_verb` | All forms and tenses of an English verb |
| `a_or_an` | Whether a word or phrase takes "a" or "an", and why |
| `get_collocations` | Collocations for a key word, grouped by meaning, with examples |
| `compare_confusing_words` | The difference between two commonly confused words |
| `explain_phrasal_verb` | Meanings, separability, synonyms and examples of a phrasal verb |
| `explain_idiom` | Meaning, level, register and examples of an idiom |
| `get_vocabulary_list` | A topic vocabulary list by CEFR level |
| `get_level_test` | A 20-question English placement test (A2–C2) set in a profession |

Every answer links back to the matching englishcue.app page. The same tools are plain GET endpoints, described in https://englishcue.app/openapi.json.

## Connect

Claude (Settings → Connectors → Add custom connector), ChatGPT, Cursor, VS Code and any other MCP client: add a remote server with the URL `https://englishcue.app/mcp`.

```json
{ "mcpServers": { "englishcue": { "type": "http", "url": "https://englishcue.app/mcp" } } }
```

## Source

`src/worker/mcp.ts` is the request handler that runs on Cloudflare Workers at englishcue.app (JSON-RPC over HTTP: `initialize`, `tools/list`, `tools/call`, `ping`). `src/app/` holds the pure helpers it calls (verb engine, a/an rule). The content indexes it reads are part of the EnglishCue site; the same data is published as open datasets (CC BY 4.0) at https://github.com/agnremote-code/english-teaching-datasets and https://englishcue.app/datasets.

`server.json` is the entry published to the MCP Registry.

## License

Code: MIT. Data returned by the server: CC BY 4.0, credit "EnglishCue (englishcue.app)".
