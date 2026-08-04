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

  if (!body.phoneNumberId || !body.accessToken) {
    return NextResponse.json(
      { error: "phoneNumberId and accessToken are required" },
      { status: 400 }
    );
  }

  const existing = await repo.getChannel(session.orgId, "whatsapp");
  if (!existing) {
    return NextResponse.json({ error: "WhatsApp channel row missing" }, { status: 404 });
  }

  const channel = await repo.updateChannel(existing.id, {
    label: body.label || "WhatsApp Business",
    externalId: body.phoneNumberId,
    connected: true,
    config: {
      phoneNumberId: body.phoneNumberId,
      accessToken: body.accessToken,
      businessAccountId: body.businessAccountId ?? "",
      verifyToken: body.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || "inquiry-verify-token",
      mode: "live",
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
