import { useCallback, useEffect, useState } from "react";
import { Route, Routes, useParams } from "react-router-dom";
import { AliasListPage } from "./components/AliasListPage";
import { CreateEditModal } from "./components/CreateEditModal";
import { InterstitialPage } from "./components/InterstitialPage";
import { KitchenSinkPage } from "./components/KitchenSinkPage";
import { PopularLinks } from "./components/PopularLinks";
import { ThemeToggle } from "./components/ThemeToggle";
import type { AliasRecord } from "./services/api";

function Dashboard() {
  const [editTarget, setEditTarget] = useState<AliasRecord | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [records, setRecords] = useState<AliasRecord[]>([]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const handleSaved = () => {
    setEditTarget(null);
    setShowCreate(false);
    refresh();
  };

  return (
    <>
      <PopularLinks />
      <AliasListPage
        onEdit={setEditTarget}
        onCreate={() => setShowCreate(true)}
        refreshKey={refreshKey}
        onRecordsLoaded={setRecords}
      />
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
    </>
  );
}

/** Catch-all: forward unknown paths to the redirect API (mirrors SWA config in dev). */
function AliasRedirect() {
  const { "*": alias } = useParams();
  useEffect(() => {
    if (alias) {
      // The redirect Azure Function listens at /{alias} (no /api prefix).
      // In dev, Vite proxies /go-redirect/* to the Functions backend.
      window.location.href = `/go-redirect/${encodeURIComponent(alias)}`;
    }
  }, [alias]);
  return null;
}

function App() {
  return (
    <>
      <header className="app-header container">
        <span className="app-header__title">Go</span>
        <ThemeToggle />
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/interstitial" element={<InterstitialPage />} />
          <Route path="/kitchen-sink" element={<KitchenSinkPage />} />
          <Route path="/*" element={<AliasRedirect />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
