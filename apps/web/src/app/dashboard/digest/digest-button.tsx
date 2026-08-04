"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DigestButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    await fetch("/api/digest", { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button className="btn-primary" onClick={run} disabled={loading}>
      {loading ? "Generating…" : "Generate digest"}
    </button>
  );
}
