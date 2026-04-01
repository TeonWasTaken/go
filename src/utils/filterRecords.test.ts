import { describe, expect, it } from "vitest";
import type { AliasRecord } from "../services/api";
import { filterRecords } from "./filterRecords";

function makeRecord(
  overrides: Partial<AliasRecord> & {
    expiry_status: AliasRecord["expiry_status"];
  },
): AliasRecord {
  return {
    id: "1",
    alias: "test",
    destination_url: "https://example.com",
    created_by: "user",
    title: "Test",
    click_count: 0,
    heat_score: 0,
    heat_updated_at: null,
    is_private: false,
    created_at: "2024-01-01T00:00:00Z",
    last_accessed_at: null,
    expiry_policy_type: "never",
    duration_months: null,
    custom_expires_at: null,
    expires_at: null,
    expired_at: null,
    icon_url: null,
    ...overrides,
  };
}

describe("filterRecords", () => {
  const records: AliasRecord[] = [
    makeRecord({ id: "1", expiry_status: "active" }),
    makeRecord({ id: "2", expiry_status: "expiring_soon" }),
    makeRecord({ id: "3", expiry_status: "expired" }),
    makeRecord({ id: "4", expiry_status: "no_expiry" }),
    makeRecord({ id: "5", expiry_status: "active" }),
  ];

  it('returns all records when filter is "all"', () => {
    expect(filterRecords(records, "all")).toEqual(records);
  });

  it('returns only active records when filter is "active"', () => {
    const result = filterRecords(records, "active");
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.expiry_status === "active")).toBe(true);
  });

  it('returns only expiring_soon records when filter is "expiring_soon"', () => {
    const result = filterRecords(records, "expiring_soon");
    expect(result).toHaveLength(1);
    expect(result[0].expiry_status).toBe("expiring_soon");
  });

  it('returns only expired records when filter is "expired"', () => {
    const result = filterRecords(records, "expired");
    expect(result).toHaveLength(1);
    expect(result[0].expiry_status).toBe("expired");
  });

  it("returns empty array when no records match the filter", () => {
    const activeOnly = [makeRecord({ expiry_status: "active" })];
    expect(filterRecords(activeOnly, "expired")).toEqual([]);
  });

  it("returns empty array when input is empty", () => {
    expect(filterRecords([], "active")).toEqual([]);
  });
});
