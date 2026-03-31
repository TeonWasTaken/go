import { useState } from "react";
import type { AliasRecord } from "../services/api";
import { AliasCard } from "./AliasCard";
import type { ExpiryPolicyValue } from "./ExpiryPolicySelector";
import { ExpiryPolicySelector } from "./ExpiryPolicySelector";
import { ScopeToggle } from "./ScopeToggle";
import { SearchBar } from "./SearchBar";
import { SkeletonLoader } from "./SkeletonLoader";
import { useToast } from "./ToastProvider";

/* ── Mock data ── */
const mockRecords: AliasRecord[] = [
  {
    id: "1",
    alias: "design-docs",
    destination_url: "https://example.com/docs/design-system",
    created_by: "user@example.com",
    title: "Design System Documentation",
    click_count: 342,
    heat_score: 0.85,
    heat_updated_at: "2026-03-30T12:00:00Z",
    is_private: false,
    created_at: "2025-11-01T10:00:00Z",
    last_accessed_at: "2026-03-30T14:22:00Z",
    expiry_policy_type: "never",
    duration_months: null,
    custom_expires_at: null,
    expires_at: null,
    expiry_status: "active",
    expired_at: null,
  },
  {
    id: "2",
    alias: "my-notes",
    destination_url: "https://example.com/notes/personal",
    created_by: "user@example.com",
    title: "Personal Notes",
    click_count: 18,
    heat_score: 0.2,
    heat_updated_at: "2026-03-28T08:00:00Z",
    is_private: true,
    created_at: "2026-01-15T09:00:00Z",
    last_accessed_at: "2026-03-28T08:30:00Z",
    expiry_policy_type: "fixed",
    duration_months: 3,
    custom_expires_at: null,
    expires_at: "2026-04-15T09:00:00Z",
    expiry_status: "expiring_soon",
    expired_at: null,
  },
  {
    id: "3",
    alias: "old-wiki",
    destination_url: "https://example.com/wiki/legacy",
    created_by: "user@example.com",
    title: "Legacy Wiki (Archived)",
    click_count: 1024,
    heat_score: 0,
    heat_updated_at: null,
    is_private: false,
    created_at: "2024-06-01T10:00:00Z",
    last_accessed_at: "2025-08-10T16:00:00Z",
    expiry_policy_type: "inactivity",
    duration_months: null,
    custom_expires_at: null,
    expires_at: "2026-02-01T00:00:00Z",
    expiry_status: "expired",
    expired_at: "2026-02-01T00:00:00Z",
  },
  {
    id: "4",
    alias: "roadmap",
    destination_url: "https://example.com/roadmap/2026",
    created_by: "user@example.com",
    title: "2026 Product Roadmap",
    click_count: 89,
    heat_score: 0.55,
    heat_updated_at: "2026-03-29T10:00:00Z",
    is_private: false,
    created_at: "2026-01-02T08:00:00Z",
    last_accessed_at: "2026-03-29T11:00:00Z",
    expiry_policy_type: "fixed",
    duration_months: 12,
    custom_expires_at: null,
    expires_at: "2027-01-02T08:00:00Z",
    expiry_status: "no_expiry",
    expired_at: null,
  },
];

const noop = () => {};

