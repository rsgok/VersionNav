import { describe, expect, it } from "vitest";
import { redact } from "../skills/version-nav-skill/scripts/collect-profile";

describe("profile redaction", () => {
  it("removes secrets and absolute paths but keeps capability names", () => {
    const result = redact({
      provider: "codex",
      apiKey: "sk-test",
      email: "user@example.com",
      phone: "+15551234567",
      messageText: "hello",
      transcriptPath: "/Users/test/.openclaw/agents/session.json",
      plugins: ["browser"],
      nested: {
        token: "abc",
        password: "secret",
        channel: "discord"
      }
    });

    expect(result).toMatchObject({
      provider: "codex",
      apiKey: "[redacted]",
      email: "[redacted]",
      phone: "[redacted]",
      messageText: "[redacted]",
      transcriptPath: "[redacted]",
      plugins: ["browser"],
      nested: {
        token: "[redacted]",
        password: "[redacted]",
        channel: "discord"
      }
    });
  });
});
