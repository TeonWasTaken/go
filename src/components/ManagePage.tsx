import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAliasPrefix, useAuthConfig } from "../App";
import type { AliasRecord } from "../services/api";
import {
  ApiError,
  deleteLink,
  getLinks,
  renewLink as renewLinkApi,
} from "../services/api";
import type { ExpiryFilter } from "../utils/filterRecords";
import { filterRecords } from "../utils/filterRecords";
import { AliasCard } from "./AliasCard";
import { CreateEditModal } from "./CreateEditModal";
import { SkeletonLoader } from "./SkeletonLoader";
import { useToast } from "./ToastProvider";

const FILTER_TABS: { value: ExpiryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "expiring_soon", label: "Expiring Soon" },
  { value: "expired", label: "Expired" },
];

export function ManagePage() {
  const [searchParams] = useSearchParams();
  const search = searchParams.get("q") || "";

  const [records, setRecords] = useState<AliasRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ExpiryFilter>("all");
  const [editTarget, setEditTarget] = useState<AliasRecord | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AliasRecord | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const { showToast } = useToast();
  const authConfig = useAuthConfig();
  const aliasPrefix = useAliasPrefix();

  const isPublicMode = authConfig?.mode === "public";

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLinks(search ? { search } : undefined);
      setRecords(data);
      setNeedsSignIn(false);
    } catch (err) {
      if (isPublicMode && err instanceof ApiError && err.status === 401) {
        setNeedsSignIn(true);
      } else {
        const msg =
          err instanceof ApiError ? err.message : "Failed to load aliases";
        showToast(msg, "error");
      }
    } finally {
      setLoading(false);
    }
  }, [search, showToast, isPublicMode]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleDelete = (record: AliasRecord) => {
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
      const updated = await renewLinkApi(record.alias);
      setRecords((prev) => prev.map((r) => (r.id === record.id ? updated : r)));
      showToast(`Renewed ${aliasPrefix}/${record.alias}`, "success");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to renew alias";
      showToast(msg, "error");
    }
  };

  const handleEdit = (record: AliasRecord) => {
    setEditTarget(record);
  };

  const handleSaved = (saved: AliasRecord) => {
    if (editTarget) {
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
    } else {
      setRecords((prev) => [saved, ...prev]);
    }
    setEditTarget(null);
    setShowCreate(false);
  };

  const filtered = filterRecords(records, filter);

  if (needsSignIn && isPublicMode && authConfig?.loginUrl) {
    return (
      <section className="alias-list-page">
        <div className="alias-list-page__sign-in-prompt">
          <p>Sign in to manage your short links.</p>
          <a className="btn btn--primary" href={authConfig.loginUrl}>
            Sign In
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="alias-list-page">
      <div className="alias-list-page__toolbar">
        <button
          className="btn btn--primary"
          onClick={() => setShowCreate(true)}
        >
          Create New
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
              onEdit={handleEdit}
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

      {(showCreate || editTarget) && (
        <CreateEditModal
          record={editTarget}
          onClose={() => {
            setEditTarget(null);
            setShowCreate(false);
          }}
          onSaved={handleSaved}
          existingAliases={records}
        />
      )}
    </section>
  );
}
