import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "./client";
import {
  autonomySettings,
  channelAccounts,
  knowledgeChunks,
  knowledgeSources,
  memberships,
  organizations,
  toursProducts,
  users,
} from "./schema";

const INTENTS = [
  "pre_trip_faq",
  "booking_status",
  "availability",
  "sales_lead",
  "refund",
  "complaint",
  "other",
] as const;

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

async function seed() {
  const db = getDb();

  const existing = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "sunset-tours"))
    .limit(1);

  if (existing.length) {
    console.log("Seed already applied (sunset-tours exists)");
    process.exit(0);
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

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const [user] = await db
    .insert(users)
    .values({
      email: "owner@sunset-tours.example",
      name: "Ayu Pilot",
      passwordHash,
    })
    .returning();

  await db.insert(memberships).values({
    orgId: org.id,
    userId: user.id,
    role: "admin",
  });

  await db.insert(channelAccounts).values([
    {
      orgId: org.id,
      type: "whatsapp",
      label: "WhatsApp Business",
      externalId: "demo-wa-phone",
      connected: true,
      config: { mode: "demo" },
    },
    {
      orgId: org.id,
      type: "email",
      label: "Support inbox",
      externalId: "hello@sunset-tours.example",
      connected: true,
      config: { mode: "demo" },
    },
  ]);

  await db.insert(autonomySettings).values(
    INTENTS.map((intent) => ({
      orgId: org.id,
      intent,
      mode: intent === "pre_trip_faq" ? ("auto" as const) : ("escalate" as const),
    }))
  );

  const [tour] = await db
    .insert(toursProducts)
    .values({
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
    })
    .returning();

  const [tour2] = await db
    .insert(toursProducts)
    .values({
      orgId: org.id,
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
    })
    .returning();

  const docs = [
    {
      title: `${tour.name} FAQ`,
      content: [
        `Tour: ${tour.name}`,
        `Duration: ${tour.duration}`,
        `Meeting point: ${tour.meetingPoint}`,
        `Pickup: ${tour.pickupDetails}`,
        `What to bring: ${tour.whatToBring}`,
        `Inclusions: ${tour.inclusions}`,
        `Exclusions: ${tour.exclusions}`,
        `Cancellation: ${tour.cancellationPolicy}`,
        `Price from: ${tour.priceFrom}`,
      ].join("\n"),
      tourId: tour.id,
    },
    {
      title: `${tour2.name} FAQ`,
      content: [
        `Tour: ${tour2.name}`,
        `Duration: ${tour2.duration}`,
        `Meeting point: ${tour2.meetingPoint}`,
        `Pickup: ${tour2.pickupDetails}`,
        `What to bring: ${tour2.whatToBring}`,
        `Inclusions: ${tour2.inclusions}`,
        `Exclusions: ${tour2.exclusions}`,
        `Cancellation: ${tour2.cancellationPolicy}`,
        `Price from: ${tour2.priceFrom}`,
      ].join("\n"),
      tourId: tour2.id,
    },
    {
      title: "General guest policies",
      content:
        "Temple dress code: shoulders and knees covered. Monkeys at Uluwatu may snatch loose items — secure bags and glasses. Children under 5 join free on Uluwatu tour without Kecak seat guarantee.",
      tourId: null as string | null,
    },
  ];

  for (const doc of docs) {
    const [source] = await db
      .insert(knowledgeSources)
      .values({
        orgId: org.id,
        type: doc.tourId ? "tour_field" : "manual",
        title: doc.title,
        content: doc.content,
        metadata: doc.tourId ? { tourId: doc.tourId } : {},
      })
      .returning();

    const paragraphs = doc.content.split(/\n+/).filter((p) => p.trim().length > 20);
    for (const paragraph of paragraphs) {
      await db.insert(knowledgeChunks).values({
        orgId: org.id,
        sourceId: source.id,
        content: paragraph,
        embedding: demoEmbedding(paragraph),
        metadata: { title: doc.title, tourId: doc.tourId },
      });
    }
  }

  console.log("Seed complete");
  console.log("Login: owner@sunset-tours.example / demo1234");
  console.log(`Org: ${org.name} (${org.id})`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
