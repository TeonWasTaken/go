import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MockAuthProvider,
  SwaAuthProvider,
  createAuthProvider,
} from "../../src/shared/auth-provider.js";
import { parseClientPrincipal } from "../../src/shared/client-principal.js";

// --- Generators ---

/** Generate a non-empty email-like string */
const emailArb = fc
  .tuple(
    fc.stringOf(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
      { minLength: 1, maxLength: 12 },
    ),
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), {
      minLength: 1,
      maxLength: 8,
    }),
    fc.constantFrom("com", "org", "net", "io", "dev"),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/** Generate a non-empty array of role strings */
const rolesArb = fc.array(
  fc.stringOf(
    fc.constantFrom(
      ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split(""),
    ),
    { minLength: 1, maxLength: 10 },
  ),
  { minLength: 1, maxLength: 5 },
);

/** Generate a valid identity provider name */
const identityProviderArb = fc.constantFrom(
  "aad",
  "github",
  "twitter",
  "google",
  "facebook",
);

/** Generate a userId string */
const userIdArb = fc.stringOf(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
  { minLength: 1, maxLength: 20 },
);

/** Generate a valid ClientPrincipal object */
const clientPrincipalArb = fc.record({
  identityProvider: identityProviderArb,
  userId: userIdArb,
  userDetails: emailArb,
  userRoles: rolesArb,
});

