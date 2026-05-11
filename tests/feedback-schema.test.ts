import { describe, expect, it } from "vitest";
import { feedbackRequestSchema } from "../lib/schemas";

describe("feedback schema", () => {
  it("accepts anonymous structured feedback", () => {
    const parsed = feedbackRequestSchema.safeParse({
      productId: "openclaw",
      fromVersion: "2026.5.1",
      targetVersion: "2026.5.7",
      profileFingerprint: "abc123",
      affectedSurfaces: ["plugin", "browser"],
      reason: "upgrade_failed",
      relatedReleaseItemIds: ["item-1"],
      validationResult: {
        status: "failed",
        risks: ["New doctor fail"]
      }
    });

    expect(parsed.success).toBe(true);
  });
});
