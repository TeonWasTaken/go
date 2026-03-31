import { useCallback, useState } from "react";
import { Route, Routes } from "react-router-dom";
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
      />
      {(showCreate || editTarget) && (
        <CreateEditModal
          record={editTarget}
          onClose={() => {
            setEditTarget(null);
            setShowCreate(false);
          }}
          onSaved={handleSaved}
        />
      )}
    </>
  );
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
        </Routes>
      </main>
    </>
  );
}

export default App;
