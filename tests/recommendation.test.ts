import { describe, expect, it } from "vitest";
import { answerNaturalLanguageQuestion, buildRecommendation } from "../lib/recommendation";
import { compareVersions } from "../lib/releases";

describe("buildRecommendation", () => {
  it("orders beta releases before the stable release with the same base version", () => {
    expect(compareVersions("2026.5.7-beta.1", "2026.5.7")).toBeLessThan(0);
    expect(compareVersions("2026.5.7-beta.1", "2026.5.7-beta.2")).toBeLessThan(0);
  });

  it("recommends upgrade when user profile matches a key fix", () => {
    const result = buildRecommendation({
      profile: {
        currentVersion: "2026.4.23",
        enabledProviders: ["codex"],
        enabledPlugins: ["browser"],
        cronUsed: true,
        riskTolerance: "medium"
      },
      userIntent: "I use Codex OAuth, local browser, and cron",
      targetVersion: "2026.5.1",
      now: new Date("2026-05-09T00:00:00Z")
    });

    expect(result.action).toBe("upgrade");
    expect(result.recommendedVersion).toBe("2026.5.1");
    expect(result.reasons.join(" ")).toMatch(/browser|cron/i);
    expect(result.validationPlan.afterUpgrade.join(" ")).toMatch(/browser|cron/i);
    expect(result.matchedFacts.length).toBeGreaterThan(0);
    expect(result.sources.length).toBeGreaterThan(0);
  });

  it("stays when already on the target version", () => {
    const result = buildRecommendation({
      profile: { currentVersion: "2026.5.1" },
      targetVersion: "2026.5.1"
    });

    expect(result.action).toBe("stay");
  });

  it("waits for low risk users when fresh high-risk changes are present", () => {
    const result = buildRecommendation({
      profile: {
        currentVersion: "2026.5.1",
        enabledSkills: ["custom-skill"],
        riskTolerance: "low"
      },
      userIntent: "I use custom skills",
      targetVersion: "2026.5.7",
      now: new Date("2026-05-08T00:00:00Z")
    });

    expect(result.action).toBe("wait");
    expect(result.risks.join(" ")).toMatch(/plugin install/i);
    expect(result.personalizedRisks.map((risk) => risk.surface)).toContain("skill");
  });

  it("is more conservative when local doctor already has warnings", () => {
    const result = buildRecommendation({
      profile: {
        currentVersion: "2026.5.1",
        enabledSkills: ["custom-skill"],
        doctorSummary: [{ status: "warn", check: "plugin config changed" }],
        riskTolerance: "medium"
      },
      targetVersion: "2026.5.7",
      now: new Date("2026-05-20T00:00:00Z")
    });

    expect(result.action).toBe("wait");
    expect(result.reasons.join(" ")).toMatch(/doctor/i);
  });

  it("does not let community-only high-risk facts drive an avoid decision", () => {
    const result = buildRecommendation({
      profile: {
        currentVersion: "1.0.0",
        riskTolerance: "medium"
      },
      targetVersion: "1.1.0",
      releases: [
        {
          id: "1.0.0",
          productId: "openclaw",
          version: "1.0.0",
          date: "2026-05-01T00:00:00Z",
          channel: "stable",
          sourceUrl: "https://github.com/openclaw/openclaw/releases/tag/1.0.0",
          rawMarkdown: "",
          stabilityLabel: "settled",
          items: []
        },
        {
          id: "1.1.0",
          productId: "openclaw",
          version: "1.1.0",
          date: "2026-05-02T00:00:00Z",
          channel: "stable",
          sourceUrl: "https://github.com/openclaw/openclaw/releases/tag/1.1.0",
          rawMarkdown: "",
          stabilityLabel: "settled",
          items: [
            {
              id: "community-risk",
              releaseId: "1.1.0",
              productId: "openclaw",
              category: "plugin",
              affectedAreas: ["plugin"],
              summary: "Community report says plugin loading may fail.",
              riskLevel: 4,
              sourceRefs: [],
              impactLevel: "high",
              impactSurfaces: ["plugin"],
              requiresValidation: true,
              validationHints: ["Confirm configured plugins still load."],
              rollbackHints: ["Reinstall the previous pinned version."],
              sourceConfidence: "community",
              knownIssueCount: 3
            }
          ]
        }
      ],
      now: new Date("2026-05-20T00:00:00Z")
    });

    expect(result.action).not.toBe("avoid");
    expect(result.risks.join(" ")).toMatch(/Community report/i);
  });

  it("answers natural language questions from release facts", () => {
    const result = answerNaturalLanguageQuestion({
      productId: "openclaw",
      question: "Does browser improve between 2026.4.23 and 2026.5.1?"
    });

    expect(result.answer).toMatch(/browser/i);
    expect(result.sources.length).toBeGreaterThan(0);
  });
});
