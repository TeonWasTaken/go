import { useState } from "react";
import { useAuthConfig, useUser } from "../App";
import type { AliasRecord } from "../services/api";
import { CreateEditModal } from "./CreateEditModal";
import { PopularLinks } from "./PopularLinks";

export function LandingPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const authConfig = useAuthConfig();
  const user = useUser();

  const isPublicMode = authConfig?.mode === "public";
  const canCreate = authConfig?.allowPublicCreate !== false;
  const isAuthenticated = !!user;

  const handleCreateClick = () => {
    if (!isAuthenticated && isPublicMode && authConfig?.loginUrl) {
      window.location.href = authConfig.loginUrl;
    } else {
      setShowCreate(true);
    }
  };

  const handleSaved = (_record: AliasRecord) => {
    setShowCreate(false);
    setRefreshKey((k) => k + 1);
  };

  return (
    <section className="landing-page">
      {canCreate && (
        <button
          className="btn btn--primary landing-page__cta"
          onClick={handleCreateClick}
        >
          Create New
        </button>
      )}

      {isPublicMode && !isAuthenticated && (
        <p className="landing-page__sign-in-prompt">
          Sign in to create and manage your own short links.
        </p>
      )}

      <PopularLinks refreshKey={refreshKey} />

      {showCreate && (
        <CreateEditModal
          record={null}
          onClose={() => setShowCreate(false)}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
}
