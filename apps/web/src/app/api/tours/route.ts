import { NextResponse } from "next/server";
import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";
import { syncTourToKnowledge } from "@/lib/knowledge";

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Record<string, string>;
  if (!body.name || !body.slug) {
    return NextResponse.json({ error: "name and slug required" }, { status: 400 });
  }

  const tour = await repo.createTour({
    orgId: session.orgId,
    name: body.name,
    slug: body.slug,
    description: body.description,
    duration: body.duration,
    meetingPoint: body.meetingPoint,
    pickupDetails: body.pickupDetails,
    whatToBring: body.whatToBring,
    inclusions: body.inclusions,
    exclusions: body.exclusions,
    cancellationPolicy: body.cancellationPolicy,
    priceFrom: body.priceFrom,
  });

  await syncTourToKnowledge(session.orgId, tour.id);
  return NextResponse.json({ tour });
}
