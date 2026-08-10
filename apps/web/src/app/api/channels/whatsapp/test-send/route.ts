import { NextResponse } from "next/server";
import { sendWhatsAppText } from "@inquiry/channels";
import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";

/** Sends a live WhatsApp text using saved credentials and returns Meta's exact error. */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { to?: string; message?: string };
  const to = (body.to ?? "").trim();
  if (!to) {
    return NextResponse.json(
      { error: "Recipient phone required (e.g. 254794542527)" },
      { status: 400 }
    );
  }

  const account = await repo.getChannel(session.orgId, "whatsapp");
  if (!account) {
    return NextResponse.json({ error: "WhatsApp channel missing" }, { status: 404 });
  }

  const config = (account.config ?? {}) as Record<string, string>;
  const accessToken = (
    process.env.WHATSAPP_ACCESS_TOKEN ||
    config.accessToken ||
    ""
  ).trim();
  const phoneNumberId = (
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    config.phoneNumberId ||
    account.externalId ||
    ""
  ).trim();

  if (!accessToken || !phoneNumberId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing access token or phone number ID. Generate a fresh token in Meta → Save WhatsApp connection.",
        hasToken: Boolean(accessToken),
        phoneNumberId: phoneNumberId || null,
      },
      { status: 400 }
    );
  }

  const message =
    body.message?.trim() ||
    "Inquiry Agent test: if you see this, outbound WhatsApp replies are working.";

  const send = await sendWhatsAppText({
    accessToken,
    phoneNumberId,
    to,
    body: message,
  });

  await repo.updateChannel(account.id, {
    config: {
      ...config,
      accessToken,
      phoneNumberId,
      lastSendOk: send.ok ? "true" : "false",
      lastSendError: send.error ?? "",
      lastSendAt: new Date().toISOString(),
      lastTestTo: to,
    },
  });

  // Probe token validity for clearer pilot debugging.
  let tokenProbe: { valid?: boolean; expiresAt?: number | null; error?: string } = {};
  try {
    const probe = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`
    );
    const probeData = (await probe.json()) as {
      data?: { is_valid?: boolean; expires_at?: number };
      error?: { message?: string };
    };
    if (probeData.error?.message) {
      tokenProbe = { error: probeData.error.message };
    } else {
      tokenProbe = {
        valid: probeData.data?.is_valid,
        expiresAt: probeData.data?.expires_at ?? null,
      };
    }
  } catch (e) {
    tokenProbe = { error: e instanceof Error ? e.message : "probe failed" };
  }

  return NextResponse.json({
    ok: send.ok,
    id: send.id,
    error: send.error,
    phoneNumberId,
    to,
    tokenProbe,
    hint: send.ok
      ? "Outbound works. Reply to the business number from this phone, then you should get agent replies."
      : "Meta rejected the send. Most common pilot causes: expired temporary token (regenerate in Meta and re-save), or recipient not added under Try it out.",
  });
}
