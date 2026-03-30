import { describe, expect, it } from "vitest";
import { computeExpiry } from "../../src/shared/expiry-utils.js";

describe("computeExpiry", () => {
  const now = new Date("2024-06-15T12:00:00.000Z");

  describe("default behavior (no policy provided)", () => {
    it("defaults to fixed with duration_months 12", () => {
      const result = computeExpiry({ now });
      expect(result.expiry_policy_type).toBe("fixed");
      expect(result.duration_months).toBe(12);
      expect(result.expiry_status).toBe("active");
      expect(result.expires_at).toBe("2025-06-15T12:00:00.000Z");
    });
  });

  describe("never policy", () => {
    it("returns null expires_at and no_expiry status", () => {
      const result = computeExpiry({ expiry_policy_type: "never", now });
      expect(result.expires_at).toBeNull();
      expect(result.expiry_status).toBe("no_expiry");
      expect(result.expiry_policy_type).toBe("never");
      expect(result.duration_months).toBeNull();
    });
  });

  describe("fixed policy with duration_months", () => {
    it("adds 1 month to created_at", () => {
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        duration_months: 1,
        created_at: "2024-06-15T12:00:00.000Z",
        now,
      });
      expect(result.expires_at).toBe("2024-07-15T12:00:00.000Z");
      expect(result.expiry_status).toBe("active");
      expect(result.duration_months).toBe(1);
    });

    it("adds 3 months to created_at", () => {
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        duration_months: 3,
        created_at: "2024-06-15T12:00:00.000Z",
        now,
      });
      expect(result.expires_at).toBe("2024-09-15T12:00:00.000Z");
      expect(result.duration_months).toBe(3);
    });

    it("adds 12 months to created_at", () => {
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        duration_months: 12,
        created_at: "2024-06-15T12:00:00.000Z",
        now,
      });
      expect(result.expires_at).toBe("2025-06-15T12:00:00.000Z");
      expect(result.duration_months).toBe(12);
    });

    it("uses now when no created_at is provided", () => {
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        duration_months: 3,
        now,
      });
      expect(result.expires_at).toBe("2024-09-15T12:00:00.000Z");
    });
  });

  describe("fixed policy with custom_expires_at", () => {
    it("uses the provided custom date directly", () => {
      const customDate = "2025-12-31T23:59:59.000Z";
      const result = computeExpiry({
        expiry_policy_type: "fixed",
        custom_expires_at: customDate,
        now,
      });
      expect(result.expires_at).toBe(customDate);
      expect(result.expiry_status).toBe("active");
      expect(result.expiry_policy_type).toBe("fixed");
      expect(result.duration_months).toBeNull();
    });
  });

  describe("inactivity policy", () => {
    it("sets expires_at to 12 months from now", () => {
      const result = computeExpiry({
        expiry_policy_type: "inactivity",
        now,
      });
      expect(result.expires_at).toBe("2025-06-15T12:00:00.000Z");
      expect(result.expiry_status).toBe("active");
      expect(result.expiry_policy_type).toBe("inactivity");
      expect(result.duration_months).toBeNull();
    });
  });
});
