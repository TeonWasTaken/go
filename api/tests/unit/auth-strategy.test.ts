import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CorporateStrategy,
  DevStrategy,
  PublicStrategy,
  createStrategy,
  getRegistry,
  registerStrategy,
  type AuthMode,
  type AuthStrategy,
} from "../../src/shared/auth-strategy.js";

/** Minimal stub strategy for testing the registry/factory plumbing. */
function makeStub(mode: AuthMode): AuthStrategy {
  return {
    mode,
    extractIdentity: () => null,
    redirectRequiresAuth: mode === "corporate",
    identityProviders: [mode],
  };
}

describe("auth-strategy foundational module", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Snapshot env vars we'll mutate
    savedEnv.AUTH_MODE = process.env.AUTH_MODE;
    savedEnv.CORPORATE_LOCK = process.env.CORPORATE_LOCK;

    // Register stub strategies so the factory can resolve them
    registerStrategy("corporate", () => makeStub("corporate"));
    registerStrategy("public", () => makeStub("public"));
    registerStrategy("dev", () => makeStub("dev"));
  });

  afterEach(() => {
    // Restore env
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  // ── Registry ────────────────────────────────────────────────────

  describe("StrategyRegistry", () => {
    it("registers and exposes strategy constructors", () => {
      const reg = getRegistry();
      expect(reg.corporate).toBeDefined();
      expect(reg.public).toBeDefined();
      expect(reg.dev).toBeDefined();
    });

    it("allows overwriting a registered strategy", () => {
      const custom: AuthStrategy = {
        mode: "dev",
        extractIdentity: () => ({ email: "custom@test", roles: ["Admin"] }),
        redirectRequiresAuth: true,
        identityProviders: ["custom"],
      };
      registerStrategy("dev", () => custom);
      process.env.AUTH_MODE = "dev";
      delete process.env.CORPORATE_LOCK;
      const strategy = createStrategy();
      expect(strategy.identityProviders).toEqual(["custom"]);
    });
  });

  // ── Factory: valid modes ────────────────────────────────────────

  describe("StrategyFactory.createStrategy()", () => {
    it.each(["corporate", "public", "dev"] as AuthMode[])(
      "returns a strategy with mode=%s when AUTH_MODE=%s",
      (mode) => {
        process.env.AUTH_MODE = mode;
        delete process.env.CORPORATE_LOCK;
        const strategy = createStrategy();
        expect(strategy.mode).toBe(mode);
      },
    );

    it("returns a frozen instance", () => {
      process.env.AUTH_MODE = "corporate";
      delete process.env.CORPORATE_LOCK;
      const strategy = createStrategy();
      expect(Object.isFrozen(strategy)).toBe(true);
    });
  });

  // ── Factory: invalid / missing AUTH_MODE ─────────────────────────

  describe("StrategyFactory — invalid AUTH_MODE", () => {
    it("throws when AUTH_MODE is not set", () => {
      delete process.env.AUTH_MODE;
      delete process.env.CORPORATE_LOCK;
      expect(() => createStrategy()).toThrow(/Invalid or missing AUTH_MODE/);
    });

    it("throws when AUTH_MODE is an unrecognized value", () => {
      process.env.AUTH_MODE = "staging";
      delete process.env.CORPORATE_LOCK;
      expect(() => createStrategy()).toThrow(/Invalid or missing AUTH_MODE/);
    });

    it("includes valid modes in the error message", () => {
      process.env.AUTH_MODE = "bad";
      delete process.env.CORPORATE_LOCK;
      expect(() => createStrategy()).toThrow(/corporate, public, dev/);
    });
  });

  // ── CORPORATE_LOCK ──────────────────────────────────────────────

  describe("CORPORATE_LOCK enforcement", () => {
    it("allows corporate mode when CORPORATE_LOCK=true", () => {
      process.env.AUTH_MODE = "corporate";
      process.env.CORPORATE_LOCK = "true";
      expect(() => createStrategy()).not.toThrow();
    });

    it("throws when CORPORATE_LOCK=true and AUTH_MODE=public", () => {
      process.env.AUTH_MODE = "public";
      process.env.CORPORATE_LOCK = "true";
      expect(() => createStrategy()).toThrow(/CORPORATE_LOCK/);
    });

    it("throws when CORPORATE_LOCK=true and AUTH_MODE=dev", () => {
      process.env.AUTH_MODE = "dev";
      process.env.CORPORATE_LOCK = "true";
      expect(() => createStrategy()).toThrow(/CORPORATE_LOCK/);
    });

    it("throws when CORPORATE_LOCK=true and AUTH_MODE is not set", () => {
      delete process.env.AUTH_MODE;
      process.env.CORPORATE_LOCK = "true";
      expect(() => createStrategy()).toThrow(/CORPORATE_LOCK/);
    });

    it("allows any valid mode when CORPORATE_LOCK is not set", () => {
      delete process.env.CORPORATE_LOCK;
      for (const mode of ["corporate", "public", "dev"] as AuthMode[]) {
        process.env.AUTH_MODE = mode;
        expect(() => createStrategy()).not.toThrow();
      }
    });

    it("allows any valid mode when CORPORATE_LOCK=false", () => {
      process.env.CORPORATE_LOCK = "false";
      for (const mode of ["corporate", "public", "dev"] as AuthMode[]) {
        process.env.AUTH_MODE = mode;
        expect(() => createStrategy()).not.toThrow();
      }
    });

    it("checks CORPORATE_LOCK before validating AUTH_MODE (Req 10.6)", () => {
      // If CORPORATE_LOCK is true and AUTH_MODE is invalid, the lock error
      // should fire first (since the mode isn't "corporate").
      process.env.AUTH_MODE = "invalid";
      process.env.CORPORATE_LOCK = "true";
      expect(() => createStrategy()).toThrow(/CORPORATE_LOCK/);
    });
  });
});

