import bcrypt from "bcryptjs";
import type {
  AgentRun,
  Conversation,
  Escalation,
  Inquiry,
  Intent,
  KnowledgeChunk,
  KnowledgeSource,
  Message,
  Organization,
  TourProduct,
  User,
} from "./schema";
import {
  loadLocalData,
  newId,
  nowIso,
  resolveStorePath,
  saveLocalData,
  type LocalData,
} from "./local-store";
import fs from "fs";
import path from "path";

function read(): LocalData {
  process.env.LOCAL_STORE_PATH = resolveStorePath();
  return loadLocalData();
}

function write(data: LocalData) {
  process.env.LOCAL_STORE_PATH = resolveStorePath();
  saveLocalData(data);
}

function asDate<T>(row: unknown): T {
  const out = { ...(row as Record<string, unknown>) };
  for (const key of Object.keys(out)) {
    if (key.endsWith("At") || key.endsWith("Start") || key.endsWith("End")) {
      const v = out[key];
      if (typeof v === "string") out[key] = new Date(v);
    }
  }
  return out as T;
}

export const localRepo = {
  async getOrg(orgId: string) {
    return asDate<Organization>(read().organizations.find((o) => o.id === orgId));
  },

  async getOrgBySlug(slug: string) {
    const row = read().organizations.find((o) => o.slug === slug);
    return row ? asDate<Organization>(row) : null;
  },

  async getUserByEmail(email: string) {
    const row = read().users.find((u) => u.email === email.toLowerCase());
    return row ? asDate(row as User & { passwordHash: string }) : null;
  },

  async getMembershipForUser(userId: string) {
    return read().memberships.find((m) => m.userId === userId) ?? null;
  },

  async listChannels(orgId: string) {
    return read()
      .channel_accounts.filter((c) => c.orgId === orgId)
      .map((r) =>
        asDate({
          id: String(r.id),
          orgId: String(r.orgId),
          type: r.type as "whatsapp" | "email",
          label: String(r.label),
          externalId: (r.externalId as string | null) ?? null,
          config: (r.config as Record<string, string>) ?? {},
          connected: Boolean(r.connected),
          createdAt: r.createdAt as Date | string,
        })
      );
  },

  async listConnectedGmailChannels() {
    return read()
      .channel_accounts.filter(
        (c) =>
          c.type === "email" &&
          c.connected &&
          (c.config as Record<string, string> | undefined)?.provider === "gmail"
      )
      .map((r) =>
        asDate({
          id: String(r.id),
          orgId: String(r.orgId),
          type: "email" as const,
          label: String(r.label),
          externalId: (r.externalId as string | null) ?? null,
          config: (r.config as Record<string, string>) ?? {},
          connected: Boolean(r.connected),
          createdAt: r.createdAt as Date | string,
        })
      );
  },

  async getChannel(orgId: string, type: "whatsapp" | "email") {
    const row = read().channel_accounts.find((c) => c.orgId === orgId && c.type === type);
    if (!row) return null;
    return asDate({
      id: String(row.id),
      orgId: String(row.orgId),
      type: row.type as "whatsapp" | "email",
      label: String(row.label),
      externalId: (row.externalId as string | null) ?? null,
      config: (row.config as Record<string, string>) ?? {},
      connected: Boolean(row.connected),
      createdAt: row.createdAt as Date | string,
    });
  },

  async getChannelById(id: string) {
    const row = read().channel_accounts.find((c) => c.id === id);
    if (!row) return null;
    return asDate<{
      id: string;
      orgId: string;
      type: "whatsapp" | "email";
      label: string;
      externalId: string | null;
      config: Record<string, string>;
      connected: boolean;
      createdAt: Date | string;
    }>({
      id: String(row.id),
      orgId: String(row.orgId),
      type: row.type as "whatsapp" | "email",
      label: String(row.label),
      externalId: (row.externalId as string | null) ?? null,
      config: (row.config as Record<string, string>) ?? {},
      connected: Boolean(row.connected),
      createdAt: row.createdAt as Date | string,
    });
  },

  async getChannelByExternal(type: "whatsapp" | "email", externalId: string) {
    const row = read().channel_accounts.find(
      (c) => c.type === type && c.externalId === externalId
    );
    if (!row) return null;
    return this.getChannel(String(row.orgId), type);
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
    const data = read();
    const idx = data.channel_accounts.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error("channel not found");
    const prev = data.channel_accounts[idx];
    data.channel_accounts[idx] = {
      ...prev,
      ...patch,
      config: { ...((prev.config as Record<string, string>) ?? {}), ...(patch.config ?? {}) },
    };
    write(data);
    const row = data.channel_accounts[idx];
    return asDate({
      id: String(row.id),
      orgId: String(row.orgId),
      type: row.type as "whatsapp" | "email",
      label: String(row.label),
      externalId: (row.externalId as string | null) ?? null,
      config: (row.config as Record<string, string>) ?? {},
      connected: Boolean(row.connected),
      createdAt: row.createdAt as Date | string,
    });
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
    const data = read();
    if (!data.leads) data.leads = [];
    const row = {
      id: newId(),
      status: "open",
      createdAt: nowIso(),
      ...input,
    };
    data.leads.push(row);
    write(data);
    return row;
  },

  async listLeads(orgId: string) {
    const data = read();
    return (data.leads ?? [])
      .filter((l) => l.orgId === orgId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  },

  async ensureNewClientAutonomy(orgId: string) {
    const data = read();
    for (const intent of ["sales_lead", "availability", "pre_trip_faq"] as Intent[]) {
      const idx = data.autonomy_settings.findIndex(
        (a) => a.orgId === orgId && a.intent === intent
      );
      if (idx >= 0) {
        data.autonomy_settings[idx] = { ...data.autonomy_settings[idx], mode: "auto" };
      } else {
        data.autonomy_settings.push({
          id: newId(),
          orgId,
          intent,
          mode: "auto",
        });
      }
    }
    write(data);
  },

  async listAutonomy(orgId: string) {
    return read().autonomy_settings.filter((a) => a.orgId === orgId);
  },

  async getAutonomy(orgId: string, intent: Intent) {
    return (
      read().autonomy_settings.find((a) => a.orgId === orgId && a.intent === intent) ?? null
    );
  },

  async updateOrg(
    orgId: string,
    patch: Partial<Pick<Organization, "brandVoice" | "timezone" | "escalateEmail" | "escalatePhone">>
  ) {
    const data = read();
    const idx = data.organizations.findIndex((o) => o.id === orgId);
    if (idx < 0) throw new Error("org not found");
    data.organizations[idx] = { ...data.organizations[idx], ...patch };
    write(data);
  },

  async updateAutonomy(orgId: string, intent: Intent, mode: "auto" | "escalate") {
    const data = read();
    const idx = data.autonomy_settings.findIndex(
      (a) => a.orgId === orgId && a.intent === intent
    );
    if (idx >= 0) data.autonomy_settings[idx] = { ...data.autonomy_settings[idx], mode };
    write(data);
  },

  async listTours(orgId: string) {
    return read()
      .tours_products.filter((t) => t.orgId === orgId)
      .map((r) => asDate<TourProduct>(r));
  },

  async getTour(tourId: string) {
    const row = read().tours_products.find((t) => t.id === tourId);
    return row ? asDate<TourProduct>(row) : null;
  },

  async createTour(input: Omit<TourProduct, "id" | "createdAt" | "updatedAt" | "active"> & { active?: boolean }) {
    const data = read();
    const now = nowIso();
    const tour = {
      id: newId(),
      active: true,
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    data.tours_products.push(tour);
    write(data);
    return asDate<TourProduct>(tour);
  },

  async listKnowledgeSources(orgId: string) {
    return read()
      .knowledge_sources.filter((k) => k.orgId === orgId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((r) => asDate<KnowledgeSource>(r));
  },

  async listKnowledgeChunks(orgId: string) {
    return read()
      .knowledge_chunks.filter((k) => k.orgId === orgId)
      .map((r) => asDate<KnowledgeChunk>(r));
  },

  async createKnowledgeSource(input: {
    orgId: string;
    type: "upload" | "url" | "manual" | "tour_field";
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  }) {
    const data = read();
    const source = {
      id: newId(),
      orgId: input.orgId,
      type: input.type,
      title: input.title,
      content: input.content,
      metadata: input.metadata ?? {},
      createdAt: nowIso(),
    };
    data.knowledge_sources.push(source);
    write(data);
    return asDate<KnowledgeSource>(source);
  },

  async createKnowledgeChunk(input: {
    orgId: string;
    sourceId: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }) {
    const data = read();
    const chunk = {
      id: newId(),
      orgId: input.orgId,
      sourceId: input.sourceId,
      content: input.content,
      embedding: input.embedding,
      metadata: input.metadata ?? {},
      createdAt: nowIso(),
    };
    data.knowledge_chunks.push(chunk);
    write(data);
    return asDate<KnowledgeChunk>(chunk);
  },

  async findConversation(orgId: string, channel: "whatsapp" | "email", threadId: string) {
    const row = read().conversations.find(
      (c) =>
        c.orgId === orgId && c.channel === channel && c.externalThreadId === threadId
    );
    return row ? asDate<Conversation>(row) : null;
  },

  async createConversation(input: Partial<Conversation> & {
    orgId: string;
    channel: "whatsapp" | "email";
    customerHandle: string;
  }) {
    const data = read();
    const now = nowIso();
    const row = {
      id: newId(),
      status: "open",
      lastMessageAt: now,
      createdAt: now,
      ...input,
    };
    data.conversations.push(row);
    write(data);
    return asDate<Conversation>(row);
  },

  async touchConversation(
    id: string,
    patch: Partial<Pick<Conversation, "customerName" | "subject" | "lastMessageAt">>
  ) {
    const data = read();
    const idx = data.conversations.findIndex((c) => c.id === id);
    if (idx < 0) return;
    data.conversations[idx] = {
      ...data.conversations[idx],
      ...patch,
      lastMessageAt: patch.lastMessageAt ?? nowIso(),
    };
    write(data);
  },

  async listConversations(orgId: string) {
    return read()
      .conversations.filter((c) => c.orgId === orgId)
      .sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)))
      .map((r) => asDate<Conversation>(r));
  },

  async getConversation(id: string) {
    const row = read().conversations.find((c) => c.id === id);
    return row ? asDate<Conversation>(row) : null;
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
    const data = read();
    const row = {
      id: newId(),
      createdAt: nowIso(),
      metadata: {},
      ...input,
    };
    data.messages.push(row);
    write(data);
    return asDate<Message>(row);
  },

  async listMessages(conversationId: string) {
    return read()
      .messages.filter((m) => m.conversationId === conversationId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map((r) => asDate<Message>(r));
  },

  async createInquiry(input: {
    orgId: string;
    conversationId: string;
    messageId?: string;
    intent: Intent;
    status?: "pending" | "auto_resolved" | "escalated";
    summary?: string;
  }) {
    const data = read();
    const row = {
      id: newId(),
      status: "pending",
      createdAt: nowIso(),
      resolvedAt: null,
      ...input,
    };
    data.inquiries.push(row);
    write(data);
    return asDate<Inquiry>(row);
  },

  async updateInquiry(
    id: string,
    patch: Partial<Pick<Inquiry, "status" | "resolvedAt" | "intent" | "summary">>
  ) {
    const data = read();
    const idx = data.inquiries.findIndex((i) => i.id === id);
    if (idx < 0) return;
    data.inquiries[idx] = {
      ...data.inquiries[idx],
      ...patch,
      resolvedAt: patch.resolvedAt ? new Date(patch.resolvedAt).toISOString() : data.inquiries[idx].resolvedAt,
    };
    write(data);
  },

  async listInquiries(orgId: string) {
    return read()
      .inquiries.filter((i) => i.orgId === orgId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((r) => asDate<Inquiry>(r));
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
    const data = read();
    const row = {
      id: newId(),
      citations: [],
      retrievedChunkIds: [],
      createdAt: nowIso(),
      ...input,
    };
    data.agent_runs.push(row);
    write(data);
    return asDate<AgentRun>(row);
  },

  async listAgentRuns(orgId: string) {
    return read()
      .agent_runs.filter((r) => r.orgId === orgId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((r) => asDate<AgentRun>(r));
  },

  async createEscalation(input: {
    orgId: string;
    inquiryId: string;
    reason: string;
    contextPack?: Record<string, unknown>;
    suggestedReply?: string;
  }) {
    const data = read();
    const row = {
      id: newId(),
      resolved: false,
      contextPack: {},
      createdAt: nowIso(),
      ...input,
    };
    data.escalations.push(row);
    write(data);
    return asDate<Escalation>(row);
  },

  async listEscalations(orgId: string, onlyOpen = false) {
    return read()
      .escalations.filter((e) => e.orgId === orgId && (!onlyOpen || !e.resolved))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((r) => asDate<Escalation>(r));
  },

  async createDigest(input: {
    orgId: string;
    periodStart: Date;
    periodEnd: Date;
    autoResolvedCount: number;
    escalatedCount: number;
    payload: Record<string, unknown>;
  }) {
    const data = read();
    const row = {
      id: newId(),
      orgId: input.orgId,
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
      autoResolvedCount: input.autoResolvedCount,
      escalatedCount: input.escalatedCount,
      payload: input.payload,
      createdAt: nowIso(),
    };
    data.digest_logs.push(row);
    write(data);
    return asDate(row as never);
  },

  async listDigests(orgId: string) {
    return read()
      .digest_logs.filter((d) => d.orgId === orgId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((r) => asDate(r as never));
  },

  async inquiryStats(orgId: string) {
    const rows = read().inquiries.filter((i) => i.orgId === orgId);
    const map = new Map<string, number>();
    for (const r of rows) map.set(String(r.status), (map.get(String(r.status)) ?? 0) + 1);
    return [...map.entries()].map(([status, count]) => ({ status, count }));
  },
};

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

export async function seedLocalStore() {
  process.env.LOCAL_STORE_PATH = path.resolve(
    process.cwd().includes(`${path.sep}apps${path.sep}`)
      ? path.join(process.cwd(), "..", "..", ".data", "store.json")
      : path.join(process.cwd(), ".data", "store.json")
  );

  const file = process.env.LOCAL_STORE_PATH;
  if (fs.existsSync(file)) {
    const existing = loadLocalData();
    const org = existing.organizations.find((o) => o.slug === "sunset-tours");
    if (org) {
      await localRepo.ensureNewClientAutonomy(String(org.id));
      console.log("Local seed already applied (autonomy refreshed for new-client intents)");
      return org;
    }
  }

  const data = {
    organizations: [] as LocalData["organizations"],
    users: [] as LocalData["users"],
    memberships: [] as LocalData["memberships"],
    channel_accounts: [] as LocalData["channel_accounts"],
    autonomy_settings: [] as LocalData["autonomy_settings"],
    tours_products: [] as LocalData["tours_products"],
    knowledge_sources: [] as LocalData["knowledge_sources"],
    knowledge_chunks: [] as LocalData["knowledge_chunks"],
    conversations: [] as LocalData["conversations"],
    messages: [] as LocalData["messages"],
    inquiries: [] as LocalData["inquiries"],
    agent_runs: [] as LocalData["agent_runs"],
    escalations: [] as LocalData["escalations"],
    digest_logs: [] as LocalData["digest_logs"],
    leads: [] as LocalData["leads"],
  } satisfies LocalData;

  const orgId = newId();
  const userId = newId();
  const now = nowIso();

  data.organizations.push({
    id: orgId,
    name: "Sunset Tours Bali",
    slug: "sunset-tours",
    vertical: "travel",
    brandVoice:
      "Warm and practical. Use short paragraphs. Always mention meeting times clearly.",
    timezone: "Asia/Makassar",
    escalateEmail: "ops@sunset-tours.example",
    escalatePhone: "+62000000000",
    createdAt: now,
  });

  data.users.push({
    id: userId,
    email: "owner@sunset-tours.example",
    name: "Ayu Pilot",
    passwordHash: await bcrypt.hash("demo1234", 10),
    createdAt: now,
  });

  data.memberships.push({
    id: newId(),
    orgId,
    userId,
    role: "admin",
    createdAt: now,
  });

  data.channel_accounts.push(
    {
      id: newId(),
      orgId,
      type: "whatsapp",
      label: "WhatsApp Business",
      externalId: "demo-wa-phone",
      config: { mode: "demo" },
      connected: true,
      createdAt: now,
    },
    {
      id: newId(),
      orgId,
      type: "email",
      label: "Support inbox",
      externalId: "hello@sunset-tours.example",
      config: { mode: "demo" },
      connected: true,
      createdAt: now,
    }
  );

  const intents: Intent[] = [
    "pre_trip_faq",
    "booking_status",
    "availability",
    "sales_lead",
    "refund",
    "complaint",
    "other",
  ];
  for (const intent of intents) {
    const auto =
      intent === "pre_trip_faq" || intent === "sales_lead" || intent === "availability";
    data.autonomy_settings.push({
      id: newId(),
      orgId,
      intent,
      mode: auto ? "auto" : "escalate",
    });
  }

  const tours = [
    {
      id: newId(),
      orgId,
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
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: newId(),
      orgId,
      name: "Nusa Penida Day Trip",
      slug: "nusa-penida-day-trip",
      description: "Full-day island trip covering Kelingking, Broken Beach, and Angel's Billabong.",
      duration: "11–12 hours",
      meetingPoint: "Sanur Harbour fast-boat counter, booth B3 (Sunset Tours).",
      pickupDetails: "Pickup from Ubud/Seminyak hotels at 06:30–07:00. Return by ~19:30.",
      whatToBring: "Swimwear, towel, dry bag, motion sickness tablets if needed, cash for lunch.",
      inclusions: "Fast boat tickets, private car on island, driver, entrance fees, lunch.",
      exclusions: "Snorkeling add-on, GoPro rental, tips.",
      cancellationPolicy:
        "Free cancellation up to 48 hours before departure. Weather cancellations can be rebooked or refunded in full.",
      priceFrom: "IDR 1,250,000 per person",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
  data.tours_products.push(...tours);

  for (const tour of tours) {
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
    const sourceId = newId();
    data.knowledge_sources.push({
      id: sourceId,
      orgId,
      type: "tour_field",
      title: `${tour.name} FAQ`,
      content,
      metadata: { tourId: tour.id },
      createdAt: now,
    });
    for (const paragraph of content.split("\n").filter((p) => p.length > 20)) {
      data.knowledge_chunks.push({
        id: newId(),
        orgId,
        sourceId,
        content: paragraph,
        embedding: demoEmbedding(paragraph),
        metadata: { title: `${tour.name} FAQ`, tourId: tour.id },
        createdAt: now,
      });
    }
  }

  const general = {
    id: newId(),
    orgId,
    type: "manual",
    title: "General guest policies",
    content:
      "Temple dress code: shoulders and knees covered. Monkeys at Uluwatu may snatch loose items — secure bags and glasses. Children under 5 join free on Uluwatu tour without Kecak seat guarantee.",
    metadata: {},
    createdAt: now,
  };
  data.knowledge_sources.push(general);
  data.knowledge_chunks.push({
    id: newId(),
    orgId,
    sourceId: general.id,
    content: general.content,
    embedding: demoEmbedding(general.content),
    metadata: { title: general.title },
    createdAt: now,
  });

  write(data);
  console.log("Local seed complete");
  console.log("Login: owner@sunset-tours.example / demo1234");
  return data.organizations[0];
}
