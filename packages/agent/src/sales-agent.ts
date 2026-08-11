import type { TourProduct } from "@inquiry/db";
import type { RetrievedChunk } from "./retrieve";
import type { FaqDraft } from "./faq-agent";

export type LeadCapture = {
  paxAdults?: number;
  paxChildren?: number;
  paxTotal?: number;
  travelDates?: string;
  destination?: string;
  interests: string[];
  missingFields: string[];
};

function emptyLead(): LeadCapture {
  return { interests: [], missingFields: [] };
}

function computeMissingFields(lead: Omit<LeadCapture, "missingFields">): string[] {
  const missing: string[] = [];
  if (lead.paxTotal == null && lead.paxAdults == null) {
    missing.push("number of guests (pax)");
  }
  if (!lead.travelDates) missing.push("preferred travel date(s)");
  return missing;
}

function mergeLeads(a: LeadCapture, b: LeadCapture): LeadCapture {
  const merged = {
    paxAdults: b.paxAdults ?? a.paxAdults,
    paxChildren: b.paxChildren ?? a.paxChildren,
    paxTotal: b.paxTotal ?? a.paxTotal,
    travelDates: b.travelDates ?? a.travelDates,
    destination: b.destination ?? a.destination,
    interests: [...new Set([...a.interests, ...b.interests])],
    missingFields: [] as string[],
  };
  merged.missingFields = computeMissingFields(merged);
  return merged;
}

