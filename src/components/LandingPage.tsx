import { useState } from "react";
import { useAuthConfig } from "../App";
import type { AliasRecord } from "../services/api";
import { CreateEditModal } from "./CreateEditModal";
import { PopularLinks } from "./PopularLinks";

export function LandingPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const authConfig = useAuthConfig();

  const isPublicMode = authConfig?.mode === "public";

  const handleCreateClick = () => {
    if (isPublicMode && authConfig?.loginUrl) {
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
      <button
        className="btn btn--primary landing-page__cta"
        onClick={handleCreateClick}
      >
        Create New
      </button>

      {isPublicMode && (
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
