import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
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
import { SearchBar } from "./components/SearchBar";
import { useTheme } from "./components/ThemeProvider";
import { ThemeToggle } from "./components/ThemeToggle";
import { type AuthConfigResponse, getAuthConfig } from "./services/api";

export const AuthConfigContext = createContext<AuthConfigResponse | null>(null);

export function useAuthConfig(): AuthConfigResponse | null {
  return useContext(AuthConfigContext);
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
      window.location.href = `/go-redirect/${encodeURIComponent(alias)}`;
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
  const [authConfig, setAuthConfig] = useState<AuthConfigResponse | null>(null);

  useEffect(() => {
    getAuthConfig()
      .then(setAuthConfig)
      .catch(() => {
        // In dev mode, fall back to a dev config so the app works without the API
        setAuthConfig({
          mode: "dev",
          identityProviders: ["dev"],
          loginUrl: "",
          aliasPrefix: "go",
        });
      });
  }, []);

  const isManagePage = location.pathname === "/manage";
  const isAppRoute = [
    "/",
    "/manage",
    "/interstitial",
    "/kitchen-sink",
  ].includes(location.pathname);
  const headerSearchValue = isManagePage ? searchParams.get("q") || "" : "";

  const handleHeaderSearch = useCallback(
    (term: string) => {
      // Navigate to manage page with search term on any page (debounced as-you-type)
      navigate(
        term
          ? `/manage?q=${encodeURIComponent(term)}`
          : isManagePage
            ? "/manage"
            : "/",
        {
          replace: true,
        },
      );
    },
    [isManagePage, navigate],
  );

  const handleHeaderSubmit = useCallback(
    (term: string) => {
      if (!isManagePage) {
        // On landing page (or any non-manage page), navigate to manage with query
        navigate(term ? `/manage?q=${encodeURIComponent(term)}` : "/manage");
      }
      // On manage page, the debounced onSearch already handles filtering
    },
    [isManagePage, navigate],
  );

  return (
    <AuthConfigContext.Provider value={authConfig}>
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
          <NavLink to="/manage" className="app-header__nav-link">
            Manage My Links
          </NavLink>
          <ThemeToggle />
        </header>
      )}
      <main className="container main-content">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/manage" element={<ManagePage />} />
          <Route path="/interstitial" element={<InterstitialPage />} />
          <Route path="/kitchen-sink" element={<KitchenSinkPage />} />
          <Route path="/*" element={<AliasRedirect />} />
        </Routes>
      </main>
    </AuthConfigContext.Provider>
  );
}

export default App;
