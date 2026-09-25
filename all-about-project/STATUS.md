# Documentation status

Last verified: 2026-09-25, against commit `ffccba5` (plus the documentation commit that follows it).
The previous edition described commit `08357c7` and is fully superseded.

## Page inventory (21 content pages + template)

| Page | Q&A items | Written by |
| --- | --- | --- |
| index.html | 5 | orchestrator |
| interview-cheatsheet.html | 14 | orchestrator |
| product-business.html | 9 | orchestrator |
| architecture.html | 10 | orchestrator |
| data-model.html | 14 | subagent (verified) |
| database-design.html | 17 | orchestrator |
| auth-security.html | 22 | subagent (verified) |
| roles-permissions.html | 11 | orchestrator |
| api-routes.html | 17 | orchestrator |
| feature-walkthrough-pipeline.html | 26 | subagent (verified, 2 corrections) |
| ai-safety.html | 14 | orchestrator |
| integrations.html | 12 | orchestrator |
| frontend-architecture.html | 13 | orchestrator (1 correction) |
| design-system.html | 14 | orchestrator (rewritten; old excerpts had drifted) |
| feature-walkthrough-agent.html | 23 | subagent (verified) |
| admin-operations.html | 11 | orchestrator (1 correction) |
| engineering-decisions.html | 25 | orchestrator |
| bugs-lessons.html | 10 | orchestrator |
| testing.html | 10 | orchestrator (check lists generated from the test files) |
| deployment.html | 12 | orchestrator |
| roadmap.html | 7 | orchestrator |

Six subagents were dispatched; four pages were completed by subagents before a usage limit stopped them, and the
orchestrator wrote the rest. Every page was then checked the same way.

## Automated checks run on every page

- **Shared chrome**: the `<style>`, `<nav>` and `<script>` blocks are byte-identical (SHA-1) to `template.html`.
- **CSS classes**: every class used is defined in the shared stylesheet.
- **HTML balance**: `<div>`/`</div>` counts match.
- **Code excerpts**: every `<pre><code>` block was compared line by line with the file(s) its citation names.
  The only blocks that don't match a file are ASCII diagrams, shell command lists and one usage example, and their
  citations say so.

## Manual verification

Specific claims were re-checked against source while writing (for example: team-management rules in
`src/app/api/team/[id]/route.ts:56-82`, spam-score threshold `parser.ts:280`, confidence bands
`confidence-meter.tsx:16-33`, user-menu contents). Corrections made:

- admin-operations: the assign menu shows open-ticket counts, not a "(you)" marker.
- frontend-architecture: the theme switch lives in the top bar, not the user menu.
- feature-walkthrough-pipeline: the `IMAP_USER` spam rule was removed from the code during this documentation pass
  (it was single-mailbox legacy superseded by per-workspace own-mailbox detection); the page and a line range
  were updated.

## Code changes made during this documentation pass

- Removed the unused `NEXT_PUBLIC_DEMO_MODE` variable (it referred to deleted seed routes) from `.env.example`
  and README.
- Removed the legacy global `IMAP_USER` spam rule from `src/server/email/parser.ts` and `.env.example`.

## Known limitations of this documentation

- Accurate as of the commit above. When code changes, re-verify affected claims by opening the cited file.
- Market prices on product-business.html are research from September 2026, not code facts.
- Real Gmail sending/threading had not been exercised in production when these pages were written.
