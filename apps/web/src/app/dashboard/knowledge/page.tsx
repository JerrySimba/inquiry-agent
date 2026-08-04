import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";
import { KnowledgeForm } from "./knowledge-form";

export default async function KnowledgePage() {
  const session = await readSession();
  if (!session) return null;

  const sources = await repo.listKnowledgeSources(session.orgId);
  const chunks = await repo.listKnowledgeChunks(session.orgId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Company brain</h1>
        <p className="mt-2 text-ink/65">
          Upload FAQs and policies. Retrieval is always filtered by your org.
        </p>
        <p className="mt-1 text-sm text-ink/50">{chunks.length} chunks indexed</p>
      </header>

      <KnowledgeForm />

      <div className="space-y-3">
        {sources.map((s) => (
          <article key={s.id} className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl">{s.title}</h2>
              <span className="text-xs uppercase tracking-wide text-ink/50">{s.type}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-ink/70">
              {s.content.slice(0, 400)}
              {s.content.length > 400 ? "…" : ""}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
