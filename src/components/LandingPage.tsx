import { useState } from "react";
import type { AliasRecord } from "../services/api";
import { CreateEditModal } from "./CreateEditModal";
import { PopularLinks } from "./PopularLinks";

export function LandingPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSaved = (_record: AliasRecord) => {
    setShowCreate(false);
    setRefreshKey((k) => k + 1);
  };

  return (
    <section className="landing-page">
      <button
        className="btn btn--primary landing-page__cta"
        onClick={() => setShowCreate(true)}
      >
        Create New
      </button>

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
