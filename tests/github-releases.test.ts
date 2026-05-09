import { describe, expect, it } from "vitest";
import { mapGitHubAtomRelease, parseGitHubReleaseAtom } from "../lib/github-releases";

describe("GitHub release Atom parsing", () => {
  it("converts OpenClaw Atom entries into sourced release items", () => {
    const atom = `<feed>
      <entry>
        <updated>2026-05-07T22:39:15Z</updated>
        <link rel="alternate" type="text/html" href="https://github.com/openclaw/openclaw/releases/tag/v2026.5.7"/>
        <title>openclaw 2026.5.7</title>
        <content type="html">&lt;h3&gt;Fixes&lt;/h3&gt;
          &lt;ul&gt;
            &lt;li&gt;Cron CLI: include computed &lt;code&gt;status&lt;/code&gt;. (&lt;a href=&quot;https://github.com/openclaw/openclaw/pull/78701&quot;&gt;#78701&lt;/a&gt;) Thanks &lt;a href=&quot;https://github.com/aweiker&quot;&gt;@aweiker&lt;/a&gt;.&lt;/li&gt;
            &lt;li&gt;Doctor/Codex OAuth: preserve routes. Recovery docs: &lt;a href=&quot;https://docs.openclaw.ai/providers/openai#check-and-recover-codex-oauth-routing&quot;&gt;docs&lt;/a&gt;&lt;/li&gt;
          &lt;/ul&gt;</content>
      </entry>
    </feed>`;

    const [entry] = parseGitHubReleaseAtom(atom);
    const release = mapGitHubAtomRelease(entry);

    expect(release.version).toBe("2026.5.7");
    expect(release.items).toHaveLength(2);
    expect(release.items[0].summary).toContain("Cron CLI");
    expect(release.items[0].summary).toContain("#78701");
    expect(release.items[0].sourceRefs.map((source) => source.url)).toEqual([
      "https://github.com/openclaw/openclaw/releases/tag/v2026.5.7",
      "https://github.com/openclaw/openclaw/pull/78701"
    ]);
    expect(release.items[1].category).toBe("doctor");
    expect(release.items[1].sourceRefs.map((source) => source.url)).toContain(
      "https://docs.openclaw.ai/providers/openai#check-and-recover-codex-oauth-routing"
    );
  });
});