function encodeClientPrincipal(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

// Feature: go-url-alias-service, Property 20: Client principal identity extraction
describe("Property 20: Client principal identity extraction", () => {
  /**
   * **Validates: Requirements 14.15, 14.17**
   *
   * For any valid Base64-encoded client principal header containing an email and roles array,
   * the parseClientPrincipal function should correctly extract the identityProvider, userId,
   * userDetails (email), and userRoles. The SwaAuthProvider should return an AuthIdentity
   * with the email from userDetails and the roles from userRoles.
   */
  it("parseClientPrincipal correctly extracts all fields from any valid Base64-encoded header", () => {
    fc.assert(
      fc.property(clientPrincipalArb, (principal) => {
        const encoded = encodeClientPrincipal(principal);
        const parsed = parseClientPrincipal(encoded);

        expect(parsed.identityProvider).toBe(principal.identityProvider);
        expect(parsed.userId).toBe(principal.userId);
        expect(parsed.userDetails).toBe(principal.userDetails);
        expect(parsed.userRoles).toEqual(principal.userRoles);
      }),
      { numRuns: 100 },
    );
  });

  it("SwaAuthProvider extracts email from userDetails and roles from userRoles for any valid principal", () => {
    const provider = new SwaAuthProvider();

    fc.assert(
      fc.property(clientPrincipalArb, (principal) => {
        const encoded = encodeClientPrincipal(principal);
        const identity = provider.extractIdentity({
          "x-ms-client-principal": encoded,
        });

        // userDetails is always non-empty from our generator (emailArb)
        expect(identity).not.toBeNull();
        expect(identity!.email).toBe(principal.userDetails);
        expect(identity!.roles).toEqual(principal.userRoles);
      }),
      { numRuns: 100 },
    );
  });

  it("SwaAuthProvider ignores any user-provided identity and only trusts x-ms-client-principal", () => {
    const provider = new SwaAuthProvider();

    fc.assert(
      fc.property(clientPrincipalArb, emailArb, (principal, spoofedEmail) => {
        const encoded = encodeClientPrincipal(principal);
        // Even if extra headers with spoofed identity are present, SwaAuthProvider
        // should only use x-ms-client-principal
        const identity = provider.extractIdentity({
          "x-ms-client-principal": encoded,
          "x-mock-user-email": spoofedEmail,
          "x-spoofed-identity": spoofedEmail,
        });

        expect(identity).not.toBeNull();
        expect(identity!.email).toBe(principal.userDetails);
        expect(identity!.roles).toEqual(principal.userRoles);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: go-url-alias-service, Property 24: Auth provider uses correct identity source based on mode
describe("Property 24: Auth provider uses correct identity source based on mode", () => {
  /**
   * **Validates: Requirements 14.19, 16.1, 16.2, 16.3, 16.4**
   *
   * - When DEV_MODE is 'true', createAuthProvider returns MockAuthProvider
   * - When DEV_MODE is not 'true', createAuthProvider returns SwaAuthProvider
   * - MockAuthProvider reads from x-mock-user-email and x-mock-user-roles headers,
   *   falling back to DEV_USER_EMAIL/DEV_USER_ROLES env vars, then to defaults
   * - SwaAuthProvider reads from x-ms-client-principal header only
   */

  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.DEV_MODE = process.env.DEV_MODE;
    savedEnv.DEV_USER_EMAIL = process.env.DEV_USER_EMAIL;
    savedEnv.DEV_USER_ROLES = process.env.DEV_USER_ROLES;
  });

  afterEach(() => {
    for (const key of ["DEV_MODE", "DEV_USER_EMAIL", "DEV_USER_ROLES"]) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it("createAuthProvider returns MockAuthProvider when DEV_MODE is 'true'", () => {
    process.env.DEV_MODE = "true";
    const provider = createAuthProvider();
    expect(provider).toBeInstanceOf(MockAuthProvider);
  });

  it("createAuthProvider returns SwaAuthProvider when DEV_MODE is not 'true'", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(undefined),
          fc.constant("false"),
          fc.constant(""),
          fc.constant("TRUE"),
          fc.constant("True"),
          fc.constant("1"),
          fc.constant("yes"),
          fc
            .stringOf(
              fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
              { minLength: 1, maxLength: 8 },
            )
            .filter((s) => s !== "true"),
        ),
        (devModeValue) => {
          if (devModeValue === undefined) {
            delete process.env.DEV_MODE;
          } else {
            process.env.DEV_MODE = devModeValue;
          }

          const provider = createAuthProvider();
          expect(provider).toBeInstanceOf(SwaAuthProvider);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("MockAuthProvider uses x-mock-user-email and x-mock-user-roles headers when present", () => {
    const provider = new MockAuthProvider();

    fc.assert(
      fc.property(emailArb, rolesArb, (email, roles) => {
        // Clear env vars so headers take priority
        delete process.env.DEV_USER_EMAIL;
        delete process.env.DEV_USER_ROLES;

        const rolesStr = roles.join(",");
        const identity = provider.extractIdentity({
          "x-mock-user-email": email,
          "x-mock-user-roles": rolesStr,
        });

        expect(identity).not.toBeNull();
        expect(identity!.email).toBe(email);
        expect(identity!.roles).toEqual(roles);
      }),
      { numRuns: 100 },
    );
  });

  it("MockAuthProvider falls back to DEV_USER_EMAIL/DEV_USER_ROLES env vars when no mock headers", () => {
    const provider = new MockAuthProvider();

    fc.assert(
      fc.property(emailArb, rolesArb, (email, roles) => {
        process.env.DEV_USER_EMAIL = email;
        process.env.DEV_USER_ROLES = roles.join(",");

        const identity = provider.extractIdentity({});

        expect(identity).not.toBeNull();
        expect(identity!.email).toBe(email);
        expect(identity!.roles).toEqual(roles);
      }),
      { numRuns: 100 },
    );
  });

  it("MockAuthProvider defaults to dev@localhost / User when no headers or env vars", () => {
    delete process.env.DEV_USER_EMAIL;
    delete process.env.DEV_USER_ROLES;

    const provider = new MockAuthProvider();
    const identity = provider.extractIdentity({});

    expect(identity).not.toBeNull();
    expect(identity!.email).toBe("dev@localhost");
    expect(identity!.roles).toEqual(["User"]);
  });

  it("SwaAuthProvider reads only from x-ms-client-principal header", () => {
    const provider = new SwaAuthProvider();

    fc.assert(
      fc.property(clientPrincipalArb, emailArb, (principal, mockEmail) => {
        const encoded = encodeClientPrincipal(principal);

        // SwaAuthProvider should use x-ms-client-principal, not mock headers
        const identity = provider.extractIdentity({
          "x-ms-client-principal": encoded,
          "x-mock-user-email": mockEmail,
          "x-mock-user-roles": "Admin",
        });

        expect(identity).not.toBeNull();
        expect(identity!.email).toBe(principal.userDetails);
        expect(identity!.roles).toEqual(principal.userRoles);
      }),
      { numRuns: 100 },
    );
  });

  it("SwaAuthProvider returns null when x-ms-client-principal is absent", () => {
    const provider = new SwaAuthProvider();

    fc.assert(
      fc.property(emailArb, (mockEmail) => {
        // Even with mock headers present, SwaAuthProvider should return null
        // when x-ms-client-principal is missing
        const identity = provider.extractIdentity({
          "x-mock-user-email": mockEmail,
          "x-mock-user-roles": "User",
        });

        expect(identity).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
