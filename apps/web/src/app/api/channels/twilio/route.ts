import { NextResponse } from "next/server";
import { normalizeTwilioPhone, validateTwilioCredentials } from "@inquiry/channels";
import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    accountSid?: string;
    authToken?: string;
    whatsappFrom?: string;
    label?: string;
  };

  const accountSid = body.accountSid?.trim();
  const authToken = body.authToken?.trim();
  const whatsappFrom = body.whatsappFrom?.trim();

  if (!accountSid || !authToken || !whatsappFrom) {
    return NextResponse.json(
      { error: "accountSid, authToken, and whatsappFrom are required" },
      { status: 400 }
    );
  }

  const check = await validateTwilioCredentials({ accountSid, authToken });
  if (!check.ok) {
    return NextResponse.json({ error: check.error ?? "Invalid Twilio credentials" }, { status: 400 });
  }

  const existing = await repo.getChannel(session.orgId, "whatsapp");
  if (!existing) {
    return NextResponse.json({ error: "WhatsApp channel row missing" }, { status: 404 });
  }

  const fromNormalized = normalizeTwilioPhone(whatsappFrom);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const channel = await repo.updateChannel(existing.id, {
    label: body.label || "WhatsApp (Twilio)",
    externalId: fromNormalized,
    connected: true,
    config: {
      provider: "twilio",
      accountSid,
      authToken,
      whatsappFrom: fromNormalized,
      mode: "live",
      twilioAccountName: check.friendlyName ?? "",
      lastSendError: "",
      tokenValidatedAt: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    ok: true,
    channel: {
      id: channel.id,
      connected: channel.connected,
      externalId: channel.externalId,
      provider: "twilio",
      webhookUrl: `${appUrl.replace(/\/$/, "")}/api/webhooks/twilio-whatsapp`,
      hint: "In Twilio Console → Messaging → WhatsApp Sandbox (or your number), set this as the inbound webhook URL (HTTP POST).",
    },
  });
}
