import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAliasPrefix, useAuthConfig, useUser } from "../App";
import type { AliasRecord } from "../services/api";
import { CreateEditModal } from "./CreateEditModal";

/**
 * NotFoundPage — displayed when a user navigates to a non-existent alias.
 *
 * The redirect API sends a 302 to `/_/not-found?suggest=<alias>` when an alias is not found.
 * This component reads the `suggest` query param and renders:
 *   - Authenticated users: auto-opens the CreateEditModal with the alias pre-filled
 *   - Unauthenticated users: friendly "link does not exist" message with sign-in prompt
 *   - No suggest param: generic not-found message
 */
export function NotFoundPage() {
  const [params] = useSearchParams();
  const user = useUser();
  const authConfig = useAuthConfig();
  const aliasPrefix = useAliasPrefix();

  const suggestedAlias = params.get("suggest") ?? "";
  const isAuthenticated = !!user;
  const isPublicMode = authConfig?.mode === "public";

  const [showCreate, setShowCreate] = useState(false);

  // Open the create dialog once auth loads and we have a suggested alias
  useEffect(() => {
    if (isAuthenticated && suggestedAlias) {
      setShowCreate(true);
    }
  }, [isAuthenticated, suggestedAlias]);

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

  // Unauthenticated user with suggest param
  if (!isAuthenticated) {
    return (
      <section className="not-found-page">
        <div className="not-found-page__card glass">
          <h1 className="not-found-page__heading">
            {aliasPrefix}/{suggestedAlias}
          </h1>
          <p className="not-found-page__subtitle">
            Sorry, this link does not exist.
          </p>
          {isPublicMode && authConfig?.loginUrl && (
            <p className="not-found-page__sign-in-prompt">
              Want to claim it?{" "}
              <a className="btn btn--primary" href={authConfig.loginUrl}>
                Sign In
              </a>
            </p>
          )}
        </div>
      </section>
    );
  }

  // Authenticated user with suggest param
  return (
    <section className="not-found-page">
      <div className="not-found-page__card glass">
        <h1 className="not-found-page__heading">
          {aliasPrefix}/{suggestedAlias}
        </h1>
        <p className="not-found-page__subtitle">
          This alias is available — create it now!
        </p>
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
