# IntelliDesk AI

IntelliDesk AI is a support-operations platform that turns incoming customer email into triaged, SLA-tracked tickets and drafts responses for a human agent to review before they go out. It classifies and summarizes each message with Gemini, retrieves relevant knowledge-base articles with Pinecone, and gives agents a single workspace to read, decide, and reply.

Nothing is sent to a customer without an agent explicitly approving it. AI output is always labeled as AI output, never presented as a verified fact.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Conventions](#conventions)
- [Email pipeline](#email-pipeline)
- [API reference](#api-reference)
- [Database](#database)
- [Using the app](#using-the-app)
- [Deploying to Vercel](#deploying-to-vercel)
- [Security notes](#security-notes)
- [Known limitations](#known-limitations)
- [Commands](#commands)

## Features

- **Email ingestion** over IMAP polling or an authenticated webhook, with spam filtering, duplicate detection, and thread/customer identification.
- **AI classification** of every message: category, priority, sentiment, language, a summary, and a confidence score, stored on the ticket.
- **AI-drafted replies**, matched against the organization's knowledge base and generated with Gemini. A draft is never sent automatically; an agent reviews and confirms it first.
- **SLA tracking** per priority level, with first-response and resolution targets, breach detection, and an at-risk view.
- **Command Center** dashboard: open-ticket metrics, SLA risk, recent activity, and the live work queue.
- **Ticket workspace**: full conversation thread, AI analysis (clearly labeled as AI output), verified ticket details, and the reply composer.
- **Knowledge base** management that feeds the retrieval step used to draft replies.
- **Organization-scoped, role-based access** (admin / agent / viewer) under NextAuth-issued sessions.
- **Keyboard-driven UI**: command palette, `g`-prefixed navigation, and list navigation with `j` / `k`.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, React Compiler) |
| UI | React 19, Tailwind CSS v4, Radix UI primitives |
| Auth | NextAuth v5 (credentials provider, JWT sessions) |
| Database | Supabase (PostgreSQL, service-role access from route handlers, RLS in migrations) |
| Vector search | Pinecone |
| LLM | Google Gemini (`@google/generative-ai`) — classification, embeddings, reply drafting |
| Email | `imapflow` (IMAP polling), `nodemailer` (SMTP), `mailparser` |
| Data fetching | SWR (client-side polling against the app's own API routes) |
| Language | TypeScript, strict mode |

## Getting started

### Requirements

- Node.js 18 or newer and npm
- A Supabase project
- A Gemini API key
- A Pinecone index with a matching embedding dimension

### Install and run

```bash
npm install
cp .env.example .env.local   # fill in the values described below
npm run dev
```

Open http://localhost:3000. Apply the database migrations first — see [Database](#database).

## Environment variables

Server-only secrets must never use the `NEXT_PUBLIC_` prefix, and must never be imported into a file that runs in the browser.

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000
GEMINI_API_KEY=your_gemini_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX=your_pinecone_index
PINECONE_HOST=your_pinecone_index_host
# Must match your Pinecone index's embedding dimension
PINECONE_EMBEDDING_DIMENSIONS=
# Protects the scheduled polling endpoints. Generate with: openssl rand -hex 32
CRON_SECRET=
# Protects the /api/emails/ingest webhook
EMAIL_INGEST_SECRET=
```

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase project URL and public keys |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | All database access from route handlers; bypasses row-level security. Never import into client code. |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | server only | Session signing and the canonical app URL |
| `GEMINI_API_KEY` | server only | Classification, embeddings, and reply drafting |
| `PINECONE_API_KEY`, `PINECONE_INDEX`, `PINECONE_HOST`, `PINECONE_EMBEDDING_DIMENSIONS` | server only | Vector search for knowledge-base retrieval |
| `CRON_SECRET` | server only | Required `Authorization: Bearer` value for `/api/emails/poll` and `/api/emails/process-queue` |
| `EMAIL_INGEST_SECRET` | server only | Required `Authorization: Bearer` value for `POST /api/emails/ingest` |
| `NEXT_PUBLIC_DEMO_MODE` | public, optional | Enables development-only demo affordances |

If `CRON_SECRET` or `EMAIL_INGEST_SECRET` is unset, the corresponding endpoint returns `503` instead of running unprotected — it fails closed, not open.

When running a production build outside Vercel (`npm start`), also set `AUTH_TRUST_HOST=true`; Auth.js otherwise rejects requests from untrusted hosts. Vercel and `npm run dev` set this automatically.

Mailbox credentials (IMAP/SMTP) are configured per organization from the app's Settings page, not from environment variables; they are stored in Supabase.

## Project structure

```
.
├── docs/                  Pitch deck, problem statement, design-token reference
├── public/                Static assets
├── supabase/migrations/   SQL migrations, applied in order
└── src/
    ├── app/                Routes only: pages, layouts, API route handlers
    ├── features/           One folder per product area (components/, hooks/, lib/)
    ├── components/
    │   ├── ui/             Design-system primitives
    │   └── layout/         App shell: sidebar, top bar, command palette
    ├── hooks/              Shared React hooks (data fetching, clock, URL state)
    ├── lib/                Shared, client-safe helpers (API client, formatters, cn)
    ├── server/             Server-only code: auth, DB clients, email, Gemini, pipeline
    ├── types/              Domain and API response types
    └── middleware.ts       Protects /dashboard routes and public webhook exceptions
```

Feature folders under `src/features/`:

| Feature | Responsibility |
| --- | --- |
| `command-center` | Agent landing page: metric strip, SLA risk panel, recent activity, and the open work queue |
| `queue` | The filterable, keyboard-navigable ticket list (`WorkQueue`), reused by the command center and the dedicated queue page |
| `ticket-workspace` | The ticket detail drawer: customer conversation, AI analysis, verified details, and the reply composer |
| `knowledge-base` | FAQ management (search, filter, create/edit/delete); articles feed AI reply drafting |
| `analytics` | Ticket breakdown by priority, category, and status; SLA performance; email intake |
| `settings` | Mailbox connection, polling notes, and team member management; admin-only |

## Conventions

- Files are kebab-case; React components are exported in PascalCase.
- Import direction: `app` → `features` → shared (`components`, `hooks`, `lib`, `types`). Shared code never imports a feature. The one intentional exception is `command-center` composing `queue`'s `WorkQueue`.
- Every file in `src/server/` starts with `import "server-only";`, so it fails to build if bundled for the browser. An ESLint rule (`no-restricted-imports` in `eslint.config.mjs`) additionally blocks importing `@/server/*` from shared code and features.
- Use the `@/` alias for cross-folder imports; relative `./` imports only within the same folder. No barrel `index.ts` files.
- Migration filenames are numbered and stable — never rename or renumber a migration that has already been applied to a live database.

## Email pipeline

1. A message arrives by IMAP poll or through `POST /api/emails/ingest`.
2. It is parsed and sanitized, then checked against local spam and duplicate rules.
3. The thread and customer are identified against existing accounts/contacts.
4. Gemini classifies the message and generates its embedding.
5. The organization-scoped ticket is created or updated in Supabase, and its embedding is written to Pinecone.
6. A candidate reply is generated from the best-matching knowledge-base article, if one exists, and stored unsent.
7. An authenticated agent reviews the draft in the ticket workspace and sends it through `POST /api/respond`, which emails the customer over SMTP and marks the ticket resolved.
8. Every step is recorded to the ticket, its SLA timestamps, and the audit log.

`POST /api/emails/process-queue` reprocesses stored, unprocessed email records. `GET|POST /api/emails/poll` polls every connected mailbox. Both require `Authorization: Bearer $CRON_SECRET` and accept `GET` so Vercel Cron can call them directly:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/emails/poll
```

Polling is idempotent: the pipeline skips any message whose `Message-ID` has already been processed, so a duplicate or overlapping run does no harm. Each run is capped at 60 seconds (`maxDuration`); anything left over is picked up by the next run.

## API reference

All routes are under `/api` and live in `src/app/api/`. Unless noted, a route requires a signed-in session and is scoped to the caller's organization via `requireAuth()` / `getOrgId()`.

| Route | Methods | Notes |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | NextAuth | Sign-in/session endpoints managed by Auth.js |
| `/api/auth/signup` | `POST` | Creates an organization and its first admin user |
| `/api/dashboard` | `GET` | Command Center metrics, SLA summary, recent activity |
| `/api/tickets` | `GET` | Filtered, sorted, paginated ticket list |
| `/api/tickets/[id]` | `GET`, `PATCH` | Ticket detail with SLA status and similar tickets; field updates |
| `/api/respond` | `POST` | Sends the reviewed AI draft, marks the ticket resolved |
| `/api/faqs`, `/api/faqs/[id]` | `GET`, `POST`, `PUT`, `DELETE` | Knowledge-base articles |
| `/api/search` | `GET` | Semantic ticket/article search via Pinecone |
| `/api/team` | `GET` | Organization members |
| `/api/customers` | `GET` | Contact/account lookup |
| `/api/settings/email-config` | `GET`, `POST`, `DELETE` | Mailbox (IMAP/SMTP) connection for the organization |
| `/api/emails/ingest` | `POST` | Webhook intake; requires `Authorization: Bearer $EMAIL_INGEST_SECRET`, not a user session |
| `/api/emails/poll`, `/api/emails/process-queue` | `GET`, `POST` | Cron-driven pipeline runs; require `Authorization: Bearer $CRON_SECRET` |
| `/api/emails/bulk` | `POST` | Bulk email import for a session-authenticated agent |

`/api/cleanup`, `/api/migrate`, `/api/seed`, and `/api/seed/test-emails` are development-only utility routes: each one checks `NODE_ENV` and refuses to run in production.

## Database

Apply the SQL files in `supabase/migrations/` in order:

| Migration | Adds |
| --- | --- |
| `001_initial_schema.sql` | Core schema: `organizations`, `accounts`, `contacts`, `teams`, `tickets`, `emails`, `ticket_emails`, `sla_policies`, `faqs`, `auto_responses`, `audit_logs` |
| `002_auth.sql` | Authentication fields on `users` |
| `003_rls.sql` | Row-level security policies |
| `004_email_config.sql` | Per-organization IMAP/SMTP configuration |
| `005_seed_admin.sql` | Seed administrator account |

If a Supabase project already has this schema and data, do not rerun the migrations blindly — confirm the expected tables and columns exist first.

## Using the app

After signing in, agents land on the **Command Center**: queue metrics, the open work queue, SLA risk, and recent activity. Clicking a ticket opens a workspace panel (`?ticket=<id>` in the URL) with the customer conversation, the AI analysis (always marked with the IntelliDesk AI label — "AI suggestion" for analysis, "AI draft" for replies), verified ticket details, and the reply composer. Sending a reply requires an explicit confirmation; it emails the customer and marks the ticket resolved.

Data refreshes every 30 seconds and after every mutation. The status indicator in the top bar reflects whether the last refresh succeeded — the app polls and does not use a push/realtime connection.

Keyboard shortcuts: `/` or `Ctrl K` opens search, `g` then `d`/`i`/`m`/`a`/`k`/`s` navigates between sections, `j`/`k` and `Enter` move through and open items in a list, `?` shows the full shortcut list.

## Deploying to Vercel

1. Import the repository and leave **Root Directory** empty (the default) — the app lives at the repository root. Framework preset: Next.js. Build command: `npm run build` (default). Do not use static export; the app needs route handlers, authentication, and dynamic data.
2. Add every variable from the [Environment variables](#environment-variables) table under **Settings → Environment Variables**, for both Production and Preview. Set `NEXTAUTH_URL` to the deployed URL.
3. `vercel.json` registers a cron job for `/api/emails/poll`. Schedules are in UTC. The committed schedule (`0 6 * * *`, daily) is the only frequency the Hobby plan allows; on Pro, tighten it, e.g. `*/10 * * * *`. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically once `CRON_SECRET` is set. Local development does not run cron jobs — call the endpoint manually with the `curl` command in [Email pipeline](#email-pipeline).
4. IMAP connections are not held open between requests: each cron invocation connects, fetches new messages, processes them, and disconnects.
5. To collect Core Web Vitals, enable **Speed Insights** in the Vercel dashboard. This requires adding the `@vercel/speed-insights` package and rendering `<SpeedInsights />` in `src/app/layout.tsx`; it is not installed by default.

## Security notes

- The Supabase **service-role key** is used from route handlers only, behind `import "server-only"` and the ESLint import boundary described in [Conventions](#conventions). It must never reach a file that ships to the browser.
- Every API route that touches ticket or organization data checks the session (`requireAuth()`, or `auth()` directly) and scopes its query to the caller's `organization_id` — there is no unscoped read path.
- `/api/emails/ingest`, `/api/emails/poll`, and `/api/emails/process-queue` accept no session; they authenticate with a bearer secret instead, and fail closed (`503`) if the secret is not configured.
- Development-only routes (`/api/cleanup`, `/api/migrate`, `/api/seed*`) actively refuse to run when `NODE_ENV=production`.
- AI-generated content (classification, drafts) is never sent or acted on automatically; it is always surfaced as a suggestion pending human review.

## Known limitations

- **Analytics has no historical data.** The dashboard reflects the current state of the queue; there is no time-series storage yet, so nothing shows trends.
- **No push/realtime updates.** The UI relies on 30-second polling; a change made by another agent can take up to that long to appear elsewhere.
- **Single mailbox per organization.** Multiple connected inboxes per organization are not supported.
- No automated test suite exists yet; verification is `npm run lint` and `npm run build`, plus manual QA.
- No `LICENSE` file is included. Add one before treating this repository as reusable outside the team.

## Commands

```bash
npm run dev      # start the development server
npm run lint     # run ESLint
npm run build    # production build
npm start        # run a production build (set AUTH_TRUST_HOST=true if not on Vercel)
```
