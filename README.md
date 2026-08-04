# Inquiry Agent

Multi-tenant inquiry automation SaaS for travel / tour / ticketing operators.

V1 auto-handles **pre-trip FAQs** end-to-end on WhatsApp and email. Other intents escalate with a context pack. Company knowledge is always scoped by `org_id`.

## Stack

- `apps/web` — Next.js dashboard + webhooks
- `packages/db` — Postgres schema (pgvector) via Drizzle
- `packages/agent` — router, FAQ agent, policy gate, digest
- `packages/channels` — WhatsApp Cloud API + email adapters

## Quick start

```bash
# 1) Install
npm install

# 2) Env
cp .env.example .env
# Set DATABASE_URL (Neon pooled) and AUTH_SECRET

# 3) Migrate + seed Neon
npm run db:migrate
npm run db:seed

# 4) Run eval suite
npm run eval

# 5) Dev server
npm run dev
```

**Default store is Neon Postgres** (`USE_LOCAL_STORE=false` + `DATABASE_URL`).

Fallback local file store: set `USE_LOCAL_STORE=true`.

## Deploy on Vercel

1. Import [JerrySimba/inquiry-agent](https://github.com/JerrySimba/inquiry-agent) in Vercel
2. Set **Root Directory** to `apps/web` (Framework: Next.js)
3. Add environment variables (Production + Preview):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon **pooled** URL (`?sslmode=require`) |
| `AUTH_SECRET` | Long random string |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR-APP.vercel.app` |
| `USE_LOCAL_STORE` | `false` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For Gmail |
| `WHATSAPP_*` | Optional; can also connect in dashboard |

4. Deploy
5. In Google OAuth, add redirect URI: `https://YOUR-APP.vercel.app/api/channels/gmail/callback`
6. In Meta WhatsApp, set webhook to: `https://YOUR-APP.vercel.app/api/webhooks/whatsapp`

`apps/web/vercel.json` already runs install/build from the monorepo root.

Open [http://localhost:3000](http://localhost:3000)

**Pilot login:** `owner@sunset-tours.example` / `demo1234`

## Product tour

1. **Tours** — structured catalog (meeting point, what to bring, cancellation…)
2. **Knowledge** — paste FAQs/policies into the company brain
3. **Channels** — simulate WhatsApp/email inquiries; webhooks ready for Meta/Resend
4. **Inbox** — auto-resolved vs escalated threads
5. **Settings** — brand voice + per-intent autonomy toggles
6. **Digest** — generate a morning overnight report

## Webhooks

- `GET/POST /api/webhooks/whatsapp` — Meta verification + inbound texts
- `POST /api/webhooks/email` — header `x-email-secret`, JSON `{ from, to, subject, text }`

Without `WHATSAPP_ACCESS_TOKEN` / `RESEND_API_KEY`, outbound sends run in demo mode (logged as success, no external call).

## Autonomy policy (v1)

- Auto-send for `pre_trip_faq`, `sales_lead`, and `availability` when autonomy is `auto`, confidence ≥ 0.72, and citations exist
- New-client messages capture pax / dates / interests into **Leads**
- Refunds, complaints, booking status → escalate

## Connect WhatsApp + Gmail

1. Open **Dashboard → Channels**
2. **WhatsApp:** paste Phone number ID + access token from Meta; set the webhook callback to `/api/webhooks/whatsapp`
3. **Gmail:** set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, allow redirect `{APP_URL}/api/channels/gmail/callback`, then click **Connect Gmail**. Use **Sync unread now** to pull inbox inquiries.

## Monorepo scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js app |
| `npm run db:migrate` | Apply SQL schema + pgvector |
| `npm run db:seed` | Sunset Tours Bali pilot data |
| `npm run eval` | FAQ routing/policy regression checks |
| `npm run build` | Build packages + web |
