import { NextResponse } from "next/server";
import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    phoneNumberId?: string;
    accessToken?: string;
    businessAccountId?: string;
    verifyToken?: string;
    label?: string;
  };

  const phoneNumberId = body.phoneNumberId?.trim();
  const accessToken = body.accessToken?.trim();
  if (!phoneNumberId || !accessToken) {
    return NextResponse.json(
      { error: "phoneNumberId and accessToken are required" },
      { status: 400 }
    );
  }

  const existing = await repo.getChannel(session.orgId, "whatsapp");
  if (!existing) {
    return NextResponse.json({ error: "WhatsApp channel row missing" }, { status: 404 });
  }

  // Validate token can call Graph before saving (fail fast for pilot setup).
  const probe = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const probeData = (await probe.json()) as {
    display_phone_number?: string;
    error?: { message?: string; code?: number };
  };
  if (!probe.ok) {
    return NextResponse.json(
      {
        error:
          probeData.error?.message ??
          "Meta rejected this token/phone number ID. Generate a fresh token in Meta Try it out, then save again.",
      },
      { status: 400 }
    );
  }

  // Register WABA for inbound webhooks when saving credentials.
  const wabaId = (body.businessAccountId ?? "").trim();
  if (wabaId) {
    await fetch(`https://graph.facebook.com/v22.0/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  const channel = await repo.updateChannel(existing.id, {
    label: body.label || "WhatsApp Business",
    externalId: phoneNumberId,
    connected: true,
    config: {
      phoneNumberId,
      accessToken,
      businessAccountId: (body.businessAccountId ?? "").trim(),
      verifyToken:
        body.verifyToken?.trim() ||
        process.env.WHATSAPP_VERIFY_TOKEN ||
        "inquiry-verify-token",
      mode: "live",
      displayPhoneNumber: probeData.display_phone_number ?? "",
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
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/webhooks/whatsapp`,
      verifyToken: body.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || "inquiry-verify-token",
    },
  });
}
