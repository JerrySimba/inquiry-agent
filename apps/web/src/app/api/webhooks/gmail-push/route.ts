import { NextResponse } from "next/server";
import { parseGmailPushData } from "@inquiry/channels";
import { syncGmailByEmailAddress } from "@/lib/gmail-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Google Pub/Sub push endpoint.
 * Configure subscription push URL to:
 *   https://YOUR-APP.vercel.app/api/webhooks/gmail-push?token=GMAIL_PUSH_TOKEN
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const expected = process.env.GMAIL_PUSH_TOKEN;
  if (expected && url.searchParams.get("token") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    message?: { data?: string; messageId?: string };
  };

  if (!body.message?.data) {
    // Pub/Sub sometimes sends empty ack challenges
    return NextResponse.json({ ok: true });
  }

  const parsed = parseGmailPushData(body.message.data);
  if (!parsed.emailAddress) {
    return NextResponse.json({ ok: true, skipped: "no emailAddress" });
  }

  try {
    const result = await syncGmailByEmailAddress(parsed.emailAddress);
    return NextResponse.json({
      ok: true,
      email: parsed.emailAddress,
      historyId: parsed.historyId,
      processed: result.processed,
    });
  } catch (err) {
    console.error("gmail push sync failed", err);
    // Return 200 so Pub/Sub doesn't retry forever on config issues;
    // cron polling remains a safety net.
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "sync failed",
    });
  }
}
