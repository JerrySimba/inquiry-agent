import { NextResponse } from "next/server";
import { syncGmailForOrg } from "@/lib/gmail-sync";
import { readSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const summary = await syncGmailForOrg(session.orgId);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gmail sync failed" },
      { status: 400 }
    );
  }
}
