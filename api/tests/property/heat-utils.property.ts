import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeHeatScore } from "../../src/shared/heat-utils.js";

// --- Constants ---

const HALF_LIFE_HOURS = 168;

// --- Generators ---

/** Non-negative heat score */
const heatScoreArb = fc.double({ min: 0, max: 1_000_000, noNaN: true });

/** Positive heat score large enough for decay to be observable */
const positiveHeatArb = fc.double({ min: 1, max: 1_000_000, noNaN: true });

/** A reasonable base date (2020–2035) */
const baseDateArb = fc
  .integer({ min: 1577836800000, max: 2051222400000 })
  .map((ms) => new Date(ms));

/** Positive elapsed hours (up to ~2 years) */
const positiveHoursArb = fc.double({ min: 0.001, max: 17520, noNaN: true });

/**
 * Two elapsed-hour values with a meaningful gap (at least 1 hour apart)
 * and capped so the smaller heat values still produce observable decay differences.
 */
const orderedHoursPairArb = fc
  .tuple(
    fc.double({ min: 0.1, max: 5000, noNaN: true }),
    fc.double({ min: 0.1, max: 5000, noNaN: true }),
  )
  .filter(([a, b]) => Math.abs(a - b) >= 1)
  .map(([a, b]) => (a < b ? ([a, b] as const) : ([b, a] as const)));

// Feature: go-url-alias-service, Property 22: Heat score decay is monotonically decreasing over idle time
describe("Property 22: Heat score decay is monotonically decreasing over idle time", () => {
  /**
   * **Validates: Requirements 15.2, 15.3, 15.4, 15.5**
   *
   * For any alias record with a positive heat_score and no intervening redirects,
   * the heat score should decrease over time following the exponential decay formula
   * heat * 2^(-hours/168). After 168 hours (7 days) of inactivity, the heat score
   * should be approximately half of its previous value. The heat score should never
   * become negative. When a redirect occurs, the new heat score should equal the
   * decayed value plus 1.0.
   */

  it("decay is monotonically decreasing: longer idle time produces lower decayed heat", () => {
    fc.assert(
      fc.property(
        positiveHeatArb,
        baseDateArb,
        orderedHoursPairArb,
        (heat, baseDate, [shorterHours, longerHours]) => {
          const baseIso = baseDate.toISOString();

          const earlier = new Date(
            baseDate.getTime() + shorterHours * 3_600_000,
          );
          const later = new Date(baseDate.getTime() + longerHours * 3_600_000);

          const resultEarlier = computeHeatScore({
            current_heat_score: heat,
            heat_updated_at: baseIso,
            now: earlier,
          });

          const resultLater = computeHeatScore({
            current_heat_score: heat,
            heat_updated_at: baseIso,
            now: later,
          });

          // Both get +1.0 increment, so the one with more decay should be smaller
          expect(resultLater.heat_score).toBeLessThan(resultEarlier.heat_score);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("after exactly one half-life (168h), heat is approximately halved before increment", () => {
    fc.assert(
      fc.property(positiveHeatArb, baseDateArb, (heat, baseDate) => {
        const baseIso = baseDate.toISOString();
        const oneHalfLife = new Date(
          baseDate.getTime() + HALF_LIFE_HOURS * 3_600_000,
        );

        const result = computeHeatScore({
          current_heat_score: heat,
          heat_updated_at: baseIso,
          now: oneHalfLife,
        });

        const expected = heat / 2 + 1.0;
        expect(result.heat_score).toBeCloseTo(expected, 5);
      }),
      { numRuns: 200 },
    );
  });

  it("heat score is never negative", () => {
    fc.assert(
      fc.property(
        heatScoreArb,
        baseDateArb,
        positiveHoursArb,
        (heat, baseDate, hours) => {
          const baseIso = baseDate.toISOString();
          const later = new Date(baseDate.getTime() + hours * 3_600_000);

          const result = computeHeatScore({
            current_heat_score: heat,
            heat_updated_at: baseIso,
            now: later,
          });

          expect(result.heat_score).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("new heat equals decayed value plus 1.0 on redirect", () => {
    fc.assert(
      fc.property(
        positiveHeatArb,
        baseDateArb,
        positiveHoursArb,
        (heat, baseDate, hours) => {
          const baseIso = baseDate.toISOString();
          const later = new Date(baseDate.getTime() + hours * 3_600_000);

          const result = computeHeatScore({
            current_heat_score: heat,
            heat_updated_at: baseIso,
            now: later,
          });

          // Compute expected the same way the implementation does:
          // it parses the ISO string of heat_updated_at, so use that parsed value
          const parsedBase = new Date(baseIso).getTime();
          const hoursElapsed = (later.getTime() - parsedBase) / 3_600_000;
          const decayed = heat * Math.pow(2, -hoursElapsed / HALF_LIFE_HOURS);
          const clamped = decayed < 1e-9 ? 0 : decayed;
          const expected = clamped + 1.0;

          expect(result.heat_score).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("first access (null heat_updated_at) always returns 1.0", () => {
    fc.assert(
      fc.property(heatScoreArb, baseDateArb, (heat, now) => {
        const result = computeHeatScore({
          current_heat_score: heat,
          heat_updated_at: null,
          now,
        });

        expect(result.heat_score).toBe(1.0);
      }),
      { numRuns: 100 },
    );
  });

  it("heat_updated_at is always set to the current time", () => {
    fc.assert(
      fc.property(
        heatScoreArb,
        baseDateArb,
        fc.oneof(
          fc.constant(null as string | null),
          baseDateArb.map((d) => d.toISOString() as string | null),
        ),
        (heat, now, updatedAt) => {
          const result = computeHeatScore({
            current_heat_score: heat,
            heat_updated_at: updatedAt,
            now,
          });

          expect(result.heat_updated_at).toBe(now.toISOString());
        },
      ),
      { numRuns: 100 },
    );
  });
});
