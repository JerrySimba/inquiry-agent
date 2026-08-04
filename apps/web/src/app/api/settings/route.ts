import { NextResponse } from "next/server";
import { repo, type Intent } from "@inquiry/db";
import { readSession } from "@/lib/auth";

export async function PUT(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    org: {
      brandVoice: string;
      timezone: string;
      escalateEmail: string;
      escalatePhone: string;
    };
    autonomy: Array<{ intent: Intent; mode: "auto" | "escalate" }>;
  };

  await repo.updateOrg(session.orgId, {
    brandVoice: body.org.brandVoice,
    timezone: body.org.timezone,
    escalateEmail: body.org.escalateEmail,
    escalatePhone: body.org.escalatePhone,
  });

  for (const row of body.autonomy ?? []) {
    await repo.updateAutonomy(session.orgId, row.intent, row.mode);
  }

  return NextResponse.json({ ok: true });
}
