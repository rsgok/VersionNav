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
