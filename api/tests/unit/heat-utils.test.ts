import { describe, expect, it } from "vitest";
import { computeHeatScore } from "../../src/shared/heat-utils.js";

describe("computeHeatScore", () => {
  const now = new Date("2024-06-15T12:00:00.000Z");

  describe("first access (heat_updated_at is null)", () => {
    it("returns heat_score of 1.0", () => {
      const result = computeHeatScore({
        current_heat_score: 0,
        heat_updated_at: null,
        now,
      });
      expect(result.heat_score).toBe(1.0);
    });

    it("sets heat_updated_at to current UTC time", () => {
      const result = computeHeatScore({
        current_heat_score: 0,
        heat_updated_at: null,
        now,
      });
      expect(result.heat_updated_at).toBe("2024-06-15T12:00:00.000Z");
    });
  });

  describe("immediate re-access (0 hours elapsed)", () => {
    it("adds 1.0 to current heat with no decay", () => {
      const result = computeHeatScore({
        current_heat_score: 5.0,
        heat_updated_at: now.toISOString(),
        now,
      });
      expect(result.heat_score).toBe(6.0);
    });
  });

  describe("decay after exactly one half-life (168 hours)", () => {
    it("halves the heat score then adds 1.0", () => {
      const oneWeekLater = new Date("2024-06-22T12:00:00.000Z");
      const result = computeHeatScore({
        current_heat_score: 10.0,
        heat_updated_at: now.toISOString(),
        now: oneWeekLater,
      });
      // 10 * 2^(-168/168) + 1 = 10 * 0.5 + 1 = 6.0
      expect(result.heat_score).toBeCloseTo(6.0, 10);
    });
  });

  describe("decay after two half-lives (336 hours)", () => {
    it("quarters the heat score then adds 1.0", () => {
      const twoWeeksLater = new Date("2024-06-29T12:00:00.000Z");
      const result = computeHeatScore({
        current_heat_score: 8.0,
        heat_updated_at: now.toISOString(),
        now: twoWeeksLater,
      });
      // 8 * 2^(-336/168) + 1 = 8 * 0.25 + 1 = 3.0
      expect(result.heat_score).toBeCloseTo(3.0, 10);
    });
  });

  describe("partial decay (84 hours = half a half-life)", () => {
    it("applies correct partial decay", () => {
      const halfWeekLater = new Date("2024-06-19T00:00:00.000Z"); // +84 hours
      const result = computeHeatScore({
        current_heat_score: 4.0,
        heat_updated_at: now.toISOString(),
        now: halfWeekLater,
      });
      // 4 * 2^(-84/168) + 1 = 4 * 2^(-0.5) + 1 = 4 * ~0.7071 + 1 ≈ 3.8284
      expect(result.heat_score).toBeCloseTo(4 * Math.SQRT1_2 + 1.0, 10);
    });
  });

  describe("heat_updated_at is always set to now", () => {
    it("updates timestamp on subsequent access", () => {
      const later = new Date("2024-07-01T00:00:00.000Z");
      const result = computeHeatScore({
        current_heat_score: 3.0,
        heat_updated_at: now.toISOString(),
        now: later,
      });
      expect(result.heat_updated_at).toBe("2024-07-01T00:00:00.000Z");
    });
  });

  describe("heat score is always positive", () => {
    it("returns at least 1.0 even after long idle period", () => {
      const farFuture = new Date("2025-06-15T12:00:00.000Z"); // 1 year later
      const result = computeHeatScore({
        current_heat_score: 100.0,
        heat_updated_at: now.toISOString(),
        now: farFuture,
      });
      // After ~52 half-lives, old heat is essentially 0
      expect(result.heat_score).toBeGreaterThanOrEqual(1.0);
      expect(result.heat_score).toBeCloseTo(1.0, 5);
    });
  });
});
