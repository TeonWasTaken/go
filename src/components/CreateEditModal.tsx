import { useEffect, useState } from "react";
import { useAliasPrefix, useAuthConfig } from "../App";
import type { AliasRecord } from "../services/api";
import {
  ApiError,
  createLink,
  scrapeMetadata,
  updateLink,
} from "../services/api";
import type { ExpiryPolicyValue } from "./ExpiryPolicySelector";
import { ExpiryPolicySelector } from "./ExpiryPolicySelector";
import { ScopeToggle } from "./ScopeToggle";
import { useToast } from "./ToastProvider";

interface CreateEditModalProps {
  record: AliasRecord | null; // null = create mode
  onClose: () => void;
  onSaved: (record: AliasRecord) => void;
  existingAliases?: AliasRecord[];
}

export function CreateEditModal({
  record,
  onClose,
  onSaved,
  existingAliases = [],
}: CreateEditModalProps) {
  const isEdit = !!record;
  const { showToast } = useToast();
  const authConfig = useAuthConfig();
  const aliasPrefix = useAliasPrefix();
  const isCorporate = authConfig?.mode === "corporate";
  const globalLabel = isCorporate ? "🌐 Global (All Staff)" : "🌐 Public";

  const [alias, setAlias] = useState(record?.alias ?? "");
  const [destinationUrl, setDestinationUrl] = useState(
    record?.destination_url ?? "",
  );
  const [title, setTitle] = useState(record?.title ?? "");
  const [isPrivate, setIsPrivate] = useState(record?.is_private ?? false);
  const [expiry, setExpiry] = useState<ExpiryPolicyValue>(() => {
    if (!record) return { expiry_policy_type: "fixed", duration_months: 12 };
    const base: ExpiryPolicyValue = {
      expiry_policy_type: record.expiry_policy_type,
    };
    if (record.expiry_policy_type === "fixed") {
      if (record.custom_expires_at)
        base.custom_expires_at = record.custom_expires_at;
      else if (record.duration_months)
        base.duration_months = record.duration_months;
    }
    return base;
  });
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(isEdit);
  const [titleLoading, setTitleLoading] = useState(false);
  const [iconUrl, setIconUrl] = useState(record?.icon_url ?? "");
  const [submitting, setSubmitting] = useState(false);

  // Alias conflict detection (create mode only)
  const normalizedAlias = alias.toLowerCase();
  const matchingGlobal = !isEdit
    ? existingAliases.find((r) => r.alias === normalizedAlias && !r.is_private)
    : undefined;
  const matchingPrivate = !isEdit
    ? existingAliases.find((r) => r.alias === normalizedAlias && r.is_private)
    : undefined;

  // Block: trying to create same type that already exists
  const aliasConflict =
    !isEdit &&
    normalizedAlias &&
    ((!isPrivate && !!matchingGlobal) || (isPrivate && !!matchingPrivate));

  // Warn: creating private alias that shadows a global (allowed but show warning)
  const showShadowWarning =
    !isEdit && isPrivate && !!matchingGlobal && !matchingPrivate;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Debounced auto-scrape title and icon from destination URL (create mode only)
  useEffect(() => {
    if (isEdit || titleManuallyEdited) return;

    let cancelled = false;

    // Validate URL format
    try {
      new URL(destinationUrl);
    } catch {
      return;
    }

    setTitleLoading(true);

    const timer = setTimeout(async () => {
      try {
        const result = await scrapeMetadata(destinationUrl);
        if (cancelled) return;
        if (result.title) setTitle(result.title);
        if (result.iconUrl) setIconUrl(result.iconUrl);
      } catch {
        // Silently ignore errors
      } finally {
        if (!cancelled) setTitleLoading(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setTitleLoading(false);
    };
  }, [destinationUrl, isEdit, titleManuallyEdited]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isEdit) {
        const updated = await updateLink(record.alias, {
          destination_url: destinationUrl,
          title,
          is_private: isPrivate,
          icon_url: iconUrl || undefined,
          ...buildExpiryPayload(expiry),
        });
        showToast(`Updated ${aliasPrefix}/${record.alias}`, "success");
        onSaved(updated);
      } else {
        const created = await createLink({
          alias: alias.toLowerCase(),
          destination_url: destinationUrl,
          title,
          is_private: isPrivate,
          icon_url: iconUrl || undefined,
          ...buildExpiryPayload(expiry),
        });
        showToast(`Created ${aliasPrefix}/${created.alias}`, "success");
        onSaved(created);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Something went wrong";
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit alias" : "Create alias"}
    >
      <form className="modal glass" onSubmit={handleSubmit}>
        <h2 className="modal__heading">
          {isEdit ? "Edit Alias" : "Create Alias"}
        </h2>

        <label className="form-field">
          <span className="form-field__label">Alias</span>
          <div className="form-field__input-group">
            <span className="form-field__prefix">{aliasPrefix}/</span>
            <input
              className="form-field__input form-field__input--prefixed"
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value.toLowerCase())}
              placeholder="my-alias"
              required
              disabled={isEdit}
              aria-label="Alias name"
            />
          </div>
        </label>

        <label className="form-field">
          <span className="form-field__label">Destination URL</span>
          <input
            className="form-field__input"
            type="url"
            value={destinationUrl}
            onChange={(e) => setDestinationUrl(e.target.value)}
            placeholder="https://example.com/long-path"
            required
            aria-label="Destination URL"
          />
        </label>

        <label className="form-field">
          <span className="form-field__label">Title</span>
          <input
            className="form-field__input"
            type="text"
            value={title}
            onChange={(e) => {
              setTitleManuallyEdited(true);
              setTitle(e.target.value);
            }}
            placeholder={
              titleLoading ? "Fetching title..." : "Human-readable title"
            }
            required
            aria-label="Title"
          />
        </label>

        <ScopeToggle
          isPrivate={isPrivate}
          onChange={setIsPrivate}
          globalLabel={globalLabel}
        />

        {aliasConflict && (
          <p className="form-error" role="alert">
            {isPrivate
              ? `You already have a private alias named "${normalizedAlias}".`
              : `A global alias named "${normalizedAlias}" already exists.`}
          </p>
        )}

        {showShadowWarning && (
          <p className="form-info">
            A global alias with this name already exists. When both match,
            you'll see an interstitial page to choose which destination to
            visit.
          </p>
        )}

        <ExpiryPolicySelector value={expiry} onChange={setExpiry} />

        <div className="modal__actions">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={submitting || !!aliasConflict}
          >
            {submitting ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

function buildExpiryPayload(v: ExpiryPolicyValue) {
  const payload: Record<string, unknown> = {
    expiry_policy_type: v.expiry_policy_type,
  };
  if (v.expiry_policy_type === "fixed") {
    if (v.custom_expires_at) payload.custom_expires_at = v.custom_expires_at;
    else if (v.duration_months) payload.duration_months = v.duration_months;
  }
  return payload;
}