// ── CorporateStrategy ─────────────────────────────────────────────

describe("CorporateStrategy", () => {
  const strategy = new CorporateStrategy();

  it("has mode = 'corporate'", () => {
    expect(strategy.mode).toBe("corporate");
  });

  it("has redirectRequiresAuth = true", () => {
    expect(strategy.redirectRequiresAuth).toBe(true);
  });

  it("has identityProviders = ['aad']", () => {
    expect(strategy.identityProviders).toEqual(["aad"]);
  });

  it("is registered in the strategy registry", () => {
    // Re-register the real CorporateStrategy (beforeEach in the foundational
    // suite overwrites it with a stub)
    registerStrategy("corporate", () => new CorporateStrategy());
    const reg = getRegistry();
    expect(reg.corporate).toBeDefined();
    const instance = reg.corporate!();
    expect(instance).toBeInstanceOf(CorporateStrategy);
  });

  describe("extractIdentity", () => {
    function encodeClientPrincipal(obj: Record<string, unknown>): string {
      return Buffer.from(JSON.stringify(obj)).toString("base64");
    }

    it("extracts email and roles from a valid x-ms-client-principal header", () => {
      const header = encodeClientPrincipal({
        identityProvider: "aad",
        userId: "abc123",
        userDetails: "alice@contoso.com",
        userRoles: ["User", "Admin"],
      });
      const identity = strategy.extractIdentity({
        "x-ms-client-principal": header,
      });
      expect(identity).toEqual({
        email: "alice@contoso.com",
        roles: ["User", "Admin"],
      });
    });

    it("returns null when x-ms-client-principal header is missing", () => {
      expect(strategy.extractIdentity({})).toBeNull();
    });

    it("returns null when header is not valid Base64", () => {
      expect(
        strategy.extractIdentity({ "x-ms-client-principal": "%%%invalid%%%" }),
      ).toBeNull();
    });

    it("returns null when decoded JSON has empty userDetails", () => {
      const header = encodeClientPrincipal({
        identityProvider: "aad",
        userId: "abc123",
        userDetails: "",
        userRoles: ["User"],
      });
      expect(
        strategy.extractIdentity({ "x-ms-client-principal": header }),
      ).toBeNull();
    });

    it("returns empty roles array when userRoles is missing", () => {
      const header = encodeClientPrincipal({
        identityProvider: "aad",
        userId: "abc123",
        userDetails: "bob@contoso.com",
      });
      const identity = strategy.extractIdentity({
        "x-ms-client-principal": header,
      });
      expect(identity).toEqual({ email: "bob@contoso.com", roles: [] });
    });
  });
});

