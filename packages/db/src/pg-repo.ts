import { and, asc, desc, eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "./client";
import {
  agentRuns,
  autonomySettings,
  channelAccounts,
  conversations,
  digestLogs,
  escalations,
  inquiries,
  knowledgeChunks,
  knowledgeSources,
  leads,
  memberships,
  messages,
  organizations,
  toursProducts,
  users,
  type Intent,
  type TourProduct,
} from "./schema";

function demoEmbedding(text: string, dims = 1536): number[] {
  const vec = new Array(dims).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const token of tokens) {
    let h = 0;
    for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) >>> 0;
    vec[h % dims] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export const pgRepo = {
  async getOrg(orgId: string) {
    const [row] = await getDb().select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    return row ?? (null as never);
  },

  async getOrgBySlug(slug: string) {
    const [row] = await getDb().select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    return row ?? null;
  },

  async getUserByEmail(email: string) {
    const [row] = await getDb()
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return row ?? null;
  },

  async getMembershipForUser(userId: string) {
    const [row] = await getDb()
      .select()
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .limit(1);
    return row ?? null;
  },

  async listChannels(orgId: string) {
    return getDb().select().from(channelAccounts).where(eq(channelAccounts.orgId, orgId));
  },

  async getChannel(orgId: string, type: "whatsapp" | "email") {
    const [row] = await getDb()
      .select()
      .from(channelAccounts)
      .where(and(eq(channelAccounts.orgId, orgId), eq(channelAccounts.type, type)))
      .limit(1);
    return row ?? null;
  },

  async getChannelById(id: string) {
    const [row] = await getDb()
      .select()
      .from(channelAccounts)
      .where(eq(channelAccounts.id, id))
      .limit(1);
    return row ?? null;
  },

  async getChannelByExternal(type: "whatsapp" | "email", externalId: string) {
    const [row] = await getDb()
      .select()
      .from(channelAccounts)
      .where(and(eq(channelAccounts.type, type), eq(channelAccounts.externalId, externalId)))
      .limit(1);
    return row ?? null;
  },

  async updateChannel(
    id: string,
    patch: {
      label?: string;
      externalId?: string | null;
      config?: Record<string, string>;
      connected?: boolean;
    }
  ) {
    const existing = await this.getChannelById(id);
    if (!existing) throw new Error("channel not found");
    const mergedConfig = {
      ...((existing.config as Record<string, string>) ?? {}),
      ...(patch.config ?? {}),
    };
    const [row] = await getDb()
      .update(channelAccounts)
      .set({
        label: patch.label ?? existing.label,
        externalId: patch.externalId === undefined ? existing.externalId : patch.externalId,
        connected: patch.connected ?? existing.connected,
        config: mergedConfig,
      })
      .where(eq(channelAccounts.id, id))
      .returning();
    return row;
  },

  async createLead(input: {
    orgId: string;
    conversationId?: string;
    inquiryId?: string;
    channel?: string;
    customerHandle?: string;
    paxAdults?: number;
    paxChildren?: number;
    paxTotal?: number;
    travelDates?: string;
    destination?: string;
    interests?: string[];
    missingFields?: string[];
    rawMessage?: string;
  }) {
    const [row] = await getDb()
      .insert(leads)
      .values({
        orgId: input.orgId,
        conversationId: input.conversationId,
        inquiryId: input.inquiryId,
        channel: input.channel,
        customerHandle: input.customerHandle,
        paxAdults: input.paxAdults,
        paxChildren: input.paxChildren,
        paxTotal: input.paxTotal,
        travelDates: input.travelDates,
        destination: input.destination,
        interests: input.interests ?? [],
        missingFields: input.missingFields ?? [],
        rawMessage: input.rawMessage,
      })
      .returning();
    return row;
  },

  async listLeads(orgId: string) {
    return getDb()
      .select()
      .from(leads)
      .where(eq(leads.orgId, orgId))
      .orderBy(desc(leads.createdAt));
  },

  async ensureNewClientAutonomy(orgId: string) {
    for (const intent of ["sales_lead", "availability", "pre_trip_faq"] as Intent[]) {
      const existing = await this.getAutonomy(orgId, intent);
      if (existing) {
        await getDb()
          .update(autonomySettings)
          .set({ mode: "auto" })
          .where(
            and(eq(autonomySettings.orgId, orgId), eq(autonomySettings.intent, intent))
          );
      } else {
        await getDb().insert(autonomySettings).values({ orgId, intent, mode: "auto" });
      }
    }
  },

  async listAutonomy(orgId: string) {
    return getDb().select().from(autonomySettings).where(eq(autonomySettings.orgId, orgId));
  },

  async getAutonomy(orgId: string, intent: Intent) {
    const [row] = await getDb()
      .select()
      .from(autonomySettings)
      .where(and(eq(autonomySettings.orgId, orgId), eq(autonomySettings.intent, intent)))
      .limit(1);
    return row ?? null;
  },

  async updateOrg(
    orgId: string,
    patch: Partial<{
      brandVoice: string | null;
      timezone: string;
      escalateEmail: string | null;
      escalatePhone: string | null;
    }>
  ) {
    await getDb().update(organizations).set(patch).where(eq(organizations.id, orgId));
  },

  async updateAutonomy(orgId: string, intent: Intent, mode: "auto" | "escalate") {
    await getDb()
      .update(autonomySettings)
      .set({ mode })
      .where(and(eq(autonomySettings.orgId, orgId), eq(autonomySettings.intent, intent)));
  },

  async listTours(orgId: string) {
    return getDb().select().from(toursProducts).where(eq(toursProducts.orgId, orgId));
  },

  async getTour(tourId: string) {
    const [row] = await getDb()
      .select()
      .from(toursProducts)
      .where(eq(toursProducts.id, tourId))
      .limit(1);
    return row ?? null;
  },

  async createTour(
    input: Omit<TourProduct, "id" | "createdAt" | "updatedAt" | "active"> & { active?: boolean }
  ) {
    const [row] = await getDb()
      .insert(toursProducts)
      .values({ ...input, active: input.active ?? true })
      .returning();
    return row;
  },

  async listKnowledgeSources(orgId: string) {
    return getDb()
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.orgId, orgId))
      .orderBy(desc(knowledgeSources.createdAt));
  },

  async listKnowledgeChunks(orgId: string) {
    return getDb().select().from(knowledgeChunks).where(eq(knowledgeChunks.orgId, orgId));
  },

  async createKnowledgeSource(input: {
    orgId: string;
    type: "upload" | "url" | "manual" | "tour_field";
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  }) {
    const [row] = await getDb()
      .insert(knowledgeSources)
      .values({
        orgId: input.orgId,
        type: input.type,
        title: input.title,
        content: input.content,
        metadata: input.metadata ?? {},
      })
      .returning();
    return row;
  },

  async createKnowledgeChunk(input: {
    orgId: string;
    sourceId: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }) {
    const [row] = await getDb()
      .insert(knowledgeChunks)
      .values({
        orgId: input.orgId,
        sourceId: input.sourceId,
        content: input.content,
        embedding: input.embedding,
        metadata: input.metadata ?? {},
      })
      .returning();
    return row;
  },

  async findConversation(orgId: string, channel: "whatsapp" | "email", threadId: string) {
    const [row] = await getDb()
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.orgId, orgId),
          eq(conversations.channel, channel),
          eq(conversations.externalThreadId, threadId)
        )
      )
      .limit(1);
    return row ?? null;
  },

  async createConversation(input: {
    orgId: string;
    channel: "whatsapp" | "email";
    customerHandle: string;
    channelAccountId?: string | null;
    externalThreadId?: string | null;
    customerName?: string | null;
    subject?: string | null;
    status?: string;
  }) {
    const [row] = await getDb()
      .insert(conversations)
      .values({
        orgId: input.orgId,
        channel: input.channel,
        customerHandle: input.customerHandle,
        channelAccountId: input.channelAccountId ?? undefined,
        externalThreadId: input.externalThreadId ?? undefined,
        customerName: input.customerName ?? undefined,
        subject: input.subject ?? undefined,
        status: input.status ?? "open",
      })
      .returning();
    return row;
  },

  async touchConversation(
    id: string,
    patch: Partial<{ customerName: string | null; subject: string | null; lastMessageAt: Date }>
  ) {
    await getDb()
      .update(conversations)
      .set({
        ...patch,
        lastMessageAt: patch.lastMessageAt ?? new Date(),
      })
      .where(eq(conversations.id, id));
  },

  async listConversations(orgId: string) {
    return getDb()
      .select()
      .from(conversations)
      .where(eq(conversations.orgId, orgId))
      .orderBy(desc(conversations.lastMessageAt));
  },

  async getConversation(id: string) {
    const [row] = await getDb()
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    return row ?? null;
  },

  async createMessage(input: {
    orgId: string;
    conversationId: string;
    direction: "inbound" | "outbound";
    sender: "customer" | "agent" | "human" | "system";
    body: string;
    externalId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const [row] = await getDb()
      .insert(messages)
      .values({
        orgId: input.orgId,
        conversationId: input.conversationId,
        direction: input.direction,
        sender: input.sender,
        body: input.body,
        externalId: input.externalId,
        metadata: input.metadata ?? {},
      })
      .returning();
    return row;
  },

  async listMessages(conversationId: string) {
    return getDb()
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
  },

  async createInquiry(input: {
    orgId: string;
    conversationId: string;
    messageId?: string;
    intent: Intent;
    status?: "pending" | "auto_resolved" | "escalated";
    summary?: string;
  }) {
    const [row] = await getDb()
      .insert(inquiries)
      .values({
        orgId: input.orgId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        intent: input.intent,
        status: input.status ?? "pending",
        summary: input.summary,
      })
      .returning();
    return row;
  },

  async updateInquiry(
    id: string,
    patch: Partial<{
      status: "pending" | "auto_resolved" | "escalated";
      resolvedAt: Date | null;
      intent: Intent;
      summary: string | null;
    }>
  ) {
    await getDb().update(inquiries).set(patch).where(eq(inquiries.id, id));
  },

  async listInquiries(orgId: string) {
    return getDb()
      .select()
      .from(inquiries)
      .where(eq(inquiries.orgId, orgId))
      .orderBy(desc(inquiries.createdAt));
  },

  async createAgentRun(input: {
    orgId: string;
    inquiryId: string;
    intent: Intent;
    confidence: number;
    action: "auto_reply" | "escalate" | "noop";
    draftReply?: string;
    citations?: Array<{ source: string; excerpt: string }>;
    retrievedChunkIds?: string[];
    reasoning?: string;
  }) {
    const [row] = await getDb()
      .insert(agentRuns)
      .values({
        orgId: input.orgId,
        inquiryId: input.inquiryId,
        intent: input.intent,
        confidence: input.confidence,
        action: input.action,
        draftReply: input.draftReply,
        citations: input.citations ?? [],
        retrievedChunkIds: input.retrievedChunkIds ?? [],
        reasoning: input.reasoning,
      })
      .returning();
    return row;
  },

  async listAgentRuns(orgId: string) {
    return getDb()
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.orgId, orgId))
      .orderBy(desc(agentRuns.createdAt));
  },

  async createEscalation(input: {
    orgId: string;
    inquiryId: string;
    reason: string;
    contextPack?: Record<string, unknown>;
    suggestedReply?: string;
  }) {
    const [row] = await getDb()
      .insert(escalations)
      .values({
        orgId: input.orgId,
        inquiryId: input.inquiryId,
        reason: input.reason,
        contextPack: input.contextPack ?? {},
        suggestedReply: input.suggestedReply,
      })
      .returning();
    return row;
  },

  async listEscalations(orgId: string, onlyOpen = false) {
    const rows = await getDb()
      .select()
      .from(escalations)
      .where(eq(escalations.orgId, orgId))
      .orderBy(desc(escalations.createdAt));
    return onlyOpen ? rows.filter((r) => !r.resolved) : rows;
  },

  async createDigest(input: {
    orgId: string;
    periodStart: Date;
    periodEnd: Date;
    autoResolvedCount: number;
    escalatedCount: number;
    payload: Record<string, unknown>;
  }) {
    const [row] = await getDb()
      .insert(digestLogs)
      .values(input)
      .returning();
    return row;
  },

  async listDigests(orgId: string) {
    return getDb()
      .select()
      .from(digestLogs)
      .where(eq(digestLogs.orgId, orgId))
      .orderBy(desc(digestLogs.createdAt));
  },

  async inquiryStats(orgId: string) {
    const rows = await getDb()
      .select({
        status: inquiries.status,
        count: sql<number>`count(*)::int`,
      })
      .from(inquiries)
      .where(eq(inquiries.orgId, orgId))
      .groupBy(inquiries.status);
    return rows;
  },
};

