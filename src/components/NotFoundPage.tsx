import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAliasPrefix, useAuthConfig, useUser } from "../App";
import type { AliasRecord } from "../services/api";
import { CreateEditModal } from "./CreateEditModal";

/**
 * NotFoundPage — displayed when a user navigates to a non-existent alias.
 *
 * The redirect API sends a 302 to `/_/not-found?suggest=<alias>` when an alias is not found.
 * Both authenticated and unauthenticated users see the same "available" message.
 * A "Create it now" button opens the create dialog (authenticated) or
 * redirects to sign-in first (unauthenticated), after which the user
 * can click "Create it now" again to open the dialog.
 */
export function NotFoundPage() {
  const [params] = useSearchParams();
  const user = useUser();
  const authConfig = useAuthConfig();
  const aliasPrefix = useAliasPrefix();

  const suggestedAlias = params.get("suggest") ?? "";
  const isAuthenticated = !!user;

  const [showCreate, setShowCreate] = useState(false);

  const handleSaved = (_record: AliasRecord) => {
    setShowCreate(false);
  };

  // No suggest param — generic not-found
  if (!suggestedAlias) {
    return (
      <section className="not-found-page">
        <div className="not-found-page__card glass">
          <h1 className="not-found-page__heading">Page Not Found</h1>
          <p className="not-found-page__subtitle">
            The page you're looking for doesn't exist.
          </p>
        </div>
      </section>
    );
  }

  const handleCreate = () => {
    if (isAuthenticated) {
      setShowCreate(true);
    } else if (authConfig?.loginUrl) {
      // Redirect to sign-in; after authenticating the user returns here
      // and can click "Create it now" again to open the dialog.
      window.location.href = authConfig.loginUrl;
    }
  };

  return (
    <section className="not-found-page">
      <div className="not-found-page__card glass">
        <h1 className="not-found-page__heading">
          {aliasPrefix}/{suggestedAlias}
        </h1>
        <p className="not-found-page__subtitle">
          This alias is available.
        </p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleCreate}
        >
          Create it now
        </button>
      </div>

      {showCreate && (
        <CreateEditModal
          record={null}
          onClose={() => setShowCreate(false)}
          onSaved={handleSaved}
          initialAlias={suggestedAlias}
        />
      )}
    </section>
  );
}
