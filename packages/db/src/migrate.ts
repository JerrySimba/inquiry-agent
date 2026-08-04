import { config } from "dotenv";
import path from "path";
import postgres from "postgres";
import { normalizeDatabaseUrl } from "./client";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(normalizeDatabaseUrl(url), { max: 1, prepare: false });

async function migrate() {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  await sql`
    DO $$ BEGIN
      CREATE TYPE vertical AS ENUM ('travel');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`
    DO $$ BEGIN
      CREATE TYPE channel_type AS ENUM ('whatsapp', 'email');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`
    DO $$ BEGIN
      CREATE TYPE knowledge_source_type AS ENUM ('upload', 'url', 'manual', 'tour_field');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`
    DO $$ BEGIN
      CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`
    DO $$ BEGIN
      CREATE TYPE message_sender AS ENUM ('customer', 'agent', 'human', 'system');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`
    DO $$ BEGIN
      CREATE TYPE intent AS ENUM (
        'pre_trip_faq', 'booking_status', 'availability', 'sales_lead',
        'refund', 'complaint', 'other'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`
    DO $$ BEGIN
      CREATE TYPE inquiry_status AS ENUM ('pending', 'auto_resolved', 'escalated');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`
    DO $$ BEGIN
      CREATE TYPE agent_action AS ENUM ('auto_reply', 'escalate', 'noop');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`
    DO $$ BEGIN
      CREATE TYPE autonomy_mode AS ENUM ('auto', 'escalate');
    EXCEPTION WHEN duplicate_object THEN null; END $$`;

  await sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      vertical vertical NOT NULL DEFAULT 'travel',
      brand_voice text DEFAULT 'Friendly, clear, and helpful. Keep answers concise and practical for travelers.',
      timezone text NOT NULL DEFAULT 'UTC',
      escalate_email text,
      escalate_phone text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      name text NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS memberships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'admin',
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS memberships_org_user_idx ON memberships(org_id, user_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS channel_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      type channel_type NOT NULL,
      label text NOT NULL,
      external_id text,
      config jsonb DEFAULT '{}'::jsonb,
      connected boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS channel_accounts_org_idx ON channel_accounts(org_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS autonomy_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      intent intent NOT NULL,
      mode autonomy_mode NOT NULL DEFAULT 'escalate'
    )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS autonomy_org_intent_idx ON autonomy_settings(org_id, intent)`;

  await sql`
    CREATE TABLE IF NOT EXISTS tours_products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name text NOT NULL,
      slug text NOT NULL,
      description text,
      duration text,
      meeting_point text,
      pickup_details text,
      what_to_bring text,
      inclusions text,
      exclusions text,
      cancellation_policy text,
      price_from text,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS tours_org_idx ON tours_products(org_id)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS tours_org_slug_idx ON tours_products(org_id, slug)`;

  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_sources (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      type knowledge_source_type NOT NULL,
      title text NOT NULL,
      content text NOT NULL,
      metadata jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS knowledge_sources_org_idx ON knowledge_sources(org_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
      content text NOT NULL,
      embedding vector(1536),
      metadata jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS knowledge_chunks_org_idx ON knowledge_chunks(org_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel channel_type NOT NULL,
      channel_account_id uuid REFERENCES channel_accounts(id),
      external_thread_id text,
      customer_name text,
      customer_handle text NOT NULL,
      subject text,
      status text NOT NULL DEFAULT 'open',
      last_message_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS conversations_org_idx ON conversations(org_id)`;
  await sql`CREATE INDEX IF NOT EXISTS conversations_thread_idx ON conversations(org_id, channel, external_thread_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      direction message_direction NOT NULL,
      sender message_sender NOT NULL,
      body text NOT NULL,
      external_id text,
      metadata jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS inquiries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      message_id uuid REFERENCES messages(id),
      intent intent NOT NULL DEFAULT 'other',
      status inquiry_status NOT NULL DEFAULT 'pending',
      summary text,
      created_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz
    )`;
  await sql`CREATE INDEX IF NOT EXISTS inquiries_org_idx ON inquiries(org_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      inquiry_id uuid NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
      intent intent NOT NULL,
      confidence real NOT NULL DEFAULT 0,
      action agent_action NOT NULL,
      draft_reply text,
      citations jsonb DEFAULT '[]'::jsonb,
      retrieved_chunk_ids jsonb DEFAULT '[]'::jsonb,
      reasoning text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS agent_runs_org_idx ON agent_runs(org_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS escalations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      inquiry_id uuid NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
      reason text NOT NULL,
      context_pack jsonb DEFAULT '{}'::jsonb,
      suggested_reply text,
      resolved boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS escalations_org_idx ON escalations(org_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS digest_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      period_start timestamptz NOT NULL,
      period_end timestamptz NOT NULL,
      auto_resolved_count integer NOT NULL DEFAULT 0,
      escalated_count integer NOT NULL DEFAULT 0,
      payload jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
      inquiry_id uuid REFERENCES inquiries(id) ON DELETE SET NULL,
      channel text,
      customer_handle text,
      pax_adults integer,
      pax_children integer,
      pax_total integer,
      travel_dates text,
      destination text,
      interests jsonb DEFAULT '[]'::jsonb,
      missing_fields jsonb DEFAULT '[]'::jsonb,
      raw_message text,
      status text NOT NULL DEFAULT 'open',
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS leads_org_idx ON leads(org_id)`;

  console.log("Migration complete");
  await sql.end({ timeout: 5 });
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
