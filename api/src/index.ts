/**
 * Azure Functions v4 entry point.
 *
 * Orchestrates startup:
 *   1. createStrategy()  — resolve AuthStrategy from AUTH_MODE + CORPORATE_LOCK
 *   2. resolveStorage()  — determine Cosmos DB vs in-memory based on mode + env
 *   3. initStorage()     — configure the data-access layer once
 *   4. loadSeedData()    — populate in-memory store (only when useInMemory is true)
 *   5. Import function handlers (they self-register via app.http / app.timer)
 *
 * Handler DI refactoring (passing AuthStrategy into handlers) is handled
 * separately in Task 5.
 */

import { createStrategy } from "./shared/auth-strategy.js";
import { initStorage } from "./shared/cosmos-client.js";
import { loadSeedData } from "./shared/seed-data.js";
import { resolveStorage } from "./shared/storage-config.js";

// ── Startup orchestration ───────────────────────────────────────────

const strategy = createStrategy();

const storageConfig = resolveStorage(strategy.mode);

initStorage(storageConfig);

if (storageConfig.useInMemory) {
  loadSeedData();
}

// ── Handler registration ────────────────────────────────────────────
// Each import triggers the module-level app.http() / app.timer() call
// that registers the handler with the Azure Functions runtime.

import { registerCreateLink } from "./functions/createLink.js";
registerCreateLink(strategy);

import { registerDeleteLink } from "./functions/deleteLink.js";
registerDeleteLink(strategy);

import "./functions/expiryProcessor.js";

import { registerGetLinks } from "./functions/getLinks.js";
registerGetLinks(strategy);

import { registerRedirect } from "./functions/redirect.js";
registerRedirect(strategy);

import { registerRenewLink } from "./functions/renewLink.js";
registerRenewLink(strategy);

import "./functions/scrapeTitle.js";

import { registerUpdateLink } from "./functions/updateLink.js";
registerUpdateLink(strategy);

import { registerAuthConfig } from "./functions/authConfig.js";
registerAuthConfig(strategy);

export { strategy };
