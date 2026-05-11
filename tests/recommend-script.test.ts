import { describe, expect, it } from "vitest";
import { buildReportUrl } from "../skills/version-nav-skill/scripts/recommend";

describe("version-nav-skill recommend script", () => {
  it("builds a public decision report link without embedding local profile details", () => {
    const reportUrl = buildReportUrl(
      {
        apiUrl: "https://versionnav.example.com",
        productId: "openclaw",
        targetVersion: undefined,
        intent: "我用 browser 和 cron"
      },
      {
        currentVersion: "2026.5.1",
        enabledPlugins: ["browser"],
        enabledProviders: ["codex"],
        compatibilityFingerprint: "secret-fingerprint"
      },
      { recommendedVersion: "2026.5.7" }
    );
    const url = new URL(reportUrl);

    expect(url.origin).toBe("https://versionnav.example.com");
    expect(url.pathname).toBe("/decision");
    expect(url.searchParams.get("product")).toBe("openclaw");
    expect(url.searchParams.get("lang")).toBe("zh");
    expect(url.searchParams.get("from")).toBe("2026.5.1");
    expect(url.searchParams.get("to")).toBe("2026.5.7");
    expect(reportUrl).not.toContain("secret-fingerprint");
    expect(reportUrl).not.toContain("codex");
  });
});
