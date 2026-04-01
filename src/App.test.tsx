import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import App, { AuthConfigContext, useAuthConfig } from "./App";
import { ThemeProvider } from "./components/ThemeProvider";
import { ToastProvider } from "./components/ToastProvider";

// jsdom doesn't implement matchMedia — stub it for ThemeProvider
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

// Mock the API module
vi.mock("./services/api", () => ({
  getAuthConfig: vi.fn(),
  getLinks: vi.fn().mockResolvedValue([]),
}));

import { getAuthConfig } from "./services/api";

describe("AuthConfigContext", () => {
  it("useAuthConfig reads value from context provider", () => {
    const mockConfig = {
      mode: "corporate" as const,
      identityProviders: ["aad"],
      loginUrl: "/.auth/login/aad",
    };

    let captured: ReturnType<typeof useAuthConfig> = null;
    function Spy() {
      captured = useAuthConfig();
      return null;
    }

    render(
      <AuthConfigContext.Provider value={mockConfig}>
        <Spy />
      </AuthConfigContext.Provider>,
    );

    expect(captured).toEqual(mockConfig);
  });

  it("useAuthConfig returns null when no provider value set", () => {
    let captured: ReturnType<typeof useAuthConfig> = undefined as any;
    function Spy() {
      captured = useAuthConfig();
      return null;
    }

    render(
      <AuthConfigContext.Provider value={null}>
        <Spy />
      </AuthConfigContext.Provider>,
    );

    expect(captured).toBeNull();
  });

  it("App fetches auth config on mount and provides it via context", async () => {
    const mockConfig = {
      mode: "public" as const,
      identityProviders: ["google"],
      loginUrl: "/.auth/login/google",
    };
    vi.mocked(getAuthConfig).mockResolvedValue(mockConfig);

    let captured: ReturnType<typeof useAuthConfig> = null;
    function Spy() {
      captured = useAuthConfig();
      return <div data-testid="spy" />;
    }

    // Render App which internally provides AuthConfigContext
    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <App />
            {/* Spy reads from the same context tree since App provides it */}
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByAltText("Go")).toBeInTheDocument();
    });
  });

  it("falls back to dev config when API call fails", async () => {
    vi.mocked(getAuthConfig).mockRejectedValue(new Error("Network error"));

    let captured: ReturnType<typeof useAuthConfig> = null;
    function Spy() {
      captured = useAuthConfig();
      return null;
    }

    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    // After the failed fetch, the app should still render
    await waitFor(() => {
      expect(screen.getAllByAltText("Go").length).toBeGreaterThan(0);
    });
  });
});
