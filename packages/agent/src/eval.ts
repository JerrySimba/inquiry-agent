import { draftPreTripFaqReply } from "./faq-agent";
import { decidePolicy } from "./policy";
import { routeIntent } from "./router";
import { draftNewClientReply } from "./sales-agent";
import type { TourProduct } from "@inquiry/db";

const sampleTour = {
  id: "t1",
  orgId: "o1",
  name: "Uluwatu Sunset & Kecak Tour",
  slug: "uluwatu-sunset-kecak",
  description: "Half-day tour",
  duration: "5 hours",
  meetingPoint: "Uluwatu Temple main ticket gate",
  pickupDetails: "Seminyak pickup 14:00–14:30",
  whatToBring: "Comfortable shoes, cover-up, sunscreen",
  inclusions: "Entrance + Kecak tickets, guide",
  exclusions: "Dinner, tips",
  cancellationPolicy: "Free cancellation up to 24 hours before start",
  priceFrom: "IDR 450,000",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
} as TourProduct;

const cases = [
  {
    name: "meeting point",
    message: "Hi, where is the meeting point for our booking tomorrow?",
    expectIntent: "pre_trip_faq",
    expectAuto: true,
  },
  {
    name: "new client trip + pax",
    message: "Looking for a Bali trip for 4 adults next Saturday, maybe Uluwatu sunset?",
    expectIntent: "sales_lead",
    expectAuto: true,
  },
  {
    name: "itinerary shopping",
    message: "Do you offer a Nusa Penida day trip itinerary and how much is it?",
    expectIntent: "sales_lead",
    expectAuto: true,
  },
  {
    name: "availability",
    message: "Do you have spots available for the Uluwatu tour this weekend?",
    expectIntent: "availability",
    expectAuto: true,
  },
  {
    name: "refund",
    message: "I need a full refund for my booking right now",
    expectIntent: "refund",
    expectAuto: false,
  },
  {
    name: "complaint",
    message: "This is unacceptable, I want to speak to a manager",
    expectIntent: "complaint",
    expectAuto: false,
  },
];

let passed = 0;
for (const c of cases) {
  const route = routeIntent(c.message);
  const chunks = [
    {
      id: "c1",
      content: `${sampleTour.name}. ${sampleTour.description}. Price ${sampleTour.priceFrom}. Meeting point: ${sampleTour.meetingPoint}`,
      score: 0.8,
      source: sampleTour.name,
      metadata: {},
    },
  ];

  const draft =
    route.intent === "pre_trip_faq"
      ? draftPreTripFaqReply({
          message: c.message,
          tours: [sampleTour],
          chunks,
          brandVoice: "friendly",
        })
      : route.intent === "sales_lead" || route.intent === "availability"
        ? draftNewClientReply({
            message: c.message,
            tours: [sampleTour],
            chunks,
            brandVoice: "friendly",
          })
        : {
            reply: "escalate",
            confidence: route.confidence,
            citations: [],
            retrievedChunkIds: [],
            reasoning: route.reasoning,
          };

  const decision = decidePolicy({
    intent: route.intent,
    autonomyMode: ["pre_trip_faq", "sales_lead", "availability"].includes(route.intent)
      ? "auto"
      : "escalate",
    draft,
    routerConfidence: route.confidence,
  });

  const intentOk = route.intent === c.expectIntent;
  const autoOk = (decision.action === "auto_reply") === c.expectAuto;
  const ok = intentOk && autoOk;
  if (ok) passed += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${c.name} | intent=${route.intent} (expected ${c.expectIntent}) | action=${decision.action}`
  );
}

console.log(`\n${passed}/${cases.length} passed`);
process.exit(passed === cases.length ? 0 : 1);
