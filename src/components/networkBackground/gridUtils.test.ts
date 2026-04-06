import { describe, expect, it } from "vitest";
import { levelIntensity, shouldDegrade, trailFactor } from "./gridUtils";

describe("levelIntensity", () => {
  it("returns 1.0 for level 0", () => {
    expect(levelIntensity(0, 4)).toBe(1);
  });

  it("returns 0.0 for level equal to maxLevel", () => {
    expect(levelIntensity(4, 4)).toBe(0);
  });

  it("monotonically decreases as level increases", () => {
    const maxLevel = 5;
    for (let l = 0; l < maxLevel; l++) {
      expect(levelIntensity(l, maxLevel)).toBeGreaterThan(
        levelIntensity(l + 1, maxLevel)
      );
    }
  });

  it("returns 1 when maxLevel is 0", () => {
    expect(levelIntensity(0, 0)).toBe(1);
  });

  it("clamps level above maxLevel", () => {
    expect(levelIntensity(10, 4)).toBe(0);
  });
});

describe("trailFactor", () => {
  it("returns 1.0 for index 0 (newest)", () => {
    expect(trailFactor(0, 8)).toBe(1);
  });

  it("returns 0.0 for last index (oldest)", () => {
    expect(trailFactor(7, 8)).toBe(0);
  });

  it("returns 1.0 when trailLength is 1", () => {
    expect(trailFactor(0, 1)).toBe(1);
  });

  it("linearly decreases from newest to oldest", () => {
    const len = 5;
    for (let i = 0; i < len - 1; i++) {
      expect(trailFactor(i, len)).toBeGreaterThan(trailFactor(i + 1, len));
    }
  });
});

describe("shouldDegrade", () => {
  it("returns false when fewer than 2 timestamps", () => {
    expect(shouldDegrade([], 24)).toBe(false);
    expect(shouldDegrade([100], 24)).toBe(false);
  });

  it("returns true when average FPS is below threshold", () => {
    // 10 frames over ~1 second → 9 intervals / 1s = 9 FPS, well below 24
    const timestamps = Array.from({ length: 10 }, (_, i) => i * 111);
    expect(shouldDegrade(timestamps, 24)).toBe(true);
  });

  it("returns false when average FPS is at or above threshold", () => {
    // 60 frames at ~16.67ms intervals → ~59.9 FPS, above 24
    const timestamps = Array.from({ length: 60 }, (_, i) => i * 16.67);
    expect(shouldDegrade(timestamps, 24)).toBe(false);
  });

  it("returns false when all timestamps are identical (zero elapsed time)", () => {
    expect(shouldDegrade([100, 100, 100], 24)).toBe(false);
  });

  it("returns true for exactly 2 timestamps with slow frame", () => {
    // 1 interval over 100ms → 10 FPS
    expect(shouldDegrade([0, 100], 24)).toBe(true);
  });

  it("returns false for exactly 2 timestamps with fast frame", () => {
    // 1 interval over 10ms → 100 FPS
    expect(shouldDegrade([0, 10], 24)).toBe(false);
  });

  it("correctly handles the threshold boundary", () => {
    // 24 intervals over 1000ms → exactly 24 FPS → not below threshold
    const timestamps = Array.from({ length: 25 }, (_, i) => i * (1000 / 24));
    expect(shouldDegrade(timestamps, 24)).toBe(false);
  });
});
