import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveStorage } from "../../src/shared/storage-config.js";

describe("resolveStorage", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.COSMOS_CONNECTION_STRING;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns useInMemory true for dev mode without connection string", () => {
    const result = resolveStorage("dev");
    expect(result).toEqual({ useInMemory: true });
  });

  it("returns useInMemory false for dev mode with connection string", () => {
    process.env.COSMOS_CONNECTION_STRING =
      "AccountEndpoint=https://localhost:8081/;AccountKey=abc==";
    const result = resolveStorage("dev");
    expect(result).toEqual({ useInMemory: false });
  });

  it("throws for corporate mode without connection string", () => {
    expect(() => resolveStorage("corporate")).toThrow(
      'COSMOS_CONNECTION_STRING is required for AUTH_MODE="corporate"',
    );
  });

  it("throws for public mode without connection string", () => {
    expect(() => resolveStorage("public")).toThrow(
      'COSMOS_CONNECTION_STRING is required for AUTH_MODE="public"',
    );
  });

  it("returns useInMemory false for corporate mode with connection string", () => {
    process.env.COSMOS_CONNECTION_STRING =
      "AccountEndpoint=https://myaccount.documents.azure.com:443/;AccountKey=abc==";
    const result = resolveStorage("corporate");
    expect(result).toEqual({ useInMemory: false });
  });

  it("returns useInMemory false for public mode with connection string", () => {
    process.env.COSMOS_CONNECTION_STRING =
      "AccountEndpoint=https://myaccount.documents.azure.com:443/;AccountKey=abc==";
    const result = resolveStorage("public");
    expect(result).toEqual({ useInMemory: false });
  });
});