function extractLeadFromLine(message: string): LeadCapture {
  const interests: string[] = [];
  const lower = message.toLowerCase();

  if (/uluwatu|kecak|temple/.test(lower)) interests.push("Uluwatu / Kecak");
  if (/penida|nusa/.test(lower)) interests.push("Nusa Penida");
  if (/sunset/.test(lower)) interests.push("sunset");
  if (/snorkel|diving|beach/.test(lower)) interests.push("beach / water");
  if (/family|kids|children/.test(lower)) interests.push("family");
  if (/honeymoon|romantic|couple/.test(lower)) interests.push("couples");
  if (/private|custom/.test(lower)) interests.push("private/custom");

  let paxAdults: number | undefined;
  let paxChildren: number | undefined;
  let paxTotal: number | undefined;

  const adults = message.match(/(\d+)\s*(adults?|pax|people|persons?|guests?)/i);
  const children = message.match(/(\d+)\s*(kids?|children|child)/i);
  const ofUs = message.match(/(?:party|group)\s*(?:of\s*)?(\d+)/i);
  const weAre = message.match(/we\s+are\s+(\d+)/i);
  const forN = message.match(/\bfor\s+(\d+)\s*(adults?|people|guests?|pax)?/i);

  if (adults) paxAdults = Number(adults[1]);
  if (children) paxChildren = Number(children[1]);
  if (ofUs) paxTotal = Number(ofUs[1]);
  if (weAre) paxTotal = Number(weAre[1]);
  if (forN) paxTotal = Number(forN[1]);
  if (paxAdults != null || paxChildren != null) {
    paxTotal = (paxAdults ?? 0) + (paxChildren ?? 0) || paxTotal;
  }

  const datePatterns = [
    /(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?)/i,
    /(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
    /(?:on|for|from)\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
    /(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/,
    /(next\s+(?:week|weekend|month)|this\s+weekend|tomorrow|next\s+saturday|next\s+sunday)/i,
  ];
  let travelDates: string | undefined;
  for (const p of datePatterns) {
    const m = message.match(p);
    if (m) {
      travelDates = (m[1] ?? m[0]).trim();
      break;
    }
  }

  const destinationMatch = message.match(
    /\b(bali|seminyak|canggu|ubud|uluwatu|nusa\s*penida|sanur|jimbaran)\b/i
  );

  const partial = {
    paxAdults,
    paxChildren,
    paxTotal,
    travelDates,
    destination: destinationMatch?.[1],
    interests,
  };

  return {
    ...partial,
    missingFields: computeMissingFields(partial),
  };
}

/** Aggregate lead fields across the whole conversation thread. */
export function extractLead(message: string): LeadCapture {
  const lines = message.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let merged = emptyLead();
  for (const line of lines) {
    merged = mergeLeads(merged, extractLeadFromLine(line));
  }
  return mergeLeads(merged, extractLeadFromLine(message));
}

function isAffirmative(message: string): boolean {
  return /^(yes|yeah|yep|y|ok|okay|sure|proceed|confirm|go\s+ahead)\.?$/i.test(message.trim());
}

function wantsPrivateItinerary(message: string): boolean {
  return /private\s+(itinerary|tour|trip)|custom\s+(itinerary|trip|package)|tailor(?:ed)?/i.test(
    message
  );
}

function formatGuestNote(lead: LeadCapture): string {
  if (lead.paxTotal != null) return `${lead.paxTotal} guests`;
  if (lead.paxAdults != null) {
    return `${lead.paxAdults} adults${lead.paxChildren != null ? `, ${lead.paxChildren} children` : ""}`;
  }
  return "your group";
}

function tourBlurb(tour: TourProduct, compact = false): string {
  if (compact) {
    return `${tour.name} — ${tour.priceFrom ?? "ask for price"}${tour.duration ? ` (${tour.duration})` : ""}`;
  }
  return [
    `${tour.name} — ${tour.priceFrom ?? "ask for price"}`,
    tour.duration ? `Duration: ${tour.duration}` : null,
    tour.description ? tour.description : null,
    tour.inclusions ? `Includes: ${tour.inclusions}` : null,
    tour.meetingPoint ? `Meeting point: ${tour.meetingPoint}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function pickTours(input: {
  tours: TourProduct[];
  lead: LeadCapture;
}): TourProduct[] {
  let matched = input.tours;
  if (input.lead.interests.length) {
    const scored = input.tours
      .map((tour) => {
        const hay = `${tour.name} ${tour.description} ${tour.inclusions}`.toLowerCase();
        let score = 0;
        for (const interest of input.lead.interests) {
          for (const token of interest.toLowerCase().split(/\W+/)) {
            if (token.length > 3 && hay.includes(token)) score += 1;
          }
        }
        return { tour, score };
      })
      .sort((a, b) => b.score - a.score);
    if (scored[0]?.score > 0) matched = scored.filter((s) => s.score > 0).map((s) => s.tour);
  }
  if (!matched.length) matched = input.tours.slice(0, 2);
  return matched;
}

export function draftNewClientReply(input: {
  message: string;
  latestMessage?: string;
  isFollowUp?: boolean;
  brandVoice?: string | null;
  tours: TourProduct[];
  chunks: RetrievedChunk[];
}): FaqDraft & { lead: LeadCapture } {
  const latest = (input.latestMessage ?? input.message).trim();
  const lead = extractLead(input.message);
  const matched = pickTours({ tours: input.tours, lead });
  const isFollowUp = input.isFollowUp ?? input.message.includes("\n");

  const citations: Array<{ source: string; excerpt: string }> = [];
  for (const tour of matched.slice(0, 3)) {
    citations.push({
      source: tour.name,
      excerpt: [tour.priceFrom, tour.duration, tour.description].filter(Boolean).join(" · "),
    });
  }
  for (const chunk of input.chunks.slice(0, 3)) {
    if (chunk.score >= 0.25) {
      citations.push({ source: chunk.source, excerpt: chunk.content.slice(0, 200) });
    }
  }

  const primaryTour = matched[0];
  const guestNote = formatGuestNote(lead);
  const dateNote = lead.travelDates ? ` for ${lead.travelDates}` : "";
  const parts: string[] = [];

  // YES → confirm booking request (don't reset the thread)
  if (isAffirmative(latest) && lead.missingFields.length === 0) {
    parts.push(
      `Perfect — I've logged a booking request for ${guestNote}${dateNote}${primaryTour ? ` on the ${primaryTour.name}` : ""}.`
    );
    parts.push(
      "Our team will confirm availability and send payment details shortly. Reply here if you'd like to add hotel pickup or a private vehicle."
    );
  } else if (wantsPrivateItinerary(latest)) {
    parts.push(
      `Absolutely — we can build a private itinerary for ${guestNote}${dateNote}.`
    );
    if (matched.length) {
      parts.push(
        "Popular starting points:\n" + matched.slice(0, 2).map((t) => tourBlurb(t, true)).join("\n")
      );
    }
    parts.push(
      lead.missingFields.length
        ? `To tailor the route, could you share your ${lead.missingFields.join(" and ")}?`
        : "Tell me which areas you want (e.g. Uluwatu sunset, rice terraces, beaches) and I'll shape a day-by-day outline."
    );
  } else if (isFollowUp && lead.missingFields.length === 0) {
    // Follow-up with complete info — no full catalog repeat
    parts.push(`Got it — ${guestNote}${dateNote}.`);
    if (primaryTour) {
      parts.push(
        `Best fit: ${tourBlurb(primaryTour, true)}. Reply YES to hold a booking request, or ask for a private/custom itinerary.`
      );
    } else {
      parts.push(
        "Reply YES to hold a booking request, or tell me if you'd like a private/custom itinerary."
      );
    }
  } else if (isFollowUp && lead.travelDates && lead.missingFields.length === 1) {
    parts.push(`Thanks — noted ${lead.travelDates} for ${guestNote}.`);
    parts.push(
      `Reply YES to hold a booking request${primaryTour ? ` for the ${primaryTour.name}` : ""}, or tell me if you'd like other tour options.`
    );
  } else {
    // First message or still missing core details
    parts.push("Thanks for getting in touch — happy to help you plan the trip.");
    if (matched.length) {
      parts.push("Here are options that fit what you asked about:\n");
      parts.push(matched.slice(0, 3).map((t) => tourBlurb(t)).join("\n\n"));
    }
    const captured: string[] = [];
    if (lead.paxTotal != null || lead.paxAdults != null) captured.push(guestNote);
    if (lead.travelDates) captured.push(`dates: ${lead.travelDates}`);
    if (captured.length) parts.push(`I've noted: ${captured.join(" · ")}.`);

    if (lead.missingFields.length) {
      parts.push(
        `To check availability and lock a quote, could you share your ${lead.missingFields.join(" and ")}?`
      );
    } else {
      parts.push(
        "I can hold this as a booking request for our team to confirm availability and send payment details shortly. Reply YES to proceed, or tell me if you'd like a private/custom itinerary."
      );
    }
  }

  const grounded = citations.length > 0 && matched.length > 0;
  const confidence = grounded
    ? Math.min(0.93, 0.62 + citations.length * 0.06 + (lead.missingFields.length ? 0.05 : 0.12))
    : 0.4;

  return {
    reply: parts.join("\n\n"),
    confidence,
    citations: citations.slice(0, 6),
    retrievedChunkIds: input.chunks.map((c) => c.id),
    reasoning: grounded
      ? `Sales draft; followUp=${isFollowUp}; interests=${lead.interests.join(",") || "general"}; missing=${lead.missingFields.join(",") || "none"}`
      : "Insufficient catalog match for confident new-client reply",
    lead,
  };
}
