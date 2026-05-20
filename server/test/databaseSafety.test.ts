import { describe, expect, it } from "vitest";
import { assertSafeDatabaseForCleanup } from "./databaseSafety.js";

describe("database cleanup safety", () => {
  it("rejects the normal local development database", () => {
    expect(() =>
      assertSafeDatabaseForCleanup("postgresql://chore_helper:password@localhost:5432/chore_helper")
    ).toThrow("Refusing to run destructive DB tests against database \"chore_helper\".");
  });

  it("allows databases explicitly named for tests", () => {
    expect(() =>
      assertSafeDatabaseForCleanup("postgresql://chore_helper:password@localhost:5432/chore_helper_test")
    ).not.toThrow();
  });

  it("allows an explicit override for one-off local verification", () => {
    expect(() =>
      assertSafeDatabaseForCleanup(
        "postgresql://chore_helper:password@localhost:5432/chore_helper",
        true
      )
    ).not.toThrow();
  });
});
