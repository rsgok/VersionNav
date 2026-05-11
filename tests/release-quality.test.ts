import { describe, expect, it } from "vitest";
import { findReleaseQualityIssues } from "../lib/release-quality";
import type { Release } from "../lib/types";

describe("release quality", () => {
  it("blocks high-risk unsourced inferred facts from publishable conclusions", () => {
    const releases: Release[] = [
      {
        id: "1.1.0",
        productId: "openclaw",
        version: "1.1.0",
        date: "2026-05-01T00:00:00Z",
        channel: "stable",
        sourceUrl: "https://github.com/openclaw/openclaw/releases/tag/1.1.0",
        rawMarkdown: "",
        stabilityLabel: "watch",
        items: [
          {
            id: "risk",
            releaseId: "1.1.0",
            productId: "openclaw",
            category: "plugin",
            affectedAreas: ["plugin"],
            summary: "Plugin install behavior may break.",
            riskLevel: 4,
            sourceRefs: [],
            impactLevel: "high",
            impactSurfaces: ["plugin"],
            requiresValidation: true,
            validationHints: [],
            rollbackHints: [],
            sourceConfidence: "inferred",
            knownIssueCount: 0
          }
        ]
      }
    ];

    expect(findReleaseQualityIssues(releases).map((issue) => issue.reason).join(" ")).toMatch(
      /source|strong conclusion/i
    );
  });
});
