import { describe, expect, it } from "vitest";
import { redact } from "../skills/version-nav-skill/scripts/collect-profile";

describe("profile redaction", () => {
  it("removes secrets and absolute paths but keeps capability names", () => {
    const result = redact({
      provider: "codex",
      apiKey: "sk-test",
      transcriptPath: "/Users/test/.openclaw/agents/session.json",
      plugins: ["browser"],
      nested: {
        token: "abc",
        channel: "discord"
      }
    });

    expect(result).toMatchObject({
      provider: "codex",
      apiKey: "[redacted]",
      transcriptPath: "[redacted]",
      plugins: ["browser"],
      nested: {
        token: "[redacted]",
        channel: "discord"
      }
    });
  });
});