// ── PublicStrategy ──────────────────────────────────────────────────

describe("PublicStrategy", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.PUBLIC_AUTH_PROVIDERS = process.env.PUBLIC_AUTH_PROVIDERS;
  });

  afterEach(() => {
    if (savedEnv.PUBLIC_AUTH_PROVIDERS === undefined) {
      delete process.env.PUBLIC_AUTH_PROVIDERS;
    } else {
      process.env.PUBLIC_AUTH_PROVIDERS = savedEnv.PUBLIC_AUTH_PROVIDERS;
    }
  });

  it("has mode = 'public'", () => {
    delete process.env.PUBLIC_AUTH_PROVIDERS;
    const strategy = new PublicStrategy();
    expect(strategy.mode).toBe("public");
  });

  it("has redirectRequiresAuth = false", () => {
    delete process.env.PUBLIC_AUTH_PROVIDERS;
    const strategy = new PublicStrategy();
    expect(strategy.redirectRequiresAuth).toBe(false);
  });

  it("defaults identityProviders to ['google'] when PUBLIC_AUTH_PROVIDERS is not set", () => {
    delete process.env.PUBLIC_AUTH_PROVIDERS;
    const strategy = new PublicStrategy();
    expect(strategy.identityProviders).toEqual(["google"]);
  });

  it("reads identity providers from PUBLIC_AUTH_PROVIDERS env var", () => {
    process.env.PUBLIC_AUTH_PROVIDERS = "google,github";
    const strategy = new PublicStrategy();
    expect(strategy.identityProviders).toEqual(["google", "github"]);
  });

  it("trims whitespace from provider names", () => {
    process.env.PUBLIC_AUTH_PROVIDERS = " google , github ";
    const strategy = new PublicStrategy();
    expect(strategy.identityProviders).toEqual(["google", "github"]);
  });

  it("filters out empty provider entries", () => {
    process.env.PUBLIC_AUTH_PROVIDERS = "google,,github,";
    const strategy = new PublicStrategy();
    expect(strategy.identityProviders).toEqual(["google", "github"]);
  });

  it("is registered in the strategy registry", () => {
    registerStrategy("public", () => new PublicStrategy());
    const reg = getRegistry();
    expect(reg.public).toBeDefined();
    const instance = reg.public!();
    expect(instance).toBeInstanceOf(PublicStrategy);
  });

  describe("extractIdentity", () => {
    function encodeClientPrincipal(obj: Record<string, unknown>): string {
      return Buffer.from(JSON.stringify(obj)).toString("base64");
    }

    let strategy: PublicStrategy;

    beforeEach(() => {
      delete process.env.PUBLIC_AUTH_PROVIDERS;
      strategy = new PublicStrategy();
    });

    it("extracts email and roles from a valid x-ms-client-principal header", () => {
      const header = encodeClientPrincipal({
        identityProvider: "google",
        userId: "xyz789",
        userDetails: "alice@gmail.com",
        userRoles: ["User"],
      });
      const identity = strategy.extractIdentity({
        "x-ms-client-principal": header,
      });
      expect(identity).toEqual({
        email: "alice@gmail.com",
        roles: ["User"],
      });
    });

    it("returns null when x-ms-client-principal header is missing", () => {
      expect(strategy.extractIdentity({})).toBeNull();
    });

    it("returns null when header is not valid Base64", () => {
      expect(
        strategy.extractIdentity({ "x-ms-client-principal": "%%%invalid%%%" }),
      ).toBeNull();
    });

    it("returns null when decoded JSON has empty userDetails", () => {
      const header = encodeClientPrincipal({
        identityProvider: "google",
        userId: "xyz789",
        userDetails: "",
        userRoles: ["User"],
      });
      expect(
        strategy.extractIdentity({ "x-ms-client-principal": header }),
      ).toBeNull();
    });

    it("returns empty roles array when userRoles is missing", () => {
      const header = encodeClientPrincipal({
        identityProvider: "google",
        userId: "xyz789",
        userDetails: "bob@gmail.com",
      });
      const identity = strategy.extractIdentity({
        "x-ms-client-principal": header,
      });
      expect(identity).toEqual({ email: "bob@gmail.com", roles: [] });
    });
  });
});

