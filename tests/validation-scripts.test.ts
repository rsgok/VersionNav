import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("validation scripts", () => {
  it("detects new doctor failures and removed local capabilities", () => {
    const dir = mkdtempSync(join(tmpdir(), "versionnav-validation-"));
    const beforePath = join(dir, "before.json");
    const afterPath = join(dir, "after.json");

    writeFileSync(
      beforePath,
      JSON.stringify({
        profileVersion: 2,
        productId: "openclaw",
        profile: {
          currentVersion: "2026.5.1",
          enabledPlugins: ["browser"],
          enabledSkills: ["custom-skill"],
          cronUsed: true,
          doctorSummary: []
        },
        localEvidence: {
          collectedAt: "2026-05-11T00:00:00Z",
          collectionMode: "before",
          commandAvailability: { updateStatus: true, doctor: true, version: true },
          doctorSummary: [],
          defaultOpenClawConfigPath: true,
          defaultOpenClawAgentsPath: true
        }
      })
    );
    writeFileSync(
      afterPath,
      JSON.stringify({
        profileVersion: 2,
        productId: "openclaw",
        profile: {
          currentVersion: "2026.5.7",
          enabledPlugins: [],
          enabledSkills: [],
          cronUsed: false,
          doctorSummary: [{ status: "fail", check: "plugin load failed" }]
        },
        localEvidence: {
          collectedAt: "2026-05-11T00:05:00Z",
          collectionMode: "after",
          commandAvailability: { updateStatus: true, doctor: true, version: true },
          doctorSummary: [{ status: "fail", check: "plugin load failed" }],
          defaultOpenClawConfigPath: true,
          defaultOpenClawAgentsPath: true
        }
      })
    );

    const output = execFileSync(
      "npx",
      ["tsx", "skills/version-nav-skill/scripts/compare-validation.ts", "--before", beforePath, "--after", afterPath],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    const result = JSON.parse(output) as { status: string; suggestedAction: string; risks: string[] };

    expect(result.status).toBe("failed");
    expect(result.suggestedAction).toBe("rollback");
    expect(result.risks.join(" ")).toMatch(/Plugin disappeared|Cron signal|doctor fail/i);
  });
});
