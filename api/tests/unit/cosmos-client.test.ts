import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted so mock variables are available inside the hoisted vi.mock factory
const {
  mockContainer,
  mockDatabase,
  mockCosmosClient,
  MockCosmosClientConstructor,
} = vi.hoisted(() => {
  const mockContainer = { id: "aliases" };
  const mockDatabase = { container: vi.fn(() => mockContainer) };
  const mockCosmosClient = { database: vi.fn(() => mockDatabase) };
  const MockCosmosClientConstructor = vi.fn(() => mockCosmosClient);
  return {
    mockContainer,
    mockDatabase,
    mockCosmosClient,
    MockCosmosClientConstructor,
  };
});

vi.mock("@azure/cosmos", () => ({
  CosmosClient: MockCosmosClientConstructor,
}));

import {
  createOptimizedContainer,
  initStorage,
  resetStorage,
} from "../../src/shared/cosmos-client.js";

describe("cosmos-client eager initialization", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetStorage();
    MockCosmosClientConstructor.mockClear();
    mockDatabase.container.mockClear();
    mockCosmosClient.database.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetStorage();
  });

  // CP-1: Eager initialization populates container for Cosmos mode
  describe("CP-1: Cosmos mode eager initialization", () => {
    it("creates CosmosClient and populates container when useInMemory is false", () => {
      process.env.COSMOS_CONNECTION_STRING =
        "AccountEndpoint=https://localhost:8081/;AccountKey=abc==";

      initStorage({ useInMemory: false });

      expect(MockCosmosClientConstructor).toHaveBeenCalledTimes(1);
      expect(mockCosmosClient.database).toHaveBeenCalledWith("go-url-alias");
      expect(mockDatabase.container).toHaveBeenCalledWith("aliases");
    });

    it("creates CosmosClient with keepAlive agent", () => {
      process.env.COSMOS_CONNECTION_STRING =
        "AccountEndpoint=https://localhost:8081/;AccountKey=abc==";

      initStorage({ useInMemory: false });

      const callArgs = MockCosmosClientConstructor.mock.calls[0][0];
      expect(callArgs.agent).toBeDefined();
      expect(callArgs.agent.keepAlive).toBe(true);
    });

    it("parses connection string into endpoint and key", () => {
      process.env.COSMOS_CONNECTION_STRING =
        "AccountEndpoint=https://localhost:8081/;AccountKey=abc==";

      initStorage({ useInMemory: false });

      const callArgs = MockCosmosClientConstructor.mock.calls[0][0];
      expect(callArgs.endpoint).toBe("https://localhost:8081/");
      expect(callArgs.key).toBe("abc==");
    });

    it("passes preferredLocations when COSMOS_PREFERRED_LOCATIONS is set", () => {
      process.env.COSMOS_CONNECTION_STRING =
        "AccountEndpoint=https://localhost:8081/;AccountKey=abc==";
      process.env.COSMOS_PREFERRED_LOCATIONS = "East US, West US";

      initStorage({ useInMemory: false });

      const callArgs = MockCosmosClientConstructor.mock.calls[0][0];
      expect(callArgs.connectionPolicy.preferredLocations).toEqual([
        "East US",
        "West US",
      ]);
    });

    it("throws when COSMOS_CONNECTION_STRING is not set in Cosmos mode", () => {
      delete process.env.COSMOS_CONNECTION_STRING;

      expect(() => initStorage({ useInMemory: false })).toThrow(
        "COSMOS_CONNECTION_STRING environment variable is not set",
      );
    });
  });

  // CP-2: In-memory mode does not trigger Cosmos initialization
  describe("CP-2: In-memory mode skips Cosmos initialization", () => {
    it("does not create CosmosClient when useInMemory is true", () => {
      initStorage({ useInMemory: true });

      expect(MockCosmosClientConstructor).not.toHaveBeenCalled();
    });

    it("does not call database() or container() when useInMemory is true", () => {
      initStorage({ useInMemory: true });

      expect(mockCosmosClient.database).not.toHaveBeenCalled();
      expect(mockDatabase.container).not.toHaveBeenCalled();
    });
  });

  // Direct createOptimizedContainer tests
  describe("createOptimizedContainer", () => {
    it("returns a container reference", () => {
      process.env.COSMOS_CONNECTION_STRING =
        "AccountEndpoint=https://localhost:8081/;AccountKey=abc==";

      const container = createOptimizedContainer();

      expect(container).toBe(mockContainer);
    });

    it("does not set preferredLocations when env var is absent", () => {
      process.env.COSMOS_CONNECTION_STRING =
        "AccountEndpoint=https://localhost:8081/;AccountKey=abc==";
      delete process.env.COSMOS_PREFERRED_LOCATIONS;

      createOptimizedContainer();

      const callArgs = MockCosmosClientConstructor.mock.calls[0][0];
      expect(callArgs.connectionPolicy.preferredLocations).toBeUndefined();
    });
  });
});
