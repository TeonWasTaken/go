import { useCallback, useEffect, useState } from "react";
import { useAliasPrefix } from "../App";
import type { AliasRecord } from "../services/api";
import { ApiError, deleteLink, getLinks, renewLink } from "../services/api";
import { AliasCard } from "./AliasCard";
import { SearchBar } from "./SearchBar";
import { SkeletonLoader } from "./SkeletonLoader";
import { useToast } from "./ToastProvider";

type ExpiryFilter =
  | "all"
  | "active"
  | "expiring_soon"
  | "expired"
  | "no_expiry";

const FILTER_TABS: { value: ExpiryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "expiring_soon", label: "Expiring Soon" },
  { value: "expired", label: "Expired" },
  { value: "no_expiry", label: "No Expiry" },
];

interface AliasListPageProps {
  onEdit: (record: AliasRecord) => void;
  onCreate: () => void;
  refreshKey: number;
  onRecordsLoaded?: (records: AliasRecord[]) => void;
}

export function AliasListPage({
  onEdit,
  onCreate,
  refreshKey,
  onRecordsLoaded,
}: AliasListPageProps) {
  const [records, setRecords] = useState<AliasRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ExpiryFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<AliasRecord | null>(null);
  const { showToast } = useToast();
  const aliasPrefix = useAliasPrefix();

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLinks(search ? { search } : undefined);
      setRecords(data);
      onRecordsLoaded?.(data);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to load aliases";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [search, showToast]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks, refreshKey]);

  const handleDelete = async (record: AliasRecord) => {
    setDeleteTarget(record);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteLink(deleteTarget.alias);
      setRecords((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      showToast(`Deleted ${aliasPrefix}/${deleteTarget.alias}`, "success");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to delete alias";
      showToast(msg, "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleRenew = async (record: AliasRecord) => {
    try {
      const updated = await renewLink(record.alias);
      setRecords((prev) => prev.map((r) => (r.id === record.id ? updated : r)));
      showToast(`Renewed ${aliasPrefix}/${record.alias}`, "success");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to renew alias";
      showToast(msg, "error");
    }
  };

  const filtered =
    filter === "all"
      ? records
      : records.filter((r) => r.expiry_status === filter);

  return (
    <section className="alias-list-page">
      <div className="alias-list-page__toolbar">
        <SearchBar onSearch={setSearch} />
        <button className="btn btn--primary" onClick={onCreate}>
          Create Alias
        </button>
      </div>

      <div
        className="filter-tabs"
        role="tablist"
        aria-label="Filter by expiry status"
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={filter === tab.value}
            className={`filter-tabs__tab${filter === tab.value ? " filter-tabs__tab--active" : ""}`}
            onClick={() => setFilter(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="alias-list-page__skeleton">
          <SkeletonLoader
            height="6rem"
            borderRadius="var(--radius)"
            count={4}
          />
        </div>
      ) : filtered.length === 0 ? (
        <p className="alias-list-page__empty">No aliases found.</p>
      ) : (
        <div className="alias-list-page__list">
          {filtered.map((r) => (
            <AliasCard
              key={r.id}
              record={r}
              onEdit={onEdit}
              onDelete={handleDelete}
              onRenew={handleRenew}
            />
          ))}
        </div>
      )}

      {deleteTarget && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
        >
          <div className="modal glass">
            <p>
              Delete{" "}
              <strong>
                {aliasPrefix}/{deleteTarget.alias}
              </strong>
              ? This cannot be undone.
            </p>
            <div className="modal__actions">
              <button className="btn" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn--danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
