import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

type Row = Record<string, unknown>;

export type LocalData = {
  organizations: Row[];
  users: Row[];
  memberships: Row[];
  channel_accounts: Row[];
  autonomy_settings: Row[];
  tours_products: Row[];
  knowledge_sources: Row[];
  knowledge_chunks: Row[];
  conversations: Row[];
  messages: Row[];
  inquiries: Row[];
  agent_runs: Row[];
  escalations: Row[];
  digest_logs: Row[];
  leads: Row[];
};

const empty = (): LocalData => ({
  organizations: [],
  users: [],
  memberships: [],
  channel_accounts: [],
  autonomy_settings: [],
  tours_products: [],
  knowledge_sources: [],
  knowledge_chunks: [],
  conversations: [],
  messages: [],
  inquiries: [],
  agent_runs: [],
  escalations: [],
  digest_logs: [],
  leads: [],
});

function dataPath() {
  return resolveStorePath();
}

export function loadLocalData(): LocalData {
  const file = dataPath();
  if (!fs.existsSync(file)) return empty();
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<LocalData>;
  return { ...empty(), ...parsed, leads: parsed.leads ?? [] };
}

export function saveLocalData(data: LocalData) {
  const file = dataPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function newId() {
  return randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

/** Resolve store path relative to monorepo root when possible. */
export function resolveStorePath() {
  if (process.env.LOCAL_STORE_PATH) return process.env.LOCAL_STORE_PATH;
  const cwd = process.cwd();
  if (cwd.includes(`${path.sep}apps${path.sep}`) || cwd.endsWith(`${path.sep}apps\\web`) || cwd.endsWith(`${path.sep}apps/web`)) {
    return path.resolve(cwd, "..", "..", ".data", "store.json");
  }
  return path.resolve(cwd, ".data", "store.json");
}
