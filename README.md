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
- [Roles](#roles)
- [Database](#database)
- [Using the app](#using-the-app)
- [Deploying to Vercel](#deploying-to-vercel)
- [Security notes](#security-notes)
- [Known limitations](#known-limitations)
- [Commands](#commands)

## Features

- **One-step mailbox connection**: an admin connects Gmail with a guided app-password flow (or any IMAP/SMTP provider). Credentials are verified before saving and stored encrypted.
- **Reliable email intake** over IMAP polling or an authenticated webhook: each message is stored before it is marked read, so a timed-out run never loses mail. Includes spam filtering, duplicate detection, and thread/customer identification.
- **AI classification** of every message: category, priority, sentiment, language, a summary, and a confidence score, stored on the ticket.
- **AI-drafted replies**, matched against the organization's knowledge base and generated with Gemini. Only a high-confidence knowledge-base answer is sent automatically; every other draft waits for an agent to review and confirm it.
- **SLA tracking** per priority level, with first-response and resolution targets, breach detection, and an at-risk view.
- **Command Center** dashboard: open-ticket metrics, SLA risk, recent activity, and the live work queue.
- **Ticket workspace**: full conversation thread, AI analysis (clearly labeled as AI output), verified ticket details, and the reply composer.
- **Knowledge base** management that feeds the retrieval step used to draft replies.
- **Admin-led assignment**: only admins assign tickets. Flagged, unassigned tickets collect in **Needs Review**, where candidates are ranked by availability, then by open-ticket load.
- **Organization-scoped roles** enforced on every route (see [Roles](#roles)).
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
# Encrypts stored mailbox passwords. Generate with: openssl rand -base64 32
# Must be identical in every environment that shares the database.
MAILBOX_ENCRYPTION_KEY=
# Leave false for a company deployment: admins add members from Settings.
NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP=false
```

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase project URL and public keys |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | All database access from route handlers; bypasses row-level security. Never import into client code. |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | server only | Session signing and the canonical app URL |
| `GEMINI_API_KEY` | server only, optional | Platform key for classification, embeddings and drafting. Used only by workspaces that haven't added their own key in **Settings → AI**. |
| `PINECONE_API_KEY`, `PINECONE_INDEX`, `PINECONE_HOST`, `PINECONE_EMBEDDING_DIMENSIONS` | server only | Vector search for knowledge-base retrieval |
| `CRON_SECRET` | server only | Required `Authorization: Bearer` value for `/api/emails/poll` and `/api/emails/process-queue` |
| `EMAIL_INGEST_SECRET` | server only | Required `Authorization: Bearer` value for `POST /api/emails/ingest` |
| `MAILBOX_ENCRYPTION_KEY` | server only | 32-byte base64 key for AES-256-GCM encryption of mailbox passwords. Changing or losing it means every mailbox must be reconnected. |
| `NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP` | public, optional | `true` re-enables self-service workspace signup. Off by default. |
| `NEXT_PUBLIC_DEMO_MODE` | public, optional | Enables development-only demo affordances |

If `CRON_SECRET` or `EMAIL_INGEST_SECRET` is unset, the corresponding endpoint returns `503` instead of running unprotected — it fails closed, not open.

When running a production build outside Vercel (`npm start`), also set `AUTH_TRUST_HOST=true`; Auth.js otherwise rejects requests from untrusted hosts. Vercel and `npm run dev` set this automatically.

Mailbox credentials are configured per organization from **Settings → Support mailbox**, not from environment variables. They are verified against the real IMAP and SMTP servers, then stored encrypted in `mailbox_connections`; the password is never returned to the browser. If `MAILBOX_ENCRYPTION_KEY` is missing, connecting a mailbox returns `503`.

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

1. A message arrives by IMAP poll or through `POST /api/emails/ingest`. A polled message is stored as an unprocessed row first and only then marked read in the mailbox.
2. It is parsed and sanitized, then checked against local spam and duplicate rules.
3. The thread is identified, always within the same organization: `In-Reply-To`/`References` against every stored Message-ID (including our own replies, whose Message-IDs we set), then a ticket number in the subject, then the same sender with a similar subject in the last 48 hours. An email that is near-identical to one the same sender sent recently is attached to that ticket rather than dropped.
4. Gemini classifies the message and generates its embedding.
5. `record_inbound_message()` commits the email to a ticket in one transaction:
   - reply to an open ticket: appended;
   - reply to a **Pending** or **Resolved** ticket: appended and reopened;
   - reply to a **Closed** ticket: a new follow-up ticket linked to the old one;
   - otherwise: a new ticket.

   It is idempotent per email, and the email leaves the intake queue only after every step has succeeded, so a failed run is retried without creating a second ticket.
6. For a new ticket only, a candidate reply is generated from the best-matching knowledge-base article. A high-confidence match is emailed right away through the same reply path agents use (recorded as an AI-authored message, ticket set to Pending); anything else is stored as a draft. A message the classifier flags for human review lands in **Needs Review** for an admin to assign. A customer writing back on an existing ticket never gets an automatic reply.
7. The assigned agent answers in the ticket workspace with `POST /api/tickets/[id]/messages`: a public reply (optionally starting from the AI draft) with the status to leave the ticket in, or an internal note the customer never sees.
8. Every step is recorded to the conversation, the ticket's SLA timestamps, and the audit log.

`GET|POST /api/emails/poll` reads every connected mailbox, then processes the stored queue. `POST /api/emails/process-queue` only processes the queue. Both require `Authorization: Bearer $CRON_SECRET` and accept `GET` so Vercel Cron can call them directly:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/emails/poll
```

Polling is safe to repeat. A message is stored once per `Message-ID`; each queued row is claimed with a compare-and-set, so overlapping runs never process the same email twice. Processing stops at a 50-second budget and the rest waits for the next run. A message that fails 5 times is parked with its `processing_error` instead of being retried forever.

The Vercel Hobby plan only allows a daily cron, so `.github/workflows/poll-mailboxes.yml` calls the poll endpoint every 10 minutes from GitHub Actions (free and unlimited for public repositories). It needs two repository secrets, **Settings → Secrets and variables → Actions**: `APP_URL` (the deployed URL, no trailing slash) and `CRON_SECRET` (the same value as on Vercel). Without them the workflow skips with a warning.

## API reference

All routes are under `/api` and live in `src/app/api/`. Unless noted, a route requires a signed-in session and is scoped to the caller's organization via `requireAuth()` / `getOrgId()`.

| Route | Methods | Notes |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | NextAuth | Sign-in/session endpoints managed by Auth.js |
| `/api/auth/signup` | `POST` | Creates an organization and its first admin; returns `403` unless `NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP=true` |
| `/api/dashboard` | `GET` | Command Center metrics, SLA summary, recent activity |
| `/api/tickets` | `GET` | Filtered, sorted, paginated ticket list |
| `/api/tickets` `?view=review` | `GET` | Needs Review: flagged, unassigned, open tickets (admin, viewer) |
| `/api/tickets/[id]` | `GET`, `PATCH` | Ticket detail with SLA status and similar tickets; status, priority, category and team updates. Assignment and SLA fields are rejected. |
| `/api/tickets/[id]/assign` | `POST` | Admin only. `{ assignee_id \| null, note? }`: assigns or unassigns atomically, with history and audit |
| `/api/tickets/[id]/messages` | `POST` | Assigned agent or admin: `{ kind: "reply", body, status_after?, draft_id? }` emails the customer; `{ kind: "note", body }` adds an internal note |
| `/api/faqs`, `/api/faqs/[id]` | `GET`, `POST`, `PUT`, `DELETE` | Knowledge-base articles |
| `/api/search` | `GET` | Semantic ticket/article search via Pinecone |
| `/api/team` | `GET`, `POST` | Members; admins add a member and receive a one-time initial password |
| `/api/team/[id]` | `PATCH` | Admin only: change name, role or active state. Deactivating returns the member's open tickets to the pool. |
| `/api/team/workload` | `GET` | Admin only: assignable members ranked by availability, then open tickets |
| `/api/me`, `/api/me/password` | `GET`, `PATCH`, `POST` | Own profile, availability toggle, password change |
| `/api/customers` | `GET` | Contact/account lookup |
| `/api/settings/email-config` | `GET`, `POST`, `DELETE` | Mailbox status (admin, viewer); connect and disconnect (admin). Never returns the password. |
| `/api/emails/ingest` | `POST` | Webhook intake; requires `Authorization: Bearer $EMAIL_INGEST_SECRET`, not a user session |
| `/api/emails/poll`, `/api/emails/process-queue` | `GET`, `POST` | Cron-driven pipeline runs; require `Authorization: Bearer $CRON_SECRET` |
| `/api/emails/bulk` | `POST` | Admin only: bulk email import |
| `/api/settings/ai` | `GET`, `PATCH`, `POST`, `DELETE` | Workspace AI: read status (admin, viewer); toggle `auto_send`, save a Gemini key (verified with Google, stored encrypted, never returned) or remove it (admin) |
| `/api/emails/spam` | `GET` | Admin only: email the spam filters caught in the last 30 days |
| `/api/emails/[id]/not-spam` | `POST` | Admin only: return a false positive to the intake queue with a filter override |

## Roles

| | Admin | Agent | Viewer |
| --- | --- | --- | --- |
| See tickets | All | Only tickets assigned to them | All (read-only) |
| Assign / unassign tickets | Yes | No, not even to themselves | No |
| Work a ticket (status, priority, reply) | Any | Their own | No |
| Needs Review, Command Center | Yes | No (lands on My Work) | Yes |
| Members, mailbox, knowledge-base edits | Yes | No | No |
| Availability toggle | Yes | Yes | No |

Every API route checks these rules through `src/server/auth/policy.ts`; hiding a button in the UI is never the only guard. An agent asking for another agent's ticket gets `404`, not `403`, so ticket IDs can't be probed. Sessions re-check role and active status every 5 minutes, so a deactivated member loses access without waiting for their token to expire.

## Database

Apply the SQL files in `supabase/migrations/` in order:

| Migration | Adds |
| --- | --- |
| `001_initial_schema.sql` | Core schema: `organizations`, `accounts`, `contacts`, `teams`, `tickets`, `emails`, `ticket_emails`, `sla_policies`, `faqs`, `auto_responses`, `audit_logs` |
| `002_auth.sql` | Authentication fields on `users` |
| `003_rls.sql` | Row-level security policies |
| `004_email_config.sql` | Per-organization IMAP/SMTP configuration |
| `005_seed_admin.sql` | Seed administrator account (rotate its password immediately) |
| `006_lockdown_public_api.sql` | Closes the Supabase Data API: RLS on every table with no policies, and all `anon`/`authenticated` grants revoked. The app reaches the database only through the service-role key on the server. |
| `007_integrity_and_assignment.sql` | Composite `(id, organization_id)` foreign keys so no row can point across organizations; `assign_ticket()`; `ticket_assignments` history; `mailbox_connections`; `auth_login_attempts` |
| `008_email_intake_queue.sql` | Intake queue columns: `processing_attempts`, `processing_error`, `last_attempt_at` |
| `009_conversation_model.sql` | `ticket_messages` (customer emails, replies, internal notes); the status workflow as data (`ticket_statuses`, `ticket_status_transitions`) enforced by a trigger; outbound emails in `emails`; `complete_ticket_reply()` |
| `010_record_inbound_message.sql` | `record_inbound_message()`: atomic, idempotent intake of an inbound email (append, reopen, follow-up or new ticket) |
| `011_ai_settings_and_spam_review.sql` | `organizations.ai_auto_send` (off by default), `ai_credentials` (encrypted workspace Gemini key), spam overrides on `emails` |

With the Supabase CLI linked to a project, `supabase db push` applies pending migrations. The files in `supabase/tests/` check the database rules inside a transaction that is rolled back, so they are safe to run against a live database:

```bash
for f in supabase/tests/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```

### Ticket workflow

| From \ To | In Progress | Pending | Resolved | Closed |
| --- | --- | --- | --- | --- |
| New | yes | yes | yes | yes |
| In Progress | | yes | yes | yes |
| Pending (waiting on customer) | yes | | yes | yes |
| Resolved | yes (reopen) | | | yes |
| Closed | | | | |

The table lives in `ticket_status_transitions`; a trigger rejects any other change and owns `sla_resolved_at` (set on resolve, cleared on reopen). Closed is final: a customer who writes back gets a follow-up ticket.

If a Supabase project already has this schema and data, do not rerun the migrations blindly — confirm the expected tables and columns exist first.

## Using the app

After signing in, admins and viewers land on the **Command Center** and agents on **My Work**. The Command Center shows queue metrics, the open work queue, SLA risk, and recent activity. Clicking a ticket opens a workspace panel (`?ticket=<id>` in the URL) with the conversation (customer emails, the team's replies, and internal notes), the AI analysis (always marked with the IntelliDesk AI label — "AI suggestion" for analysis, "AI draft" for replies), verified ticket details, and the composer. A reply requires an explicit confirmation, emails the customer, and leaves the ticket in the status the agent picks (usually Pending while waiting on the customer). Internal notes are never emailed.

Data refreshes every 30 seconds and after every mutation. The status indicator in the top bar reflects whether the last refresh succeeded — the app polls and does not use a push/realtime connection.

Keyboard shortcuts: `/` or `Ctrl K` opens search, `g` then `d`/`i`/`m`/`a`/`k`/`s` navigates between sections, `j`/`k` and `Enter` move through and open items in a list, `?` shows the full shortcut list.

## Deploying to Vercel

1. Import the repository and leave **Root Directory** empty (the default) — the app lives at the repository root. Framework preset: Next.js. Build command: `npm run build` (default). Do not use static export; the app needs route handlers, authentication, and dynamic data.
2. Add every variable from the [Environment variables](#environment-variables) table under **Settings → Environment Variables**, for both Production and Preview. Set `NEXTAUTH_URL` to the deployed URL.
3. `vercel.json` registers a daily cron job for `/api/emails/poll` as a fallback (the Hobby plan allows nothing more frequent). Vercel sends `Authorization: Bearer $CRON_SECRET` automatically once `CRON_SECRET` is set. For 10-minute polling, add the `APP_URL` and `CRON_SECRET` repository secrets described in [Email pipeline](#email-pipeline). Local development does not run cron jobs: call the endpoint manually with the `curl` command there.
4. IMAP connections are not held open between requests: each cron invocation connects, fetches new messages, processes them, and disconnects.
5. To collect Core Web Vitals, enable **Speed Insights** in the Vercel dashboard. This requires adding the `@vercel/speed-insights` package and rendering `<SpeedInsights />` in `src/app/layout.tsx`; it is not installed by default.

## Security notes

- The Supabase **service-role key** is used from route handlers only, behind `import "server-only"` and the ESLint import boundary described in [Conventions](#conventions). It must never reach a file that ships to the browser.
- Every API route that touches ticket or organization data checks the session (`requireAuth()`, or `auth()` directly) and scopes its query to the caller's `organization_id` — there is no unscoped read path.
- `/api/emails/ingest`, `/api/emails/poll`, and `/api/emails/process-queue` accept no session; they authenticate with a bearer secret instead, and fail closed (`503`) if the secret is not configured.
- The Supabase Data API is closed: RLS is on for every table with no policies, and the `anon` and `authenticated` roles have no grants. The public anon key can't read or write anything.
- Tenant isolation is enforced by the database as well as the code: composite foreign keys and triggers reject any row that references another organization's user, ticket, team or email.
- Sign-in is throttled (5 failures per email, 20 per IP, per 15 minutes), takes the same time whether or not the email exists, and public signup is off by default.
- Mailbox passwords are encrypted with AES-256-GCM, bound to their organization. Custom mail hosts must resolve to public addresses (SSRF guard), and IMAP and SMTP always use TLS.
- There are no seed, migrate or cleanup HTTP routes; schema changes go through `supabase/migrations/`.
- AI output is labeled as AI in the UI. By default the AI only drafts; automatic sending is an admin opt-in, and even then a reply goes out unreviewed only if every rule in `src/server/pipeline/auto-reply-policy.ts` passes: a strong knowledge-base match, no links, addresses, phone numbers or amounts the articles don't contain (`grounding.ts`), a low-risk topic, a customer who isn't upset, a sender who isn't automated, and at most two automatic replies per address per day. Follow-ups on an existing ticket are always answered by a person.
- Prompt injection: instructions go in the model's system instruction and customer text is passed as delimited, untrusted data; output is constrained to a JSON schema. The model can't take actions: it only produces text that the rules above gate.
- Mail loops: our own messages, bounces and out-of-office replies (`Auto-Submitted`, `X-Autoreply`, `Precedence`, null `Return-Path`, system senders) are stored but never ticketed; lists and no-reply senders are ticketed but never auto-answered (`src/server/email/automated.ts`). Our automatic replies carry `Auto-Submitted: auto-replied` (RFC 3834).
- AI failures never invent data: if Gemini is down or the key is wrong, the email stays in the queue and is retried; a bad workspace key is flagged in Settings.

## Known limitations

- **Analytics has no historical data.** The dashboard reflects the current state of the queue; there is no time-series storage yet, so nothing shows trends.
- **No push/realtime updates.** The UI relies on 30-second polling; a change made by another agent can take up to that long to appear elsewhere.
- **Single mailbox per organization.** Multiple connected inboxes per organization are not supported.
- Automated tests cover the database rules (`supabase/tests/`, 38 checks) and the pure email/AI safety logic (`npm test`); routes and UI are verified with `npm run lint`, `npm run build`, and scripted browser runs, not a committed end-to-end suite yet.
- No `LICENSE` file is included. Add one before treating this repository as reusable outside the team.

## Commands

```bash
npm run dev      # start the development server
npm run lint     # run ESLint
npm test         # unit tests (node:test): loop detection, grounding check
npm run build    # production build
npm start        # run a production build (set AUTH_TRUST_HOST=true if not on Vercel)
```
