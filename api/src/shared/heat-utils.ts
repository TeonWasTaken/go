/**
 * Heat score computation utility.
 *
 * Uses lazy exponential decay with a 7-day (168-hour) half-life.
 * The score is only recalculated when the alias is accessed via
 * the Redirection Engine.
 *
 * Formula: new_heat = old_heat * 2^(-hours_elapsed / 168) + 1.0
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeatScoreUpdate {
  heat_score: number;
  heat_updated_at: string; // ISO 8601 UTC
}

export interface ComputeHeatScoreParams {
  current_heat_score: number;
  heat_updated_at: string | null;
  now?: Date; // injectable for testing, defaults to new Date()
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Half-life in hours (7 days). */
const HALF_LIFE_HOURS = 168;

/** Fixed increment added per redirect. */
const INCREMENT = 1.0;

/** Threshold below which the decayed heat is clamped to zero. */
const NEAR_ZERO_THRESHOLD = 1e-9;

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function computeHeatScore(
  params: ComputeHeatScoreParams,
): HeatScoreUpdate {
  const now = params.now ?? new Date();

  // First access — heat_updated_at is null
  if (params.heat_updated_at === null) {
    return {
      heat_score: INCREMENT,
      heat_updated_at: now.toISOString(),
    };
  }

  const lastUpdate = new Date(params.heat_updated_at);
  const hoursElapsed = (now.getTime() - lastUpdate.getTime()) / 3_600_000;

  const decayedHeat =
    params.current_heat_score * Math.pow(2, -hoursElapsed / HALF_LIFE_HOURS);

  const clampedHeat = decayedHeat < NEAR_ZERO_THRESHOLD ? 0 : decayedHeat;

  return {
    heat_score: clampedHeat + INCREMENT,
    heat_updated_at: now.toISOString(),
  };
}
