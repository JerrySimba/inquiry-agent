"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function KnowledgeForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Indexing…");
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, type: "manual" }),
    });
    if (!res.ok) {
      setStatus("Failed");
      return;
    }
    setTitle("");
    setContent("");
    setStatus("Indexed");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel space-y-3 p-5">
      <div>
        <label className="label">Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div>
        <label className="label">Content</label>
        <textarea
          className="input min-h-40"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" type="submit">
          Add to brain
        </button>
        {status && <p className="text-sm text-ink/60">{status}</p>}
      </div>
    </form>
  );
}
