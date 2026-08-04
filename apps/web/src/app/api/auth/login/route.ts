import { NextResponse } from "next/server";
import { seedLocalStore } from "@inquiry/db";
import { loginWithPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json()) as { email?: string; password?: string };
  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }
  try {
    await seedLocalStore();
    const session = await loginWithPassword(body.email, body.password);
    if (!session) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    return NextResponse.json({ ok: true, orgId: session.orgId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
