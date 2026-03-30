import { describe, expect, it } from "vitest";
import {
  generateAliasId,
  validateAlias,
  validateCreateAliasRequest,
  validateDestinationUrl,
  validateExpiryPolicy,
  validateFixedPolicyConfig,
  validateUpdateAliasRequest,
} from "../../src/shared/models.js";

describe("validateAlias", () => {
  it("accepts lowercase alphanumeric aliases", () => {
    expect(validateAlias("benefits")).toEqual({ valid: true });
    expect(validateAlias("my-link")).toEqual({ valid: true });
    expect(validateAlias("abc123")).toEqual({ valid: true });
    expect(validateAlias("a-b-c")).toEqual({ valid: true });
  });

  it("rejects empty alias", () => {
    const result = validateAlias("");
    expect(result.valid).toBe(false);
  });

  it("rejects uppercase characters", () => {
    const result = validateAlias("Benefits");
    expect(result.valid).toBe(false);
  });

  it("rejects special characters", () => {
    expect(validateAlias("my_link").valid).toBe(false);
    expect(validateAlias("my link").valid).toBe(false);
    expect(validateAlias("my.link").valid).toBe(false);
    expect(validateAlias("my/link").valid).toBe(false);
  });
});

describe("validateDestinationUrl", () => {
  it("accepts valid URLs", () => {
    expect(validateDestinationUrl("https://example.com")).toEqual({
      valid: true,
    });
    expect(validateDestinationUrl("http://localhost:3000/path")).toEqual({
      valid: true,
    });
  });

  it("rejects empty URL", () => {
    expect(validateDestinationUrl("").valid).toBe(false);
  });

  it("rejects invalid URL format", () => {
    expect(validateDestinationUrl("not-a-url").valid).toBe(false);
    expect(validateDestinationUrl("ftp//missing-colon").valid).toBe(false);
  });
});

describe("validateExpiryPolicy", () => {
  it("accepts undefined policy type (defaults handled elsewhere)", () => {
    expect(validateExpiryPolicy(undefined, undefined, undefined)).toEqual({
      valid: true,
    });
  });

  it("accepts 'never' without duration fields", () => {
    expect(validateExpiryPolicy("never", undefined, undefined)).toEqual({
      valid: true,
    });
  });

  it("rejects 'never' with duration_months", () => {
    expect(validateExpiryPolicy("never", 3, undefined).valid).toBe(false);
  });

  it("accepts 'inactivity' without duration fields", () => {
    expect(validateExpiryPolicy("inactivity", undefined, undefined)).toEqual({
      valid: true,
    });
  });

  it("rejects 'inactivity' with duration_months", () => {
    expect(validateExpiryPolicy("inactivity", 12, undefined).valid).toBe(false);
  });

  it("rejects invalid policy type", () => {
    expect(validateExpiryPolicy("weekly", undefined, undefined).valid).toBe(
      false,
    );
  });

  it("accepts 'fixed' with valid duration_months", () => {
    expect(validateExpiryPolicy("fixed", 1, undefined)).toEqual({
      valid: true,
    });
    expect(validateExpiryPolicy("fixed", 3, undefined)).toEqual({
      valid: true,
    });
    expect(validateExpiryPolicy("fixed", 12, undefined)).toEqual({
      valid: true,
    });
  });

  it("accepts 'fixed' with valid future custom_expires_at", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(validateExpiryPolicy("fixed", undefined, future)).toEqual({
      valid: true,
    });
  });

  it("rejects 'fixed' with both duration and custom date", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(validateExpiryPolicy("fixed", 3, future).valid).toBe(false);
  });

  it("rejects 'fixed' with neither duration nor custom date", () => {
    expect(validateExpiryPolicy("fixed", undefined, undefined).valid).toBe(
      false,
    );
  });
});

describe("validateFixedPolicyConfig", () => {
  it("rejects invalid duration_months values", () => {
    expect(validateFixedPolicyConfig(6, undefined).valid).toBe(false);
    expect(validateFixedPolicyConfig(2, undefined).valid).toBe(false);
  });

  it("rejects past custom_expires_at", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(validateFixedPolicyConfig(undefined, past).valid).toBe(false);
  });

  it("rejects invalid date string for custom_expires_at", () => {
    expect(validateFixedPolicyConfig(undefined, "not-a-date").valid).toBe(
      false,
    );
  });
});

describe("generateAliasId", () => {
  it("returns alias for global aliases", () => {
    expect(generateAliasId("benefits", false, "user@example.com")).toBe(
      "benefits",
    );
  });

  it("returns alias:createdBy for private aliases", () => {
    expect(generateAliasId("benefits", true, "user@example.com")).toBe(
      "benefits:user@example.com",
    );
  });
});

describe("validateCreateAliasRequest", () => {
  it("accepts a valid request with defaults", () => {
    const result = validateCreateAliasRequest({
      alias: "my-link",
      destination_url: "https://example.com",
      title: "My Link",
    });
    expect(result).toEqual({ valid: true });
  });

  it("accepts a valid request with fixed expiry", () => {
    const result = validateCreateAliasRequest({
      alias: "my-link",
      destination_url: "https://example.com",
      title: "My Link",
      expiry_policy_type: "fixed",
      duration_months: 3,
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejects invalid alias", () => {
    const result = validateCreateAliasRequest({
      alias: "INVALID",
      destination_url: "https://example.com",
      title: "Test",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid destination URL", () => {
    const result = validateCreateAliasRequest({
      alias: "valid",
      destination_url: "not-a-url",
      title: "Test",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects missing title", () => {
    const result = validateCreateAliasRequest({
      alias: "valid",
      destination_url: "https://example.com",
      title: "",
    });
    expect(result.valid).toBe(false);
  });
});

describe("validateUpdateAliasRequest", () => {
  it("accepts empty update (no fields)", () => {
    expect(validateUpdateAliasRequest({})).toEqual({ valid: true });
  });

  it("accepts valid destination_url update", () => {
    expect(
      validateUpdateAliasRequest({ destination_url: "https://new.com" }),
    ).toEqual({ valid: true });
  });

  it("rejects invalid destination_url update", () => {
    expect(validateUpdateAliasRequest({ destination_url: "bad" }).valid).toBe(
      false,
    );
  });

  it("validates expiry policy on update", () => {
    expect(
      validateUpdateAliasRequest({
        expiry_policy_type: "fixed",
        duration_months: 3,
      }),
    ).toEqual({ valid: true });

    expect(
      validateUpdateAliasRequest({
        expiry_policy_type: "fixed",
      }).valid,
    ).toBe(false);
  });
});
