import { NextResponse } from "next/server";
import { buildMorningDigest } from "@inquiry/agent";
import { readSession } from "@/lib/auth";

export async function POST() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const digest = await buildMorningDigest(session.orgId);
  return NextResponse.json(digest);
}
