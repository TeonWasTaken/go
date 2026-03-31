/**
 * Seed data for local development.
 *
 * Populates the in-memory store with realistic alias records so the
 * dashboard has content to display immediately after `func start`.
 */

import { seedStore } from "./in-memory-store.js";
import { AliasRecord } from "./models.js";

const now = new Date();
const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const daysFromNow = (n: number) => new Date(now.getTime() + n * 86_400_000);
const monthsFromNow = (n: number) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
};

const SEED: AliasRecord[] = [
  {
    id: "design-docs",
    alias: "design-docs",
    destination_url: "https://example.com/docs/design-system",
    created_by: "dev@localhost",
    title: "Design System Documentation",
    click_count: 342,
    heat_score: 4.2,
    heat_updated_at: iso(daysAgo(1)),
    is_private: false,
    created_at: iso(daysAgo(120)),
    last_accessed_at: iso(daysAgo(1)),
    expiry_policy_type: "never",
    duration_months: null,
    custom_expires_at: null,
    expires_at: null,
    expiry_status: "no_expiry",
    expired_at: null,
  },
  {
    id: "roadmap",
    alias: "roadmap",
    destination_url: "https://example.com/roadmap/2026",
    created_by: "dev@localhost",
    title: "2026 Product Roadmap",
    click_count: 189,
    heat_score: 3.1,
    heat_updated_at: iso(daysAgo(2)),
    is_private: false,
    created_at: iso(daysAgo(90)),
    last_accessed_at: iso(daysAgo(2)),
    expiry_policy_type: "fixed",
    duration_months: 12,
    custom_expires_at: null,
    expires_at: iso(monthsFromNow(9)),
    expiry_status: "active",
    expired_at: null,
  },
  {
    id: "onboarding",
    alias: "onboarding",
    destination_url: "https://example.com/wiki/new-hire",
    created_by: "admin@example.com",
    title: "New Hire Onboarding Guide",
    click_count: 567,
    heat_score: 5.8,
    heat_updated_at: iso(daysAgo(0)),
    is_private: false,
    created_at: iso(daysAgo(200)),
    last_accessed_at: iso(daysAgo(0)),
    expiry_policy_type: "never",
    duration_months: null,
    custom_expires_at: null,
    expires_at: null,
    expiry_status: "no_expiry",
    expired_at: null,
  },
  {
    id: "sprint-board",
    alias: "sprint-board",
    destination_url: "https://example.com/jira/board/42",
    created_by: "dev@localhost",
    title: "Current Sprint Board",
    click_count: 98,
    heat_score: 2.4,
    heat_updated_at: iso(daysAgo(3)),
    is_private: false,
    created_at: iso(daysAgo(30)),
    last_accessed_at: iso(daysAgo(3)),
    expiry_policy_type: "fixed",
    duration_months: 3,
    custom_expires_at: null,
    expires_at: iso(daysFromNow(5)),
    expiry_status: "expiring_soon",
    expired_at: null,
  },
  {
    id: "old-wiki",
    alias: "old-wiki",
    destination_url: "https://example.com/wiki/legacy",
    created_by: "dev@localhost",
    title: "Legacy Wiki (Archived)",
    click_count: 1024,
    heat_score: 0,
    heat_updated_at: null,
    is_private: false,
    created_at: iso(daysAgo(400)),
    last_accessed_at: iso(daysAgo(180)),
    expiry_policy_type: "inactivity",
    duration_months: null,
    custom_expires_at: null,
    expires_at: iso(daysAgo(10)),
    expiry_status: "expired",
    expired_at: iso(daysAgo(10)),
  },
  {
    id: "my-notes:dev@localhost",
    alias: "my-notes",
    destination_url: "https://example.com/notes/personal",
    created_by: "dev@localhost",
    title: "Personal Dev Notes",
    click_count: 45,
    heat_score: 1.2,
    heat_updated_at: iso(daysAgo(5)),
    is_private: true,
    created_at: iso(daysAgo(60)),
    last_accessed_at: iso(daysAgo(5)),
    expiry_policy_type: "fixed",
    duration_months: 12,
    custom_expires_at: null,
    expires_at: iso(monthsFromNow(10)),
    expiry_status: "active",
    expired_at: null,
  },
  {
    id: "standup:dev@localhost",
    alias: "standup",
    destination_url: "https://meet.example.com/standup-room",
    created_by: "dev@localhost",
    title: "Daily Standup Meeting",
    click_count: 220,
    heat_score: 6.1,
    heat_updated_at: iso(daysAgo(0)),
    is_private: true,
    created_at: iso(daysAgo(150)),
    last_accessed_at: iso(daysAgo(0)),
    expiry_policy_type: "never",
    duration_months: null,
    custom_expires_at: null,
    expires_at: null,
    expiry_status: "no_expiry",
    expired_at: null,
  },
  {
    id: "api-docs",
    alias: "api-docs",
    destination_url: "https://example.com/api/v2/docs",
    created_by: "admin@example.com",
    title: "API v2 Documentation",
    click_count: 412,
    heat_score: 3.9,
    heat_updated_at: iso(daysAgo(1)),
    is_private: false,
    created_at: iso(daysAgo(180)),
    last_accessed_at: iso(daysAgo(1)),
    expiry_policy_type: "never",
    duration_months: null,
    custom_expires_at: null,
    expires_at: null,
    expiry_status: "no_expiry",
    expired_at: null,
  },
];

export function loadSeedData(): void {
  seedStore(SEED);
  console.log(`[dev] Loaded ${SEED.length} seed aliases into in-memory store`);
}
