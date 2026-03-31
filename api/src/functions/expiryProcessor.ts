/**
 * Expiry Processor Azure Function — Timer Trigger (daily at 2:00 AM UTC)
 *
 * Evaluates all alias records with an expiry policy and transitions them
 * through the expiry state machine:
 *   active → expiring_soon (within 7 days of expires_at)
 *   active/expiring_soon → expired (past expires_at)
 *   expired → permanently deleted (14 days after expired_at)
 *
 * Logs per-record errors and continues processing. Logs a summary on completion.
 */

import { app, InvocationContext, Timer } from "@azure/functions";
import {
  deleteAlias,
  queryExpirableAliases,
  updateAlias,
} from "../shared/cosmos-client.js";
import { AliasRecord } from "../shared/models.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Result interface
// ---------------------------------------------------------------------------

export interface ExpiryProcessorResult {
  transitioned_to_expiring_soon: number;
  transitioned_to_expired: number;
  permanently_deleted: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Core processing logic (exported for testing)
// ---------------------------------------------------------------------------

export async function processExpiryRecords(
  records: AliasRecord[],
  now: Date,
  deps: {
    updateAlias: (record: AliasRecord) => Promise<AliasRecord>;
    deleteAlias: (alias: string, id: string) => Promise<void>;
  },
  logger?: { error: (...args: any[]) => void },
): Promise<ExpiryProcessorResult> {
  const result: ExpiryProcessorResult = {
    transitioned_to_expiring_soon: 0,
    transitioned_to_expired: 0,
    permanently_deleted: 0,
    errors: 0,
  };

  const nowMs = now.getTime();

  for (const record of records) {
    try {
      const expiresAtMs = record.expires_at
        ? new Date(record.expires_at).getTime()
        : null;

      // --- Permanently delete: expired and past 14-day grace period ---
      if (record.expiry_status === "expired" && record.expired_at) {
        const expiredAtMs = new Date(record.expired_at).getTime();
        if (nowMs - expiredAtMs > FOURTEEN_DAYS_MS) {
          await deps.deleteAlias(record.alias, record.id);
          result.permanently_deleted++;
          continue;
        }
      }

      // --- Transition to expired: expires_at is in the past ---
      if (
        expiresAtMs !== null &&
        expiresAtMs < nowMs &&
        record.expiry_status !== "expired"
      ) {
        record.expiry_status = "expired";
        record.expired_at = now.toISOString();
        await deps.updateAlias(record);
        result.transitioned_to_expired++;
        continue;
      }

      // --- Transition to expiring_soon: within 7 days ---
      if (
        expiresAtMs !== null &&
        expiresAtMs >= nowMs &&
        expiresAtMs - nowMs <= SEVEN_DAYS_MS &&
        record.expiry_status === "active"
      ) {
        record.expiry_status = "expiring_soon";
        await deps.updateAlias(record);
        result.transitioned_to_expiring_soon++;
        continue;
      }
    } catch (err: any) {
      logger?.error(
        `Error processing alias "${record.alias}" (id: ${record.id}):`,
        err,
      );
      result.errors++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Azure Function handler
// ---------------------------------------------------------------------------

export async function expiryProcessorHandler(
  _timer: Timer,
  context: InvocationContext,
): Promise<void> {
  context.log("Expiry processor started");

  const records = await queryExpirableAliases();
  const now = new Date();

  const result = await processExpiryRecords(
    records,
    now,
    { updateAlias, deleteAlias },
    context,
  );

  context.log(
    `Expiry processor completed: ` +
      `${result.transitioned_to_expiring_soon} expiring_soon, ` +
      `${result.transitioned_to_expired} expired, ` +
      `${result.permanently_deleted} deleted, ` +
      `${result.errors} errors`,
  );
}

// ---------------------------------------------------------------------------
// Register the Azure Function
// ---------------------------------------------------------------------------

app.timer("expiryProcessor", {
  schedule: "0 0 2 * * *",
  handler: expiryProcessorHandler,
});
