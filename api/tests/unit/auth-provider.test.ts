import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MockAuthProvider,
  SwaAuthProvider,
  createAuthProvider,
} from "../../src/shared/auth-provider.js";
import { parseClientPrincipal } from "../../src/shared/client-principal.js";

function encodeClientPrincipal(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

describe("parseClientPrincipal", () => {
  it("decodes a valid Base64-encoded client principal", () => {
    const header = encodeClientPrincipal({
      identityProvider: "aad",
      userId: "abc123",
      userDetails: "alice@example.com",
      userRoles: ["User", "Admin"],
    });

    const result = parseClientPrincipal(header);

    expect(result.identityProvider).toBe("aad");
    expect(result.userId).toBe("abc123");
    expect(result.userDetails).toBe("alice@example.com");
    expect(result.userRoles).toEqual(["User", "Admin"]);
  });

  it("defaults missing fields gracefully", () => {
    const header = encodeClientPrincipal({});
    const result = parseClientPrincipal(header);

    expect(result.identityProvider).toBe("");
    expect(result.userId).toBe("");
    expect(result.userDetails).toBe("");
    expect(result.userRoles).toEqual([]);
  });

  it("throws on invalid Base64 / JSON", () => {
    expect(() => parseClientPrincipal("not-valid-json!!!")).toThrow();
  });
});

describe("SwaAuthProvider", () => {
  const provider = new SwaAuthProvider();

  it("extracts identity from a valid x-ms-client-principal header", () => {
    const header = encodeClientPrincipal({
      identityProvider: "aad",
      userId: "u1",
      userDetails: "bob@corp.com",
      userRoles: ["User"],
    });

    const identity = provider.extractIdentity({
      "x-ms-client-principal": header,
    });

    expect(identity).toEqual({ email: "bob@corp.com", roles: ["User"] });
  });

  it("returns null when header is missing", () => {
    expect(provider.extractIdentity({})).toBeNull();
  });

  it("returns null when header is malformed", () => {
    expect(
      provider.extractIdentity({ "x-ms-client-principal": "garbage" }),
    ).toBeNull();
  });

  it("returns null when userDetails is empty", () => {
    const header = encodeClientPrincipal({
      identityProvider: "aad",
      userId: "u1",
      userDetails: "",
      userRoles: ["User"],
    });

    expect(
      provider.extractIdentity({ "x-ms-client-principal": header }),
    ).toBeNull();
  });
});

describe("MockAuthProvider", () => {
  const provider = new MockAuthProvider();
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.DEV_USER_EMAIL = process.env.DEV_USER_EMAIL;
    savedEnv.DEV_USER_ROLES = process.env.DEV_USER_ROLES;
    delete process.env.DEV_USER_EMAIL;
    delete process.env.DEV_USER_ROLES;
  });

  afterEach(() => {
    if (savedEnv.DEV_USER_EMAIL !== undefined) {
      process.env.DEV_USER_EMAIL = savedEnv.DEV_USER_EMAIL;
    } else {
      delete process.env.DEV_USER_EMAIL;
    }
    if (savedEnv.DEV_USER_ROLES !== undefined) {
      process.env.DEV_USER_ROLES = savedEnv.DEV_USER_ROLES;
    } else {
      delete process.env.DEV_USER_ROLES;
    }
  });

  it("reads identity from mock headers", () => {
    const identity = provider.extractIdentity({
      "x-mock-user-email": "test@test.com",
      "x-mock-user-roles": "Admin,User",
    });

    expect(identity).toEqual({
      email: "test@test.com",
      roles: ["Admin", "User"],
    });
  });

  it("falls back to env vars when no mock headers", () => {
    process.env.DEV_USER_EMAIL = "env@dev.com";
    process.env.DEV_USER_ROLES = "Admin";

    const identity = provider.extractIdentity({});

    expect(identity).toEqual({ email: "env@dev.com", roles: ["Admin"] });
  });

  it("defaults to dev@localhost / User when no headers or env vars", () => {
    const identity = provider.extractIdentity({});

    expect(identity).toEqual({ email: "dev@localhost", roles: ["User"] });
  });

  it("always returns a non-null identity", () => {
    expect(provider.extractIdentity({})).not.toBeNull();
  });
});

describe("createAuthProvider", () => {
  const savedDevMode = process.env.DEV_MODE;

  afterEach(() => {
    if (savedDevMode !== undefined) {
      process.env.DEV_MODE = savedDevMode;
    } else {
      delete process.env.DEV_MODE;
    }
  });

  it("returns MockAuthProvider when DEV_MODE is 'true'", () => {
    process.env.DEV_MODE = "true";
    const provider = createAuthProvider();
    expect(provider).toBeInstanceOf(MockAuthProvider);
  });

  it("returns SwaAuthProvider when DEV_MODE is not set", () => {
    delete process.env.DEV_MODE;
    const provider = createAuthProvider();
    expect(provider).toBeInstanceOf(SwaAuthProvider);
  });

  it("returns SwaAuthProvider when DEV_MODE is 'false'", () => {
    process.env.DEV_MODE = "false";
    const provider = createAuthProvider();
    expect(provider).toBeInstanceOf(SwaAuthProvider);
  });
});
