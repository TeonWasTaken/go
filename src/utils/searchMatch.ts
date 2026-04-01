import type { AliasRecord } from "../services/api";

/**
 * Pure function that checks whether a search term matches an AliasRecord
 * via case-insensitive substring matching against alias, destination_url, and title.
 */
export function matchesSearch(record: AliasRecord, term: string): boolean {
  const lowerTerm = term.toLowerCase();
  return (
    record.alias.toLowerCase().includes(lowerTerm) ||
    record.destination_url.toLowerCase().includes(lowerTerm) ||
    record.title.toLowerCase().includes(lowerTerm)
  );
}
