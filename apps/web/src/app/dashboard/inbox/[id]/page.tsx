import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";
import { notFound } from "next/navigation";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await readSession();
  if (!session) return null;

  const conversation = await repo.getConversation(id);
  if (!conversation || conversation.orgId !== session.orgId) notFound();

  const msgs = await repo.listMessages(id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">
          {conversation.customerName ?? conversation.customerHandle}
        </h1>
        <p className="mt-2 text-ink/65">
          {conversation.channel} · {conversation.subject ?? "Conversation"}
        </p>
      </header>
      <div className="panel space-y-3 p-5">
        {msgs.map((m) => (
          <div
            key={m.id}
            className={`max-w-xl rounded-2xl px-4 py-3 text-sm ${
              m.direction === "inbound"
                ? "bg-white border border-black/10"
                : "ml-auto bg-lagoon text-white"
            }`}
          >
            <p className="mb-1 text-[11px] uppercase opacity-70">
              {m.sender} · {new Date(m.createdAt).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