export async function seedPgStore() {
  const db = getDb();
  const existing = await pgRepo.getOrgBySlug("sunset-tours");
  if (existing) {
    await pgRepo.ensureNewClientAutonomy(existing.id);
    console.log("Neon seed already applied (autonomy refreshed)");
    return existing;
  }

  const [org] = await db
    .insert(organizations)
    .values({
      name: "Sunset Tours Bali",
      slug: "sunset-tours",
      vertical: "travel",
      brandVoice:
        "Warm and practical. Use short paragraphs. Always mention meeting times clearly.",
      timezone: "Asia/Makassar",
      escalateEmail: "ops@sunset-tours.example",
      escalatePhone: "+62000000000",
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      email: "owner@sunset-tours.example",
      name: "Ayu Pilot",
      passwordHash: await bcrypt.hash("demo1234", 10),
    })
    .returning();

  await db.insert(memberships).values({ orgId: org.id, userId: user.id, role: "admin" });

  await db.insert(channelAccounts).values([
    {
      orgId: org.id,
      type: "whatsapp",
      label: "WhatsApp Business",
      externalId: "demo-wa-phone",
      connected: false,
      config: { mode: "demo" },
    },
    {
      orgId: org.id,
      type: "email",
      label: "Gmail",
      externalId: "hello@sunset-tours.example",
      connected: false,
      config: { mode: "demo", provider: "gmail" },
    },
  ]);

  const intents: Intent[] = [
    "pre_trip_faq",
    "booking_status",
    "availability",
    "sales_lead",
    "refund",
    "complaint",
    "other",
  ];
  await db.insert(autonomySettings).values(
    intents.map((intent) => ({
      orgId: org.id,
      intent,
      mode:
        intent === "pre_trip_faq" || intent === "sales_lead" || intent === "availability"
          ? ("auto" as const)
          : ("escalate" as const),
    }))
  );

  const tourRows = await db
    .insert(toursProducts)
    .values([
      {
        orgId: org.id,
        name: "Uluwatu Sunset & Kecak Tour",
        slug: "uluwatu-sunset-kecak",
        description:
          "Half-day tour to Uluwatu Temple with sunset views and Kecak fire dance tickets.",
        duration: "5 hours",
        meetingPoint:
          "Uluwatu Temple main ticket gate, next to the monkey forest entrance sign.",
        pickupDetails:
          "Optional hotel pickup in Seminyak/Canggu between 14:00–14:30. Confirm pickup address 24h before.",
        whatToBring:
          "Comfortable shoes, light cover-up for temple, sunscreen, water bottle, cash for snacks.",
        inclusions: "Entrance ticket, Kecak dance ticket, English-speaking guide, bottled water.",
        exclusions: "Hotel pickup (optional add-on), dinner, personal expenses, tips.",
        cancellationPolicy:
          "Free cancellation up to 24 hours before start time. Within 24 hours, 50% fee. No-shows are non-refundable.",
        priceFrom: "IDR 450,000 per adult",
      },
      {
        orgId: org.id,
        name: "Nusa Penida Day Trip",
        slug: "nusa-penida-day-trip",
        description:
          "Full-day island trip covering Kelingking, Broken Beach, and Angel's Billabong.",
        duration: "11–12 hours",
        meetingPoint: "Sanur Harbour fast-boat counter, booth B3 (Sunset Tours).",
        pickupDetails: "Pickup from Ubud/Seminyak hotels at 06:30–07:00. Return by ~19:30.",
        whatToBring:
          "Swimwear, towel, dry bag, motion sickness tablets if needed, cash for lunch.",
        inclusions: "Fast boat tickets, private car on island, driver, entrance fees, lunch.",
        exclusions: "Snorkeling add-on, GoPro rental, tips.",
        cancellationPolicy:
          "Free cancellation up to 48 hours before departure. Weather cancellations can be rebooked or refunded in full.",
        priceFrom: "IDR 1,250,000 per person",
      },
    ])
    .returning();

  for (const tour of tourRows) {
    const content = [
      `Tour: ${tour.name}`,
      `Duration: ${tour.duration}`,
      `Meeting point: ${tour.meetingPoint}`,
      `Pickup: ${tour.pickupDetails}`,
      `What to bring: ${tour.whatToBring}`,
      `Inclusions: ${tour.inclusions}`,
      `Exclusions: ${tour.exclusions}`,
      `Cancellation: ${tour.cancellationPolicy}`,
      `Price from: ${tour.priceFrom}`,
    ].join("\n");
    const [source] = await db
      .insert(knowledgeSources)
      .values({
        orgId: org.id,
        type: "tour_field",
        title: `${tour.name} FAQ`,
        content,
        metadata: { tourId: tour.id },
      })
      .returning();
    for (const paragraph of content.split("\n").filter((p) => p.length > 20)) {
      await db.insert(knowledgeChunks).values({
        orgId: org.id,
        sourceId: source.id,
        content: paragraph,
        embedding: demoEmbedding(paragraph),
        metadata: { title: `${tour.name} FAQ`, tourId: tour.id },
      });
    }
  }

  console.log("Neon seed complete");
  console.log("Login: owner@sunset-tours.example / demo1234");
  return org;
}
