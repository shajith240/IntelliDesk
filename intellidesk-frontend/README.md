# IntelliDesk AI

IntelliDesk AI is a Next.js helpdesk application for processing support email, classifying tickets with Gemini, storing data in Supabase, and indexing embeddings in Pinecone. Email delivery uses the configured SMTP account.

## Requirements

- Node.js 18 or newer
- npm
- Supabase project
- Gemini API key
- Pinecone index with the configured embedding dimension

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

Create `.env.local` with the following values. Server-only secrets must never use the `NEXT_PUBLIC_` prefix:

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
# Must match your Pinecone index dimension
PINECONE_EMBEDDING_DIMENSIONS=
# Protects the scheduled polling endpoints. Generate with: openssl rand -hex 32
CRON_SECRET=
# Protects the /api/emails/ingest webhook
EMAIL_INGEST_SECRET=
```

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase project URL and public keys |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | All database access from route handlers (bypasses RLS; never import into client code) |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | server only | Session signing and canonical URL |
| `GEMINI_API_KEY` | server only | Classification, embeddings, reply drafting |
| `PINECONE_API_KEY`, `PINECONE_INDEX`, `PINECONE_HOST`, `PINECONE_EMBEDDING_DIMENSIONS` | server only | Vector search |
| `CRON_SECRET` | server only | Required `Authorization: Bearer` value for `/api/emails/poll` and `/api/emails/process-queue` |
| `EMAIL_INGEST_SECRET` | server only | Required `Authorization: Bearer` value for `/api/emails/ingest` |
| `NEXT_PUBLIC_DEMO_MODE` | public, optional | Development-only demo affordances |

If `CRON_SECRET` or `EMAIL_INGEST_SECRET` is missing, the matching endpoint returns 503 instead of running unprotected.

When running a production build outside Vercel (`npm start`), also set `AUTH_TRUST_HOST=true`; Auth.js rejects requests from untrusted hosts otherwise. Vercel and `npm run dev` handle this automatically.

For connected mailbox processing, configure email credentials through the application settings. The server stores the organization IMAP and SMTP configuration in Supabase. The optional process-level variables used by local email tooling are documented in the source email modules.

## Email workflow

The direct Next.js backend handles the complete workflow:

1. Poll IMAP or receive an email through `/api/emails/ingest`.
2. Parse and sanitize the message, then run local spam and duplicate checks.
3. Detect threads and identify the customer.
4. Classify the message and generate embeddings with Gemini.
5. Create or update the organization-scoped Supabase ticket and Pinecone vectors.
6. Generate and optionally send an automatic SMTP response.
7. Let an authenticated agent edit and send a reviewed response through `/api/respond`.
8. Record response, SLA, ticket, and audit-log state in Supabase.

The queue endpoint `/api/emails/process-queue` processes stored, unprocessed email records. `/api/emails/poll` polls every connected mailbox. Both accept `GET` (Vercel Cron) and `POST`, and both require `Authorization: Bearer $CRON_SECRET`:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/emails/poll
```

Polling is safe to run twice: the pipeline skips messages whose `Message-ID` was already processed. Each run is capped at 60 seconds (`maxDuration`); anything not processed in that window is picked up by the next run.

## Using the app

After signing in, agents land on the **Command Center**: queue metrics, the open work queue, SLA risk, and recent activity. Tickets open in a workspace panel (`?ticket=<id>` in the URL) with the customer conversation, the AI analysis (always marked with the IntelliDesk AI label: "AI suggestion" for analysis, "AI draft" for replies), verified ticket details, and the reply composer. Sending requires an explicit confirmation, emails the customer, and marks the ticket Resolved.

Data refreshes every 30 seconds and after every change. The status indicator in the top bar reports whether the last refresh succeeded; the app polls and does not use push updates.

Keyboard: `/` or `Ctrl K` search, `G` then `D`/`I`/`M`/`A`/`K`/`S` to navigate, `J`/`K` and `Enter` in the queue, `?` for the full list.

## Deploying to Vercel

1. Import the repository and set **Root Directory** to `intellidesk-frontend`. Framework preset: Next.js. Build command `npm run build` (default). Do not use static export: the app needs route handlers, authentication, and dynamic data.
2. Add every variable from the table above in **Settings → Environment Variables** (Production and Preview). Set `NEXTAUTH_URL` to the deployment URL.
3. `vercel.json` registers a cron job for `/api/emails/poll`. Schedules are in UTC. The committed schedule (`0 6 * * *`, daily) is the only frequency the Hobby plan allows; on Pro, change it to something like `*/10 * * * *`. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically once `CRON_SECRET` is set. Local development does not run cron jobs; call the endpoint manually with the curl command above.
4. Long-lived IMAP connections are not kept open: each cron invocation connects, fetches new messages, processes them, and exits.
5. Performance monitoring: enable **Speed Insights** in the Vercel dashboard to collect Core Web Vitals. It requires adding the `@vercel/speed-insights` package and rendering `<SpeedInsights />` in `src/app/layout.tsx`; it is not installed by default.

## Database

Apply the SQL files in `supabase/migrations/` in order to create the schema, authentication fields, row-level security policies, email configuration, and seed administrator.

If your Supabase project already contains this schema and data, do not rerun the migrations blindly. Confirm that the required tables and columns exist first. The application expects `organizations`, `users`, `tickets`, `emails`, `auto_responses`, `audit_logs`, `email_config`, and the ticket/email relationship tables.

## Commands

```bash
npm run dev
npm run lint
npm run build
npm start
```
