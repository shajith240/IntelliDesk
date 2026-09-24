# Content contract — read this fully before writing any page

You are filling in ONE page of an interview-prep documentation site for a real, existing codebase. `template.html` in this same folder is the exact, locked, verified skeleton. Copy it byte-for-byte and only fill in the `<!-- PAGE CONTENT GOES HERE -->` region inside `<main class="content">`. Also replace `PAGE_TITLE` in `<title>` with your page's title.

## Hard rules

1. **Do not touch anything outside the content region.** Not the `<style>` block, not the sidebar `<nav>`, not the `<script>`. If you think a class is missing, don't invent one — use only: `page-intro`, `qa-item`, `qa-question`, `qa-difficulty` (+`basic`/`intermediate`/`advanced`), `qa-answer`, `source-cite`, `callout` (+`warning`/`missing`), `data-table`. These are ALL defined already.
2. **Every technical claim must come from a file you actually opened this task.** Not memory, not the ground-truth block below extrapolated, not "this is typically how Next.js apps do it." Open the file, read it, then write the claim, and add a `<span class="source-cite">src/path/to/file.ts:LINE</span>` (or a line range) under the relevant `.qa-answer`. If you did not open a file to check something, do not assert it as fact — write "not verified" or skip the claim.
3. **If a feature doesn't exist, say so.** Use `<div class="callout missing"><strong>Not implemented</strong>...</div>` — e.g., there is no automated test suite; say that plainly rather than describing a testing setup that isn't there. Do not pad with generic advice about how testing "should" work unless clearly labeled as a recommendation, not current state.
4. **No invented code.** Every `<pre><code>` block must be an excerpt you copied from a real file (trim for length if needed, but don't rewrite/paraphrase the code itself), immediately followed by a `source-cite`.
5. **Q&A format.** Structure each page as `<h2>` sections, each containing several `.qa-item` blocks:
   ```html
   <div class="qa-item">
     <div class="qa-question">Question text<span class="qa-difficulty intermediate">Intermediate</span></div>
     <div class="qa-answer">
       <p>Answer prose.</p>
       <pre><code>real code excerpt</code></pre>
       <span class="source-cite">src/app/api/tickets/route.ts:42-58</span>
     </div>
   </div>
   ```
   Pick `basic` / `intermediate` / `advanced` honestly based on how deep the question goes.
6. **Ground truth numbers**: use the exact numbers from `PLAN.txt`'s "GROUND TRUTH" block in this folder — do not recompute or estimate your own counts. If your page needs a number not in that block, compute it yourself with a real shell command and cite the command in a `source-cite`.
7. **Tone**: plain, direct, confident where the code supports it, explicitly hedged where it doesn't. This will be read before a technical interview — the goal is that every answer, if challenged with "show me," has a real file and line number behind it.
8. **Length**: aim for 8–14 Q&A items per page, organized under 2–4 `<h2>` sections. Depth over padding — do not manufacture filler questions.

## When you're done

Report back (to the orchestrator, in your final message) with:
- The exact list of files you opened to ground this page's claims.
- Any claim you could not verify and left out, or marked as unverified.
- Any inaccuracy you noticed in the ground truth block itself, or in another page you happened to see, that the orchestrator should double check.
