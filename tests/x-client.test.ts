import { describe, expect, it } from "vitest";
import {
  createHttpXClient,
  getBearerTokenFromEnv,
  redactSecrets,
} from "../src/x-client.js";

describe("secret handling", () => {
  it("redacts bearer tokens from error text", () => {
    const raw =
      'Authorization: Bearer AAAA.BBBB.CCCC error; x-bearer-token=supersecret';
    const cleaned = redactSecrets(raw);
    expect(cleaned).not.toContain("AAAA.BBBB.CCCC");
    expect(cleaned).not.toContain("supersecret");
    expect(cleaned).toContain("[REDACTED]");
  });

  it("reads token only from env and never echoes it", () => {
    expect(() => getBearerTokenFromEnv({})).toThrow(/X_BEARER_TOKEN/);
    const token = getBearerTokenFromEnv({ X_BEARER_TOKEN: "unit-test-token" });
    expect(token).toBe("unit-test-token");
  });

  it("does not put the token into thrown network error messages", async () => {
    const client = createHttpXClient({
      bearerToken: "secret-token-value",
      fetchImpl: async () => {
        throw new Error("connect failed Bearer secret-token-value");
      },
    });

    await expect(
      client.searchRecent({ query: "#demo_event" })
    ).rejects.toThrow(/REDACTED/);

    try {
      await client.searchRecent({ query: "#demo_event" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain("secret-token-value");
    }
  });
});
