import { AuthMode } from "./auth-strategy.js";

export interface StorageConfig {
  useInMemory: boolean;
}

export function resolveStorage(mode: AuthMode): StorageConfig {
  const hasCosmosConn = !!process.env.COSMOS_CONNECTION_STRING;

  if (mode === "dev" && !hasCosmosConn) {
    return { useInMemory: true };
  }

  if (!hasCosmosConn) {
    throw new Error(
      `COSMOS_CONNECTION_STRING is required for AUTH_MODE="${mode}"`,
    );
  }

  return { useInMemory: false };
}
