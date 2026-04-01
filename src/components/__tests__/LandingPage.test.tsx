import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthConfigContext } from "../../App";
import type { AuthConfigResponse } from "../../services/api";
import { ToastProvider } from "../ToastProvider";

// jsdom doesn't implement matchMedia — stub it
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

afterEach(() => {
  cleanup();
});

vi.mock("../../services/api", () => ({
  getLinks: vi.fn().mockResolvedValue([]),
  getAuthConfig: vi.fn().mockResolvedValue({
    mode: "dev",
    identityProviders: ["dev"],
    loginUrl: "",
  }),
}));

import { LandingPage } from "../LandingPage";

function renderWithContext(config: AuthConfigResponse | null) {
  return render(
    <AuthConfigContext.Provider value={config}>
      <ToastProvider>
        <LandingPage />
      </ToastProvider>
    </AuthConfigContext.Provider>,
  );
}

describe("LandingPage auth mode adaptation", () => {
  it("shows sign-in prompt in public mode", () => {
    renderWithContext({
      mode: "public",
      identityProviders: ["google"],
      loginUrl: "/.auth/login/google",
    });

    expect(
      screen.getByText(/sign in to create and manage/i),
    ).toBeInTheDocument();
  });

  it("redirects to loginUrl when Create New is clicked in public mode", () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, href: "" },
    });

    renderWithContext({
      mode: "public",
      identityProviders: ["google"],
      loginUrl: "/.auth/login/google",
    });

    fireEvent.click(screen.getByRole("button", { name: "Create New" }));
    expect(window.location.href).toBe("/.auth/login/google");
  });

  it("does not show sign-in prompt in corporate mode", () => {
    renderWithContext({
      mode: "corporate",
      identityProviders: ["aad"],
      loginUrl: "/.auth/login/aad",
    });

    expect(
      screen.queryByText(/sign in to create and manage/i),
    ).not.toBeInTheDocument();
  });

  it("does not show sign-in prompt in dev mode", () => {
    renderWithContext({
      mode: "dev",
      identityProviders: ["dev"],
      loginUrl: "",
    });

    expect(
      screen.queryByText(/sign in to create and manage/i),
    ).not.toBeInTheDocument();
  });

  it("always shows popular links section regardless of mode", () => {
    renderWithContext({
      mode: "public",
      identityProviders: ["google"],
      loginUrl: "/.auth/login/google",
    });

    expect(screen.getByText("Popular Links")).toBeInTheDocument();
  });
});