// ── DevStrategy ─────────────────────────────────────────────────────

describe("DevStrategy", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.DEV_USER_EMAIL = process.env.DEV_USER_EMAIL;
    savedEnv.DEV_USER_ROLES = process.env.DEV_USER_ROLES;
    delete process.env.DEV_USER_EMAIL;
    delete process.env.DEV_USER_ROLES;
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it("has mode = 'dev'", () => {
    const strategy = new DevStrategy();
    expect(strategy.mode).toBe("dev");
  });

  it("has redirectRequiresAuth = false", () => {
    const strategy = new DevStrategy();
    expect(strategy.redirectRequiresAuth).toBe(false);
  });

  it("has identityProviders = ['dev']", () => {
    const strategy = new DevStrategy();
    expect(strategy.identityProviders).toEqual(["dev"]);
  });

  it("is registered in the strategy registry", () => {
    registerStrategy("dev", () => new DevStrategy());
    const reg = getRegistry();
    expect(reg.dev).toBeDefined();
    const instance = reg.dev!();
    expect(instance).toBeInstanceOf(DevStrategy);
  });

  describe("extractIdentity", () => {
    let strategy: DevStrategy;

    beforeEach(() => {
      strategy = new DevStrategy();
    });

    // ── Email priority chain ──────────────────────────────────────

    it("uses x-mock-user-email header when present", () => {
      process.env.DEV_USER_EMAIL = "env@test.com";
      const identity = strategy.extractIdentity({
        "x-mock-user-email": "header@test.com",
      });
      expect(identity.email).toBe("header@test.com");
    });

    it("falls back to DEV_USER_EMAIL env when header is absent", () => {
      process.env.DEV_USER_EMAIL = "env@test.com";
      const identity = strategy.extractIdentity({});
      expect(identity.email).toBe("env@test.com");
    });

    it("falls back to dev@localhost when both header and env are absent", () => {
      const identity = strategy.extractIdentity({});
      expect(identity.email).toBe("dev@localhost");
    });

    // ── Roles priority chain ──────────────────────────────────────

    it("uses x-mock-user-roles header when present", () => {
      process.env.DEV_USER_ROLES = "EnvRole";
      const identity = strategy.extractIdentity({
        "x-mock-user-roles": "Admin,Editor",
      });
      expect(identity.roles).toEqual(["Admin", "Editor"]);
    });

    it("falls back to DEV_USER_ROLES env when header is absent", () => {
      process.env.DEV_USER_ROLES = "Manager,Viewer";
      const identity = strategy.extractIdentity({});
      expect(identity.roles).toEqual(["Manager", "Viewer"]);
    });

    it("falls back to ['User'] when both header and env are absent", () => {
      const identity = strategy.extractIdentity({});
      expect(identity.roles).toEqual(["User"]);
    });

    it("trims whitespace from role entries", () => {
      const identity = strategy.extractIdentity({
        "x-mock-user-roles": " Admin , Editor ",
      });
      expect(identity.roles).toEqual(["Admin", "Editor"]);
    });

    it("filters out empty role entries", () => {
      const identity = strategy.extractIdentity({
        "x-mock-user-roles": "Admin,,Editor,",
      });
      expect(identity.roles).toEqual(["Admin", "Editor"]);
    });

    // ── Always non-null ───────────────────────────────────────────

    it("always returns a non-null identity even with empty headers", () => {
      const identity = strategy.extractIdentity({});
      expect(identity).not.toBeNull();
      expect(identity.email).toBeTruthy();
      expect(identity.roles.length).toBeGreaterThanOrEqual(1);
    });

    it("returns non-null identity with arbitrary unrelated headers", () => {
      const identity = strategy.extractIdentity({
        "content-type": "application/json",
        authorization: "Bearer xyz",
      });
      expect(identity).not.toBeNull();
      expect(identity.email).toBe("dev@localhost");
      expect(identity.roles).toEqual(["User"]);
    });
  });
});
