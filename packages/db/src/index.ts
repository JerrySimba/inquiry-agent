export * from "./schema";
export { getDb, type Db, useLocalStore, normalizeDatabaseUrl } from "./client";
export { localRepo, seedLocalStore as seedFileStore } from "./repo";
export { pgRepo, seedPgStore } from "./pg-repo";

import { useLocalStore } from "./client";
import { localRepo, seedLocalStore as seedFileStore } from "./repo";
import { pgRepo, seedPgStore } from "./pg-repo";

type Repo = typeof localRepo;

/** Active data access layer — Neon/Postgres unless USE_LOCAL_STORE=true */
export const repo: Repo = new Proxy(localRepo, {
  get(_target, prop, receiver) {
    const active = useLocalStore() ? localRepo : (pgRepo as unknown as Repo);
    const value = Reflect.get(active, prop, receiver);
    return typeof value === "function" ? value.bind(active) : value;
  },
}) as Repo;

/** Seed pilot org into whichever store is active */
export async function seedLocalStore() {
  if (useLocalStore()) return seedFileStore();
  return seedPgStore();
}
