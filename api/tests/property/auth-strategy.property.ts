import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CorporateStrategy,
  DevStrategy,
  PublicStrategy,
  createStrategy,
  registerStrategy,
} from "../../src/shared/auth-strategy.js";

// ── Env helpers ─────────────────────────────────────────────────────

const AUTH_VARS = [
  "AUTH_MODE",
  "CORPORATE_LOCK",
  "PUBLIC_AUTH_PROVIDERS",
  "DEV_USER_EMAIL",
  "DEV_USER_ROLES",
] as const;

let savedEnv: Record<string, string | undefined>;

function saveEnv() {
  savedEnv = {};
  for (const key of AUTH_VARS) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of AUTH_VARS) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
}

// ── Generators ──────────────────────────────────────────────────────

const validModes = ["corporate", "public", "dev"] as const;

/** Arbitrary that produces one of the three valid AUTH_MODE values. */
const validModeArb = fc.constantFrom(...validModes);

/** Arbitrary that produces strings which are NOT valid AUTH_MODE values. */
const invalidModeArb = fc
  .oneof(
    fc.constant(""),
    fc.constant("Corporate"),
    fc.constant("PUBLIC"),
    fc.constant("DEV"),
    fc.constant("production"),
    fc.constant("staging"),
    fc.constant("test"),
    fc.string({ minLength: 1, maxLength: 20 }),
  )
  .filter((s) => !(validModes as readonly string[]).includes(s));

