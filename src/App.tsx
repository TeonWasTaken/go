import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState
} from "react";
import {
    NavLink,
    Route,
    Routes,
    useLocation,
    useNavigate,
    useParams,
    useSearchParams,
} from "react-router-dom";
import GoLogoDark from "./assets/GoLogo_dark.svg";
import GoLogoLight from "./assets/GoLogo_light.svg";
import { InterstitialPage } from "./components/InterstitialPage";
import { KitchenSinkPage } from "./components/KitchenSinkPage";
import { LandingPage } from "./components/LandingPage";
import { ManagePage } from "./components/ManagePage";
import { MotionToggle, useMotionPref } from "./components/MotionToggle";
import { NetworkBackground } from "./components/NetworkBackground";
import { NotFoundPage } from "./components/NotFoundPage";
import { SearchBar } from "./components/SearchBar";
import { StaticDotGrid } from "./components/StaticDotGrid";
import { useTheme } from "./components/ThemeProvider";
import { ThemeToggle } from "./components/ThemeToggle";
import { UserBadge } from "./components/UserBadge";
import {
    type AuthConfigResponse,
    type UserIdentity,
    fetchCurrentUser,
    getAuthConfig,
} from "./services/api";

export const AuthConfigContext = createContext<AuthConfigResponse | null>(null);
export const UserContext = createContext<UserIdentity | null>(null);

export function useAuthConfig(): AuthConfigResponse | null {
  return useContext(AuthConfigContext);
}

export function useUser(): UserIdentity | null {
  return useContext(UserContext);
}

export function useAliasPrefix(): string {
  const config = useContext(AuthConfigContext);
  return config?.aliasPrefix ?? "go";
}

/** Catch-all: forward unknown paths to the redirect API (mirrors SWA config in dev). */
function AliasRedirect() {
  const { "*": alias } = useParams();
  useEffect(() => {
    if (alias) {
      // In production, SWA rewrites /{alias} → /api/redirect/{alias} at the platform level.
      // In dev, the Vite proxy handles /go-redirect → localhost:7071.
      const isDev = import.meta.env.DEV;
      const path = isDev
        ? `/go-redirect/${encodeURIComponent(alias)}`
        : `/api/redirect/${encodeURIComponent(alias)}`;
      window.location.href = path;
    }
  }, [alias]);
  return (
    <div className="redirect-placeholder">
      <p className="redirect-placeholder__text">Redirecting…</p>
    </div>
  );
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { resolved: theme } = useTheme();
  const { pref: motionPref, setPref: setMotionPref } = useMotionPref();
  const [fps, setFps] = useState(60);
  const [degraded, setDegraded] = useState(false);
  const lowFpsSinceRef = useRef<number | null>(null);

  // Auto-degrade: if FPS stays below 30 for 3 consecutive seconds, switch to static
  const handleFps = useCallback((currentFps: number) => {
    setFps(currentFps);
    if (currentFps < 30) {
      const now = performance.now();
      if (lowFpsSinceRef.current === null) {
        lowFpsSinceRef.current = now;
      }
      // Switch to static after 3 consecutive seconds below the FPS threshold.
      if (now - lowFpsSinceRef.current >= 3000) {
        setDegraded(true);
      }
    } else {
      lowFpsSinceRef.current = null;
    }
  }, []);

  const isMotionActive = motionPref === "motion" && !degraded;
  const [authConfig, setAuthConfig] = useState<AuthConfigResponse | null>(null);
  const [user, setUser] = useState<UserIdentity | null>(null);
  const [landingSearchTerm, setLandingSearchTerm] = useState("");

  useEffect(() => {
    getAuthConfig()
      .then((config) => {
        setAuthConfig(config);
        // In dev mode, use the devUser from auth-config instead of /.auth/me
        if (config.devUser) {
          setUser(config.devUser);
        }
      })
      .catch(() => {
        setAuthConfig({
          mode: "dev",
          identityProviders: ["dev"],
          loginUrl: "",
          aliasPrefix: "go",
          allowPublicCreate: true,
        });
        setUser({ email: "dev@localhost", roles: ["User"] });
      });

    fetchCurrentUser().then((u) => {
      if (u) setUser(u);
    });
  }, []);

  const isManagePage = location.pathname === "/_/manage";
  const isAppRoute = [
    "/",
    "/_/manage",
    "/_/interstitial",
    "/_/kitchen-sink",
    "/_/not-found",
  ].includes(location.pathname);
  const headerSearchValue = isManagePage ? searchParams.get("q") || "" : "";

  useEffect(() => {
    if (location.pathname !== "/") {
      setLandingSearchTerm("");
    }
  }, [location.pathname]);

  const handleHeaderSearch = useCallback(
    (term: string) => {
      if (location.pathname === "/") {
        setLandingSearchTerm(term);
      } else {
        navigate(
          term
            ? `/_/manage?q=${encodeURIComponent(term)}`
            : isManagePage
              ? "/_/manage"
              : "/",
          {
            replace: true,
          },
        );
      }
    },
    [location.pathname, isManagePage, navigate],
  );

  const handleHeaderSubmit = useCallback(
    (term: string) => {
      if (location.pathname === "/") {
        setLandingSearchTerm(term);
      } else if (!isManagePage) {
        navigate(term ? `/_/manage?q=${encodeURIComponent(term)}` : "/_/manage");
      }
      // On manage page, the debounced onSearch already handles filtering
    },
    [location.pathname, isManagePage, navigate],
  );

  return (
    <AuthConfigContext.Provider value={authConfig}>
      <UserContext.Provider value={user}>
        {isMotionActive ? (
          <NetworkBackground onFps={handleFps} />
        ) : (
          <StaticDotGrid />
        )}
        {isAppRoute && (
          <header className="app-header container">
            <NavLink to="/" className="app-header__title">
              <img
                src={theme === "dark" ? GoLogoDark : GoLogoLight}
                alt="Go"
                className="app-header__logo"
              />
            </NavLink>
            <div className="app-header__search">
              <SearchBar
                key={isManagePage ? "manage" : "other"}
                onSearch={handleHeaderSearch}
                onSubmit={handleHeaderSubmit}
                initialValue={headerSearchValue}
                placeholder="Search aliases…"
              />
            </div>
            <NavLink to="/_/manage" className="app-header__nav-link">
              Manage My Links
            </NavLink>
            <UserBadge />
            <ThemeToggle />
            <MotionToggle pref={degraded ? "static" : motionPref} setPref={(v) => {
              setMotionPref(v);
              if (v === "motion") { setDegraded(false); lowFpsSinceRef.current = null; }
            }} />
          </header>
        )}
        <main className="container main-content">
          <Routes>
            <Route path="/" element={<LandingPage searchTerm={landingSearchTerm} />} />
            <Route path="/_/manage" element={<ManagePage />} />
            <Route path="/_/interstitial" element={<InterstitialPage />} />
            <Route path="/_/kitchen-sink" element={<KitchenSinkPage />} />
            <Route path="/_/not-found" element={<NotFoundPage />} />
            <Route path="/*" element={<AliasRedirect />} />
          </Routes>
        </main>
      </UserContext.Provider>
      {import.meta.env.DEV && isMotionActive && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            bottom: 8,
            right: 8,
            fontSize: "10px",
            fontFamily: "monospace",
            color: fps < 30 ? "rgba(255,80,80,0.5)" : "rgba(128,128,128,0.35)",
            pointerEvents: "none",
            zIndex: 1,
            userSelect: "none",
          }}
        >
          {fps} fps
        </div>
      )}
    </AuthConfigContext.Provider>
  );
}

export default App;
