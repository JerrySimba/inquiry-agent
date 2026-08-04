import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    if (Array.isArray(value)) return value as number[];
    if (typeof value === "string") {
      return value
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((n) => !Number.isNaN(n));
    }
    return [];
  },
});

export const verticalEnum = pgEnum("vertical", ["travel"]);
export const channelTypeEnum = pgEnum("channel_type", ["whatsapp", "email"]);
export const knowledgeSourceTypeEnum = pgEnum("knowledge_source_type", [
  "upload",
  "url",
  "manual",
  "tour_field",
]);
export const messageDirectionEnum = pgEnum("message_direction", [
  "inbound",
  "outbound",
]);
export const messageSenderEnum = pgEnum("message_sender", [
  "customer",
  "agent",
  "human",
  "system",
]);
export const intentEnum = pgEnum("intent", [
  "pre_trip_faq",
  "booking_status",
  "availability",
  "sales_lead",
  "refund",
  "complaint",
  "other",
]);
export const inquiryStatusEnum = pgEnum("inquiry_status", [
  "pending",
  "auto_resolved",
  "escalated",
]);
export const agentActionEnum = pgEnum("agent_action", [
  "auto_reply",
  "escalate",
  "noop",
]);
export const autonomyModeEnum = pgEnum("autonomy_mode", ["auto", "escalate"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  vertical: verticalEnum("vertical").notNull().default("travel"),
  brandVoice: text("brand_voice").default(
    "Friendly, clear, and helpful. Keep answers concise and practical for travelers."
  ),
  timezone: text("timezone").notNull().default("UTC"),
  escalateEmail: text("escalate_email"),
  escalatePhone: text("escalate_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("memberships_org_user_idx").on(t.orgId, t.userId)]
);

export const channelAccounts = pgTable(
  "channel_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: channelTypeEnum("type").notNull(),
    label: text("label").notNull(),
    externalId: text("external_id"),
    config: jsonb("config").$type<Record<string, string>>().default({}),
    connected: boolean("connected").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("channel_accounts_org_idx").on(t.orgId)]
);

export const autonomySettings = pgTable(
  "autonomy_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    intent: intentEnum("intent").notNull(),
    mode: autonomyModeEnum("mode").notNull().default("escalate"),
  },
  (t) => [uniqueIndex("autonomy_org_intent_idx").on(t.orgId, t.intent)]
);

export const toursProducts = pgTable(
  "tours_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    duration: text("duration"),
    meetingPoint: text("meeting_point"),
    pickupDetails: text("pickup_details"),
    whatToBring: text("what_to_bring"),
    inclusions: text("inclusions"),
    exclusions: text("exclusions"),
    cancellationPolicy: text("cancellation_policy"),
    priceFrom: text("price_from"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("tours_org_idx").on(t.orgId),
    uniqueIndex("tours_org_slug_idx").on(t.orgId, t.slug),
  ]
);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: knowledgeSourceTypeEnum("type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("knowledge_sources_org_idx").on(t.orgId)]
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    embedding: vector("embedding"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("knowledge_chunks_org_idx").on(t.orgId)]
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channel: channelTypeEnum("channel").notNull(),
    channelAccountId: uuid("channel_account_id").references(() => channelAccounts.id),
    externalThreadId: text("external_thread_id"),
    customerName: text("customer_name"),
    customerHandle: text("customer_handle").notNull(),
    subject: text("subject"),
    status: text("status").notNull().default("open"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("conversations_org_idx").on(t.orgId),
    index("conversations_thread_idx").on(t.orgId, t.channel, t.externalThreadId),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    sender: messageSenderEnum("sender").notNull(),
    body: text("body").notNull(),
    externalId: text("external_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId)]
);

export const inquiries = pgTable(
  "inquiries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id),
    intent: intentEnum("intent").notNull().default("other"),
    status: inquiryStatusEnum("status").notNull().default("pending"),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("inquiries_org_idx").on(t.orgId)]
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    intent: intentEnum("intent").notNull(),
    confidence: real("confidence").notNull().default(0),
    action: agentActionEnum("action").notNull(),
    draftReply: text("draft_reply"),
    citations: jsonb("citations").$type<Array<{ source: string; excerpt: string }>>().default([]),
    retrievedChunkIds: jsonb("retrieved_chunk_ids").$type<string[]>().default([]),
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agent_runs_org_idx").on(t.orgId)]
);

export const escalations = pgTable(
  "escalations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    contextPack: jsonb("context_pack").$type<Record<string, unknown>>().default({}),
    suggestedReply: text("suggested_reply"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("escalations_org_idx").on(t.orgId)]
);

export const digestLogs = pgTable("digest_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  autoResolvedCount: integer("auto_resolved_count").notNull().default(0),
  escalatedCount: integer("escalated_count").notNull().default(0),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id, { onDelete: "set null" }),
    channel: text("channel"),
    customerHandle: text("customer_handle"),
    paxAdults: integer("pax_adults"),
    paxChildren: integer("pax_children"),
    paxTotal: integer("pax_total"),
    travelDates: text("travel_dates"),
    destination: text("destination"),
    interests: jsonb("interests").$type<string[]>().default([]),
    missingFields: jsonb("missing_fields").$type<string[]>().default([]),
    rawMessage: text("raw_message"),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("leads_org_idx").on(t.orgId)]
);

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type TourProduct = typeof toursProducts.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Inquiry = typeof inquiries.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type Escalation = typeof escalations.$inferSelect;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type Intent =
  | "pre_trip_faq"
  | "booking_status"
  | "availability"
  | "sales_lead"
  | "refund"
  | "complaint"
  | "other";