// Feature: multi-tenant-auth-modes, Property 1: Strategy factory mode resolution
describe("Property 1: Strategy factory mode resolution", () => {
  beforeEach(() => {
    saveEnv();
    // Re-register all three strategies so tests are self-contained
    registerStrategy("corporate", () => new CorporateStrategy());
    registerStrategy("public", () => new PublicStrategy());
    registerStrategy("dev", () => new DevStrategy());
    // Ensure CORPORATE_LOCK doesn't interfere
    delete process.env.CORPORATE_LOCK;
  });

  afterEach(() => {
    restoreEnv();
  });

  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2**
   *
   * For any string value of AUTH_MODE, the StrategyFactory succeeds if and
   * only if the value is one of "corporate", "public", or "dev". When it
   * succeeds, the returned strategy's mode property equals the input value.
   * When it fails, a descriptive error is thrown.
   */
  it("succeeds with correct mode for any valid AUTH_MODE value", () => {
    fc.assert(
      fc.property(validModeArb, (mode) => {
        process.env.AUTH_MODE = mode;
        const strategy = createStrategy();
        expect(strategy.mode).toBe(mode);
      }),
      { numRuns: 100 },
    );
  });

  it("throws a descriptive error for any invalid AUTH_MODE value", () => {
    fc.assert(
      fc.property(invalidModeArb, (mode) => {
        process.env.AUTH_MODE = mode;
        expect(() => createStrategy()).toThrowError(
          /Invalid or missing AUTH_MODE/,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("throws a descriptive error when AUTH_MODE is not set", () => {
    delete process.env.AUTH_MODE;
    expect(() => createStrategy()).toThrowError(/Invalid or missing AUTH_MODE/);
  });
});

// Feature: multi-tenant-auth-modes, Property 2: SWA header identity extraction round-trip
describe("Property 2: SWA header identity extraction round-trip", () => {
  /**
   * **Validates: Requirements 3.1, 4.3**
   *
   * For any valid ClientPrincipal object (with non-empty userDetails and an
   * array of userRoles), Base64-encoding it and passing it to
   * CorporateStrategy.extractIdentity (or PublicStrategy.extractIdentity)
   * returns an AuthIdentity whose email equals userDetails and whose roles
   * equals userRoles.
   */

  /** Arbitrary that produces a valid ClientPrincipal with non-empty userDetails. */
  const clientPrincipalArb = fc.record({
    identityProvider: fc.string({ minLength: 1, maxLength: 30 }),
    userId: fc.string({ minLength: 1, maxLength: 50 }),
    userDetails: fc.string({ minLength: 1, maxLength: 100 }),
    userRoles: fc.array(fc.string({ minLength: 1, maxLength: 30 }), {
      minLength: 0,
      maxLength: 10,
    }),
  });

  function encodeClientPrincipal(principal: {
    identityProvider: string;
    userId: string;
    userDetails: string;
    userRoles: string[];
  }): string {
    return Buffer.from(JSON.stringify(principal)).toString("base64");
  }

  it("CorporateStrategy round-trips any valid ClientPrincipal", () => {
    const strategy = new CorporateStrategy();

    fc.assert(
      fc.property(clientPrincipalArb, (principal) => {
        const header = encodeClientPrincipal(principal);
        const identity = strategy.extractIdentity({
          "x-ms-client-principal": header,
        });

        expect(identity).not.toBeNull();
        expect(identity!.email).toBe(principal.userDetails);
        expect(identity!.roles).toEqual(principal.userRoles);
      }),
      { numRuns: 100 },
    );
  });

  it("PublicStrategy round-trips any valid ClientPrincipal", () => {
    const strategy = new PublicStrategy();

    fc.assert(
      fc.property(clientPrincipalArb, (principal) => {
        const header = encodeClientPrincipal(principal);
        const identity = strategy.extractIdentity({
          "x-ms-client-principal": header,
        });

        expect(identity).not.toBeNull();
        expect(identity!.email).toBe(principal.userDetails);
        expect(identity!.roles).toEqual(principal.userRoles);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: multi-tenant-auth-modes, Property 3: Invalid header returns null identity
describe("Property 3: Invalid header returns null identity", () => {
  /**
   * **Validates: Requirements 3.2, 4.4**
   *
   * For any string that is not a valid Base64-encoded JSON object with a
   * non-empty `userDetails` field, `CorporateStrategy.extractIdentity` and
   * `PublicStrategy.extractIdentity` return `null`. Additionally, when the
   * header is missing entirely, both return `null`.
   */

  const corporate = new CorporateStrategy();
  const publicStrategy = new PublicStrategy();

  /** Arbitrary that produces random strings that are unlikely to be valid Base64 JSON with userDetails. */
  const nonBase64Arb = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => {
      // Filter out strings that happen to be valid Base64 JSON with non-empty userDetails
      try {
        const decoded = Buffer.from(s, "base64").toString("utf-8");
        const parsed = JSON.parse(decoded);
        return (
          !parsed.userDetails ||
          typeof parsed.userDetails !== "string" ||
          parsed.userDetails.trim() === ""
        );
      } catch {
        return true; // Not valid Base64 JSON — keep it
      }
    });

  /** Arbitrary that produces valid Base64 strings whose decoded content is NOT valid JSON. */
  const base64NonJsonArb = fc
    .string({ minLength: 1, maxLength: 80 })
    .filter((s) => {
      try {
        JSON.parse(s);
        return false; // It IS valid JSON — reject
      } catch {
        return true;
      }
    })
    .map((s) => Buffer.from(s).toString("base64"));

  /** Arbitrary that produces valid Base64 JSON but with missing or empty userDetails. */
  const base64JsonMissingUserDetailsArb = fc.oneof(
    // Object with no userDetails key
    fc
      .record({
        identityProvider: fc.string({ maxLength: 20 }),
        userId: fc.string({ maxLength: 20 }),
      })
      .map((obj) => Buffer.from(JSON.stringify(obj)).toString("base64")),
    // Object with empty string userDetails
    fc
      .record({
        identityProvider: fc.string({ maxLength: 20 }),
        userId: fc.string({ maxLength: 20 }),
        userDetails: fc.constant(""),
        userRoles: fc.array(fc.string({ maxLength: 10 }), { maxLength: 5 }),
      })
      .map((obj) => Buffer.from(JSON.stringify(obj)).toString("base64")),
  );

  it("random non-Base64 strings → null for CorporateStrategy", () => {
    fc.assert(
      fc.property(nonBase64Arb, (header) => {
        const identity = corporate.extractIdentity({
          "x-ms-client-principal": header,
        });
        expect(identity).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("random non-Base64 strings → null for PublicStrategy", () => {
    fc.assert(
      fc.property(nonBase64Arb, (header) => {
        const identity = publicStrategy.extractIdentity({
          "x-ms-client-principal": header,
        });
        expect(identity).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("valid Base64 but not valid JSON → null for CorporateStrategy", () => {
    fc.assert(
      fc.property(base64NonJsonArb, (header) => {
        const identity = corporate.extractIdentity({
          "x-ms-client-principal": header,
        });
        expect(identity).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("valid Base64 but not valid JSON → null for PublicStrategy", () => {
    fc.assert(
      fc.property(base64NonJsonArb, (header) => {
        const identity = publicStrategy.extractIdentity({
          "x-ms-client-principal": header,
        });
        expect(identity).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("valid Base64 JSON but missing/empty userDetails → null for CorporateStrategy", () => {
    fc.assert(
      fc.property(base64JsonMissingUserDetailsArb, (header) => {
        const identity = corporate.extractIdentity({
          "x-ms-client-principal": header,
        });
        expect(identity).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("valid Base64 JSON but missing/empty userDetails → null for PublicStrategy", () => {
    fc.assert(
      fc.property(base64JsonMissingUserDetailsArb, (header) => {
        const identity = publicStrategy.extractIdentity({
          "x-ms-client-principal": header,
        });
        expect(identity).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("missing header entirely → null for CorporateStrategy", () => {
    const identity = corporate.extractIdentity({});
    expect(identity).toBeNull();
  });

  it("missing header entirely → null for PublicStrategy", () => {
    const identity = publicStrategy.extractIdentity({});
    expect(identity).toBeNull();
  });
});

// Feature: multi-tenant-auth-modes, Property 10: Corporate lock enforcement
describe("Property 10: Corporate lock enforcement", () => {
  beforeEach(() => {
    saveEnv();
    registerStrategy("corporate", () => new CorporateStrategy());
    registerStrategy("public", () => new PublicStrategy());
    registerStrategy("dev", () => new DevStrategy());
  });

  afterEach(() => {
    restoreEnv();
  });

  /**
   * **Validates: Requirements 10.2, 10.4**
   *
   * For any combination of CORPORATE_LOCK and AUTH_MODE values, the
   * StrategyFactory throws if and only if CORPORATE_LOCK is "true" and
   * AUTH_MODE is not "corporate". When CORPORATE_LOCK is not "true",
   * any valid AUTH_MODE is accepted.
   */

  /** Arbitrary for CORPORATE_LOCK values: "true", "false", undefined, or random strings. */
  const corporateLockArb = fc.oneof(
    fc.constant("true"),
    fc.constant("false"),
    fc.constant(undefined as string | undefined),
    fc.string({ minLength: 0, maxLength: 20 }),
  );

  /** Arbitrary for AUTH_MODE values: valid modes plus invalid/random strings. */
  const authModeArb = fc.oneof(
    fc.constantFrom("corporate", "public", "dev"),
    fc.constant(undefined as string | undefined),
    fc.constant(""),
    fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => !["corporate", "public", "dev"].includes(s)),
  );

  it("throws iff CORPORATE_LOCK is 'true' and AUTH_MODE is not 'corporate'", () => {
    fc.assert(
      fc.property(corporateLockArb, authModeArb, (lock, mode) => {
        // Set env vars
        if (lock !== undefined) {
          process.env.CORPORATE_LOCK = lock;
        } else {
          delete process.env.CORPORATE_LOCK;
        }
        if (mode !== undefined) {
          process.env.AUTH_MODE = mode;
        } else {
          delete process.env.AUTH_MODE;
        }

        const lockIsTrue = lock === "true";
        const modeIsCorporate = mode === "corporate";
        const modeIsValid = ["corporate", "public", "dev"].includes(
          mode as string,
        );

        if (lockIsTrue && !modeIsCorporate) {
          // Should throw with corporate lock error
          expect(() => createStrategy()).toThrowError(/CORPORATE_LOCK/);
        } else if (!modeIsValid) {
          // Invalid mode (but no lock conflict) — should throw with invalid mode error
          expect(() => createStrategy()).toThrowError(
            /Invalid or missing AUTH_MODE/,
          );
        } else {
          // Valid mode and no lock conflict — should succeed
          const strategy = createStrategy();
          expect(strategy.mode).toBe(mode);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("accepts any valid AUTH_MODE when CORPORATE_LOCK is not 'true'", () => {
    /** CORPORATE_LOCK values that are NOT exactly "true". */
    const nonTrueLockArb = fc.oneof(
      fc.constant("false"),
      fc.constant(undefined as string | undefined),
      fc.constant(""),
      fc.constant("TRUE"),
      fc.constant("True"),
      fc.constant("1"),
      fc.string({ minLength: 0, maxLength: 20 }).filter((s) => s !== "true"),
    );

    fc.assert(
      fc.property(nonTrueLockArb, validModeArb, (lock, mode) => {
        if (lock !== undefined) {
          process.env.CORPORATE_LOCK = lock;
        } else {
          delete process.env.CORPORATE_LOCK;
        }
        process.env.AUTH_MODE = mode;

        const strategy = createStrategy();
        expect(strategy.mode).toBe(mode);
      }),
      { numRuns: 100 },
    );
  });
});
