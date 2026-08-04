import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlCached: ReturnType<typeof postgres> | null = null;

/** Neon + some drivers choke on channel_binding=require */
export function normalizeDatabaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("channel_binding");
    if (!parsed.searchParams.get("sslmode")) {
      parsed.searchParams.set("sslmode", "require");
    }
    return parsed.toString();
  } catch {
    return url.replace(/([?&])channel_binding=require&?/, "$1").replace(/[?&]$/, "");
  }
}

export function getSql(connectionString?: string) {
  const url = normalizeDatabaseUrl(connectionString ?? process.env.DATABASE_URL ?? "");
  if (!url) throw new Error("DATABASE_URL is not set");
  if (sqlCached) return sqlCached;
  sqlCached = postgres(url, { max: 10, prepare: false });
  return sqlCached;
}

export function getDb(connectionString?: string) {
  if (cached) return cached;
  const client = getSql(connectionString);
  cached = drizzle(client, { schema });
  return cached;
}

export function useLocalStore() {
  if (process.env.USE_LOCAL_STORE === "true") return true;
  if (process.env.USE_LOCAL_STORE === "false") return false;
  return !process.env.DATABASE_URL;
}

export type Db = ReturnType<typeof getDb>;
