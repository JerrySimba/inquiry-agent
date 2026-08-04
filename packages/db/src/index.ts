export * from "./schema";
export { getDb, type Db, useLocalStore, normalizeDatabaseUrl } from "./client";
export { localRepo, seedLocalStore as seedFileStore } from "./repo";
export { pgRepo, seedPgStore } from "./pg-repo";

import { useLocalStore } from "./client";
import { localRepo, seedLocalStore as seedFileStore } from "./repo";
import { pgRepo, seedPgStore } from "./pg-repo";

/** Active data access layer — Neon/Postgres unless USE_LOCAL_STORE=true */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const repo: typeof pgRepo = new Proxy({} as typeof pgRepo, {
  get(_target, prop) {
    const active = useLocalStore() ? localRepo : pgRepo;
    const value = (active as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(active) : value;
  },
});

/** Seed pilot org into whichever store is active */
export async function seedLocalStore() {
  if (useLocalStore()) return seedFileStore();
  return seedPgStore();
}