export function KitchenSinkPage() {
  const { showToast } = useToast();
  const [scopePrivate, setScopePrivate] = useState(true);
  const [expiryPolicy, setExpiryPolicy] = useState<ExpiryPolicyValue>({
    expiry_policy_type: "never",
  });

  return (
    <div className="kitchen-sink">
      <h1 className="kitchen-sink__title">Kitchen Sink</h1>
      <p className="kitchen-sink__intro">
        Visual reference for every UI component in the design system. Use this
        page to review glassmorphism surfaces, typography, interactive controls,
        and component states in both light and dark themes.
      </p>

      {/* ── Glass Surfaces ── */}
      <section className="kitchen-sink__section">
        <h2 className="kitchen-sink__heading">Glass Surfaces</h2>
        <p className="kitchen-sink__desc">
          The two glass tiers: <code>.glass</code> for primary cards and{" "}
          <code>.glass--subtle</code> for nested or secondary surfaces.
        </p>
        <div className="kitchen-sink__row">
          <div className="glass" style={{ padding: "1.5rem", flex: 1 }}>
            <strong>.glass</strong> — primary surface with full blur and shadow
          </div>
          <div className="glass--subtle" style={{ padding: "1.5rem", flex: 1 }}>
            <strong>.glass--subtle</strong> — lighter nested surface
          </div>
        </div>
      </section>

      {/* ── Typography ── */}
      <section className="kitchen-sink__section">
        <h2 className="kitchen-sink__heading">Typography</h2>
        <p className="kitchen-sink__desc">
          Text colors and sizes from the design tokens.
        </p>
        <div className="glass" style={{ padding: "1.5rem" }}>
          <p
            style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            Heading — 1.75rem / 800
          </p>
          <p style={{ fontSize: "1.125rem", fontWeight: 700 }}>
            Subheading — 1.125rem / 700
          </p>
          <p>Body text — default size and weight</p>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
            Muted text — 0.875rem / --color-text-muted
          </p>
          <p
            style={{
              color: "var(--color-text-secondary)",
              fontSize: "0.75rem",
            }}
          >
            Secondary text — 0.75rem / --color-text-secondary
          </p>
        </div>
      </section>

      {/* ── Buttons ── */}
      <section className="kitchen-sink__section">
        <h2 className="kitchen-sink__heading">Buttons</h2>
        <p className="kitchen-sink__desc">
          Primary (gradient), default (glass), and danger variants.
        </p>
        <div className="kitchen-sink__row">
          <button className="btn btn--primary">Primary</button>
          <button className="btn">Default</button>
          <button className="btn btn--danger">Danger</button>
          <button className="btn" disabled>
            Disabled
          </button>
        </div>
      </section>

      {/* ── Badges ── */}
      <section className="kitchen-sink__section">
        <h2 className="kitchen-sink__heading">Badges</h2>
        <p className="kitchen-sink__desc">
          Status badges used on alias cards to indicate lifecycle state.
        </p>
        <div className="kitchen-sink__row">
          <span className="alias-card__badge alias-card__badge--active">
            Active
          </span>
          <span className="alias-card__badge alias-card__badge--expiring_soon">
            Expiring Soon
          </span>
          <span className="alias-card__badge alias-card__badge--expired">
            Expired
          </span>
          <span className="alias-card__badge alias-card__badge--no_expiry">
            No Expiry
          </span>
          <span className="alias-card__badge alias-card__badge--personal">
            Personal
          </span>
        </div>
      </section>

      {/* ── Search Bar ── */}
      <section className="kitchen-sink__section">
        <h2 className="kitchen-sink__heading">Search Bar</h2>
        <p className="kitchen-sink__desc">
          Debounced search input with keyboard shortcut indicator. Press{" "}
          <kbd>/</kbd> to focus.
        </p>
        <SearchBar onSearch={noop} />
      </section>

      {/* ── Scope Toggle ── */}
      <section className="kitchen-sink__section">
        <h2 className="kitchen-sink__heading">Scope Toggle</h2>
        <p className="kitchen-sink__desc">
          Segmented radio pill for switching between private and global scope.
        </p>
        <div style={{ maxWidth: 360 }}>
          <ScopeToggle isPrivate={scopePrivate} onChange={setScopePrivate} />
        </div>
      </section>

      {/* ── Expiry Policy Selector ── */}
      <section className="kitchen-sink__section">
        <h2 className="kitchen-sink__heading">Expiry Policy Selector</h2>
        <p className="kitchen-sink__desc">
          Multi-step selector for choosing expiry type and duration. Try
          switching between Never, Expire on date, and After inactivity.
        </p>
        <div className="glass" style={{ padding: "1.5rem", maxWidth: 480 }}>
          <ExpiryPolicySelector
            value={expiryPolicy}
            onChange={setExpiryPolicy}
          />
        </div>
      </section>

      {/* ── Form Fields ── */}
      <section className="kitchen-sink__section">
        <h2 className="kitchen-sink__heading">Form Fields</h2>
        <p className="kitchen-sink__desc">
          Text inputs styled for glass surfaces.
        </p>
        <div className="glass" style={{ padding: "1.5rem", maxWidth: 480 }}>
          <div className="form-field">
            <label className="form-field__label">Alias</label>
            <input
              className="form-field__input"
              placeholder="my-link"
              defaultValue=""
            />
          </div>
          <div className="form-field">
            <label className="form-field__label">Destination URL</label>
            <input
              className="form-field__input"
              placeholder="https://…"
              defaultValue=""
            />
          </div>
          <div className="form-field">
            <label className="form-field__label">Disabled field</label>
            <input className="form-field__input" disabled value="Cannot edit" />
          </div>
          <div className="form-info">
            ℹ️ This is a <code>.form-info</code> helper message.
          </div>
        </div>
      </section>

      {/* ── Toast Notifications ── */}
      <section className="kitchen-sink__section">
        <h2 className="kitchen-sink__heading">Toast Notifications</h2>
        <p className="kitchen-sink__desc">
          Click to trigger each toast variant. They auto-dismiss after 4
          seconds.
        </p>
        <div className="kitchen-sink__row">
          <button
            className="btn"
            onClick={() => showToast("Link created successfully", "success")}
          >
            Success Toast
          </button>
          <button
            className="btn"
            onClick={() => showToast("Something went wrong", "error")}
          >
            Error Toast
          </button>
          <button
            className="btn"
            onClick={() => showToast("Link copied to clipboard", "info")}
          >
            Info Toast
          </button>
        </div>
      </section>

      {/* ── Skeleton Loaders ── */}
      <section className="kitchen-sink__section">
        <h2 className="kitchen-sink__heading">Skeleton Loaders</h2>
        <p className="kitchen-sink__desc">
          Pulsing placeholders shown while content is loading.
        </p>
        <div className="glass" style={{ padding: "1.5rem" }}>
          <SkeletonLoader height="1.25rem" width="40%" />
          <SkeletonLoader height="0.875rem" width="70%" />
          <SkeletonLoader height="0.875rem" width="55%" />
          <SkeletonLoader height="6rem" borderRadius="var(--radius)" />
        </div>
      </section>

      {/* ── Alias Cards ── */}
      <section className="kitchen-sink__section">
        <h2 className="kitchen-sink__heading">Alias Cards</h2>
        <p className="kitchen-sink__desc">
          All four expiry states: active, expiring soon (amber left border),
          expired (faded + strikethrough), and no-expiry. The second card is
          also marked as personal.
        </p>
        <div className="kitchen-sink__cards">
          {mockRecords.map((r) => (
            <AliasCard
              key={r.id}
              record={r}
              onEdit={noop}
              onDelete={noop}
              onRenew={noop}
            />
          ))}
        </div>
      </section>

      {/* ── Filter Tabs ── */}
      <section className="kitchen-sink__section">
        <h2 className="kitchen-sink__heading">Filter Tabs</h2>
        <p className="kitchen-sink__desc">
          Horizontal tab bar used for filtering alias lists.
        </p>
        <div className="filter-tabs">
          <button className="filter-tabs__tab filter-tabs__tab--active">
            All
          </button>
          <button className="filter-tabs__tab">Active</button>
          <button className="filter-tabs__tab">Expiring Soon</button>
          <button className="filter-tabs__tab">Expired</button>
          <button className="filter-tabs__tab">Personal</button>
        </div>
      </section>

      {/* ── Color Palette ── */}
      <section className="kitchen-sink__section">
        <h2 className="kitchen-sink__heading">Color Palette</h2>
        <p className="kitchen-sink__desc">
          Key design tokens. Swatches adapt to the current theme.
        </p>
        <div className="kitchen-sink__palette">
          {[
            { label: "--color-primary", var: "var(--color-primary)" },
            { label: "--color-accent", var: "var(--color-accent)" },
            { label: "--color-text", var: "var(--color-text)" },
            { label: "--color-text-muted", var: "var(--color-text-muted)" },
            { label: "--color-bg", var: "var(--color-bg)" },
            { label: "--glass-bg", var: "var(--glass-bg)" },
          ].map((c) => (
            <div key={c.label} className="kitchen-sink__swatch">
              <div
                className="kitchen-sink__swatch-color"
                style={{ background: c.var }}
              />
              <code className="kitchen-sink__swatch-label">{c.label}</code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
