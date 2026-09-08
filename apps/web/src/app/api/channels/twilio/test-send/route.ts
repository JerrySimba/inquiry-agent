import { NextResponse } from "next/server";
import { sendTwilioWhatsAppText } from "@inquiry/channels";
import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { to?: string; message?: string };
  const to = (body.to ?? "").trim();
  if (!to) {
    return NextResponse.json({ error: "Recipient phone required (e.g. 254794542527)" }, { status: 400 });
  }

  const account = await repo.getChannel(session.orgId, "whatsapp");
  if (!account) {
    return NextResponse.json({ error: "WhatsApp channel missing" }, { status: 404 });
  }

  const config = (account.config ?? {}) as Record<string, string>;
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || config.accountSid || "").trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || config.authToken || "").trim();
  const from = (
    process.env.TWILIO_WHATSAPP_FROM ||
    config.whatsappFrom ||
    account.externalId ||
    ""
  ).trim();

  if (!accountSid || !authToken || !from) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing Twilio credentials or WhatsApp From number. Save Twilio connection first.",
      },
      { status: 400 }
    );
  }

  const message =
    body.message?.trim() ||
    "Inquiry Agent test: if you see this, Twilio WhatsApp outbound is working.";

  const send = await sendTwilioWhatsAppText({
    accountSid,
    authToken,
    from,
    to,
    body: message,
  });

  await repo.updateChannel(account.id, {
    config: {
      ...config,
      provider: "twilio",
      lastSendOk: send.ok ? "true" : "false",
      lastSendError: send.error ?? "",
      lastSendAt: new Date().toISOString(),
      lastTestTo: to,
    },
  });

  return NextResponse.json({
    ok: send.ok,
    id: send.id,
    error: send.error,
    from,
    to,
    hint: send.ok
      ? "Outbound works. Reply from your phone to the Twilio WhatsApp number, then check Inbox."
      : "Twilio rejected the send. For sandbox, join the sandbox first and use the sandbox From number.",
  });
}
