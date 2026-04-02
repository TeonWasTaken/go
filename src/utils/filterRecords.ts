import type { AliasRecord } from "../services/api";

export type ExpiryFilter = "all" | "active" | "expiring_soon" | "expired";

export function filterRecords(
  records: AliasRecord[],
  filter: ExpiryFilter,
): AliasRecord[] {
  if (filter === "all") return records;
  if (filter === "active") {
    return records.filter(
      (r) => r.expiry_status === "active" || r.expiry_status === "no_expiry",
    );
  }
  return records.filter((r) => r.expiry_status === filter);
}
