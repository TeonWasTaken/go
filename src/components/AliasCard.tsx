import { useAliasPrefix } from "../App";
import type { AliasRecord } from "../services/api";

interface AliasCardProps {
  record: AliasRecord;
  onEdit: (record: AliasRecord) => void;
  onDelete: (record: AliasRecord) => void;
  onRenew: (record: AliasRecord) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusLabel(status: AliasRecord["expiry_status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "expiring_soon":
      return "Expiring Soon";
    case "expired":
      return "Expired";
    case "no_expiry":
      return "No Expiry";
  }
}

export function AliasCard({
  record,
  onEdit,
  onDelete,
  onRenew,
}: AliasCardProps) {
  const aliasPrefix = useAliasPrefix();
  const isExpired = record.expiry_status === "expired";
  const isExpiringSoon = record.expiry_status === "expiring_soon";

  let cardClass = "alias-card glass";
  if (isExpired) cardClass += " alias-card--expired";
  if (isExpiringSoon) cardClass += " alias-card--expiring";

  return (
    <article
      className={cardClass}
      aria-label={`Alias ${record.alias}`}
      onClick={() => window.open(record.destination_url, "_blank")}
      style={{ cursor: "pointer" }}
    >
      <div className="alias-card__header">
        <div className="alias-card__title-row">
          {record.icon_url ? (
            <img
              className="alias-card__icon"
              src={record.icon_url}
              alt=""
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                // Show placeholder sibling
                const placeholder = (e.target as HTMLImageElement)
                  .nextElementSibling;
                if (placeholder)
                  (placeholder as HTMLElement).style.display = "flex";
              }}
            />
          ) : null}
          <span
            className="alias-card__icon-placeholder"
            style={record.icon_url ? { display: "none" } : undefined}
          >
            🔗
          </span>
          <span className="alias-card__alias">
            {aliasPrefix}/{record.alias}
          </span>
          {record.is_private && (
            <span className="alias-card__badge alias-card__badge--personal">
              Personal
            </span>
          )}
          <span
            className={`alias-card__badge alias-card__badge--status alias-card__badge--${record.expiry_status}`}
          >
            {statusLabel(record.expiry_status)}
          </span>
          <button
            className="alias-card__btn alias-card__btn--icon"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(record);
            }}
            aria-label={`Edit ${record.alias}`}
          >
            ⚙️
          </button>
        </div>
        {record.title && (
          <span className="alias-card__title">{record.title}</span>
        )}
      </div>

      <div className="alias-card__dest">
        <span className="alias-card__label">Destination</span>
        <a
          href={record.destination_url}
          className="alias-card__url"
          target="_blank"
          rel="noopener noreferrer"
        >
          {record.destination_url}
        </a>
      </div>

      <div className="alias-card__meta">
        <span>Clicks: {record.click_count}</span>
        <span>Last used: {formatDate(record.last_accessed_at)}</span>
        {record.expires_at && (
          <span>Expires: {formatDate(record.expires_at)}</span>
        )}
      </div>

      <div className="alias-card__actions" onClick={(e) => e.stopPropagation()}>
        {(isExpired || isExpiringSoon) && (
          <button
            className="alias-card__btn alias-card__btn--renew"
            onClick={() => onRenew(record)}
            aria-label={`Renew ${record.alias}`}
          >
            Renew
          </button>
        )}
        <button
          className="alias-card__btn alias-card__btn--danger"
          onClick={() => onDelete(record)}
          aria-label={`Delete ${record.alias}`}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
