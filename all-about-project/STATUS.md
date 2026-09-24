# Documentation status

Last verified: 2026-09-24, against commit `08357c7` of this repository.

## Page inventory (14 pages, 133 Q&A items total)

| Page | Q&A items | Written by |
| --- | --- | --- |
| index.html | 3 | orchestrator |
| architecture.html | 9 | subagent |
| data-model.html | 9 | subagent |
| auth-security.html | 11 | subagent |
| api-routes.html | 10 | subagent |
| frontend-architecture.html | 11 | subagent |
| design-system.html | 13 | subagent |
| feature-walkthrough-pipeline.html | 12 | subagent |
| feature-walkthrough-agent.html | 10 | subagent |
| engineering-decisions.html | 12 | orchestrator |
| bugs-lessons.html | 8 | orchestrator |
| testing.html | 8 | subagent |
| deployment.html | 8 | subagent |
| integrations.html | 9 | subagent |

`engineering-decisions.html` and `bugs-lessons.html` were written directly by the orchestrator rather than
delegated, since the orchestrator made the changes those pages describe first-hand in the same working session and
could cite exact reasoning and line numbers without reconstructing intent from a diff.

## Consistency sweep results (run by the orchestrator after all subagents reported)

- **CSS class coverage**: every `class="..."` used across all 14 pages resolves to a class defined in the shared
  `<style>` block. Zero undefined classes.
- **HTML tag balance**: every page's `<div>`/`</div>` and `<main>`/`</main>` counts match exactly.
- **Internal navigation links**: all 14×14 `nav-link` hrefs resolve to a real file in this folder. Zero broken links.
- **Placeholder / lorem ipsum scan**: zero matches for `[TODO]`, `[SECTION]`, `[INSERT]`, "lorem ipsum", "placeholder
  text", or lorem-ipsum-adjacent words, across all pages.
- **Shared template integrity**: the `<style>` block, the `<nav class="sidebar">` block, and the `<script>` block are
  byte-identical (verified by hash) across all 14 real pages and `template.html` itself. No subagent modified the
  shared chrome.
- **Active-nav state**: no page ships a hardcoded `nav-link active` class; it's set client-side by the shared script
  based on the current filename, so the correct entry highlights on every page automatically.

## Spot-checks the orchestrator ran independently (beyond each subagent's own validation)

Two claims from subagent hand-off summaries were flagged as suspicious while agents were still running, and checked
against the real source after all pages landed:

- A summary mentioned "rate limiting" on `/api/emails/poll`. Grepped the actual route handler and the final
  `api-routes.html` — the phrase does not appear in either. It was loose wording in the summary that never made it
  into the page content. No fix needed.
- `architecture.html`'s citation for the server/client boundary claim is phrased as a paragraph rather than a single
  `file:line` — verified it's still accurate (providers.tsx is a client component, the ESLint rule and the
  `server-only` convention are both real), just a different citation style than most other pages. Left as is.

Additionally, every numeric threshold that appears in the pipeline and API pages was independently re-checked against
the real source after the fact:

| Claim | Cited value | Verified against |
| --- | --- | --- |
| Duplicate-ticket similarity threshold | 0.85 | `src/server/pipeline/deduplicator.ts:7` |
| Auto-classification confidence threshold | 0.8 | `src/server/gemini/classify.ts:104` |
| FAQ "perfect match" auto-send threshold | 0.9 | `src/server/gemini/respond.ts:9` |
| FAQ "partial match" suggest threshold | 0.7 | `src/server/gemini/respond.ts:10` |
| Default Gemini model | `gemini-2.5-flash` | `src/server/gemini/client.ts:13` |
| npm scripts (no test script exists) | `dev`, `build`, `start`, `lint` only | `package.json` |

All six matched exactly. No corrections were needed to any page.

## Known limitations of this documentation

- It reflects the codebase as of 2026-09-24 (commit `08357c7`). If the code changes, these pages will drift and
  should be re-verified the same way they were built: open the cited file, confirm the claim, fix or remove it if
  it no longer holds.
- `testing.html` documents, honestly, that no automated test suite exists yet — do not read that page as describing
  a testing setup that's actually in place.
- One fact worth knowing that is intentionally *not* baked into these pages as a permanent claim: the default Gemini
  model string (`gemini-2.5-flash`, cited above) was announced for deprecation in mid-October 2026 by Google. That's
  a fact about the vendor's roadmap, not about this codebase, so it isn't treated as part of the architecture — but
  if `integrations.html` is read after that date, verify the model string in `src/server/gemini/client.ts` is still
  current before repeating it in an interview.

## Corrections made during writing

None were needed. Every subagent's own validation (undefined-class check, div-balance check) passed on first
delivery, and the orchestrator's independent spot-checks above found no factual errors to correct.
