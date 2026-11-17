import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AUTHORSHIP_PHRASE, AUTHORSHIP_SHA256 } from "./attribution";

describe("authorship integrity", () => {
  it("matches the registered UTF-8 SHA-256", () => {
    const actual = createHash("sha256").update(AUTHORSHIP_PHRASE, "utf8").digest("hex");
    expect(actual).toBe(AUTHORSHIP_SHA256);
  });
});
