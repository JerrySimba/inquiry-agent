import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { ingestKnowledgeSource } from "@/lib/knowledge";

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    title?: string;
    content?: string;
    type?: "upload" | "url" | "manual" | "tour_field";
  };

  if (!body.title || !body.content) {
    return NextResponse.json({ error: "title and content required" }, { status: 400 });
  }

  const source = await ingestKnowledgeSource({
    orgId: session.orgId,
    type: body.type ?? "manual",
    title: body.title,
    content: body.content,
  });

  return NextResponse.json({ source });
}
