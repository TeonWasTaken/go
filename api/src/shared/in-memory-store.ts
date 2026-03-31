/**
 * In-memory data store that replaces Cosmos DB for local development.
 *
 * Activated when DEV_MODE=true and COSMOS_CONNECTION_STRING is not set
 * (or set to the placeholder value). Provides the same query semantics
 * as the Cosmos DB container so the rest of the codebase works unchanged.
 */

import { AliasRecord } from "./models.js";

let store: Map<string, AliasRecord> = new Map();

/** Composite key matching Cosmos partition (alias) + id */
function key(alias: string, id: string): string {
  return `${alias}::${id}`;
}

export function clearStore(): void {
  store = new Map();
}

export function seedStore(records: AliasRecord[]): void {
  for (const r of records) {
    store.set(key(r.alias, r.id), r);
  }
}

export function getByPartition(
  alias: string,
  id: string,
): AliasRecord | undefined {
  return store.get(key(alias, id));
}

export function listForUser(
  userEmail: string,
  sort?: "clicks" | "heat",
): AliasRecord[] {
  const results = [...store.values()].filter(
    (r) => !r.is_private || r.created_by === userEmail,
  );
  if (sort === "clicks") results.sort((a, b) => b.click_count - a.click_count);
  else if (sort === "heat") results.sort((a, b) => b.heat_score - a.heat_score);
  return results;
}

export function search(userEmail: string, term: string): AliasRecord[] {
  const lower = term.toLowerCase();
  return [...store.values()].filter(
    (r) =>
      (!r.is_private || r.created_by === userEmail) &&
      (r.alias.toLowerCase().includes(lower) ||
        r.title.toLowerCase().includes(lower)),
  );
}

export function create(record: AliasRecord): AliasRecord {
  store.set(key(record.alias, record.id), { ...record });
  return { ...record };
}

export function replace(record: AliasRecord): AliasRecord {
  store.set(key(record.alias, record.id), { ...record });
  return { ...record };
}

export function remove(alias: string, id: string): void {
  store.delete(key(alias, id));
}

export function queryExpirable(): AliasRecord[] {
  return [...store.values()].filter((r) => r.expiry_policy_type !== "never");
}

export function getPopularGlobal(limit: number): AliasRecord[] {
  return [...store.values()]
    .filter((r) => !r.is_private)
    .sort((a, b) => b.heat_score - a.heat_score)
    .slice(0, limit);
}
