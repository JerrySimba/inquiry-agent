import { repo, type TourProduct } from "@inquiry/db";
import { cosineSimilarity, demoEmbedding, embedText } from "./embeddings";

export type RetrievedChunk = {
  id: string;
  content: string;
  score: number;
  source: string;
  metadata: Record<string, unknown>;
};

export async function retrieveKnowledge(
  orgId: string,
  query: string,
  limit = 6
): Promise<RetrievedChunk[]> {
  const queryVec = await embedText(query);
  const chunks = await repo.listKnowledgeChunks(orgId);

  return chunks
    .map((chunk) => {
      const embedding =
        chunk.embedding && chunk.embedding.length
          ? chunk.embedding
          : demoEmbedding(chunk.content);
      return {
        id: chunk.id,
        content: chunk.content,
        score: cosineSimilarity(queryVec, embedding),
        source: String((chunk.metadata as { title?: string } | null)?.title ?? "knowledge"),
        metadata: (chunk.metadata as Record<string, unknown>) ?? {},
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function findRelevantTours(
  orgId: string,
  query: string
): Promise<TourProduct[]> {
  const tours = (await repo.listTours(orgId)).filter((t) => t.active);
  const q = query.toLowerCase();
  const scored = tours
    .map((tour) => {
      const hay = [
        tour.name,
        tour.slug,
        tour.description,
        tour.meetingPoint,
        tour.whatToBring,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      let score = 0;
      for (const token of q.split(/\W+/).filter((t) => t.length > 3)) {
        if (hay.includes(token)) score += 1;
      }
      if (hay.includes("uluwatu") && q.includes("uluwatu")) score += 3;
      if (hay.includes("penida") && q.includes("penida")) score += 3;
      return { tour, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored[0]?.score > 0) return scored.filter((s) => s.score > 0).map((s) => s.tour);
  return tours.slice(0, 2);
}
