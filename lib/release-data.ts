import { withReleaseItemDefaults } from "./release-facts";
import type { Product, Release } from "./types";

type RawRelease = Omit<Release, "items"> & {
  items: Parameters<typeof withReleaseItemDefaults>[0][];
};

export const products: Product[] = [
  {
    id: "openclaw",
    name: "OpenClaw",
    description:
      "Local agent CLI with update, doctor, skill, plugin, provider, channel, memory, browser, and cron surfaces.",
    sourceStatus: "active",
    sourceDocs: [
      {
        label: "OpenClaw GitHub releases",
        url: "https://github.com/openclaw/openclaw/releases"
      },
      {
        label: "OpenClaw update docs",
        url: "https://docs.openclaw.ai/cli/update"
      },
      {
        label: "OpenClaw doctor docs",
        url: "https://docs.openclaw.ai/doctor"
      },
      {
        label: "OpenClaw skills config docs",
        url: "https://docs.openclaw.ai/tools/skills-config"
      }
    ],
    localProfileHints: [
      "openclaw --version",
      "openclaw update status --json",
      "openclaw doctor --non-interactive",
      "~/.openclaw/openclaw.json"
    ]
  }
];

export const OPENCLAW_SOURCE_DOCS = products.find((product) => product.id === "openclaw")
  ?.sourceDocs ?? [
  {
    label: "OpenClaw GitHub releases",
    url: "https://github.com/openclaw/openclaw/releases"
  }
];

const rawSampleReleases: RawRelease[] = [
  {
    id: "2026-04-23",
    productId: "openclaw",
    version: "2026.4.23",
    date: "2026-04-23T10:00:00.000Z",
    channel: "stable",
    sourceUrl: "https://github.com/openclaw/openclaw/releases/tag/2026.4.23",
    rawMarkdown: "Fixture release for local development.",
    stabilityLabel: "settled",
    items: [
      {
        id: "2026-04-23-codex-oauth",
        releaseId: "2026-04-23",
        productId: "openclaw",
        category: "codex",
        affectedAreas: ["codex", "oauth", "provider"],
        summary: "Improves Codex OAuth refresh handling for long local sessions.",
        riskLevel: 2,
        sourceRefs: [
          {
            label: "Release 2026.4.23",
            url: "https://github.com/openclaw/openclaw/releases/tag/2026.4.23"
          }
        ]
      },
      {
        id: "2026-04-23-doctor",
        releaseId: "2026-04-23",
        productId: "openclaw",
        category: "doctor",
        affectedAreas: ["doctor", "migration"],
        summary: "Adds non-interactive doctor checks for upgrade readiness.",
        riskLevel: 1,
        sourceRefs: [
          {
            label: "Doctor docs",
            url: "https://docs.openclaw.ai/doctor"
          }
        ]
      }
    ]
  },
  {
    id: "2026-05-01",
    productId: "openclaw",
    version: "2026.5.1",
    date: "2026-05-01T11:00:00.000Z",
    channel: "stable",
    sourceUrl: "https://github.com/openclaw/openclaw/releases/tag/2026.5.1",
    rawMarkdown: "Fixture release for local development.",
    stabilityLabel: "settled",
    items: [
      {
        id: "2026-05-01-browser",
        releaseId: "2026-05-01",
        productId: "openclaw",
        category: "browser",
        affectedAreas: ["browser", "local-browser", "plugin"],
        summary: "Fixes local browser startup checks when agents launch from a clean shell.",
        riskLevel: 2,
        sourceRefs: [
          {
            label: "Release 2026.5.1",
            url: "https://github.com/openclaw/openclaw/releases/tag/2026.5.1"
          }
        ]
      },
      {
        id: "2026-05-01-cron",
        releaseId: "2026-05-01",
        productId: "openclaw",
        category: "cron",
        affectedAreas: ["cron", "automation"],
        summary: "Stabilizes cron status reporting after missed wakeups.",
        riskLevel: 2,
        sourceRefs: [
          {
            label: "Release 2026.5.1",
            url: "https://github.com/openclaw/openclaw/releases/tag/2026.5.1"
          }
        ]
      }
    ]
  },
  {
    id: "2026-05-07",
    productId: "openclaw",
    version: "2026.5.7",
    date: "2026-05-07T12:00:00.000Z",
    channel: "stable",
    sourceUrl: "https://github.com/openclaw/openclaw/releases/tag/2026.5.7",
    rawMarkdown: "Fixture release for local development.",
    stabilityLabel: "fresh",
    items: [
      {
        id: "2026-05-07-plugin-install",
        releaseId: "2026-05-07",
        productId: "openclaw",
        category: "plugin",
        affectedAreas: ["plugin", "skill", "install"],
        summary: "Changes plugin install validation; users with custom skills should run doctor before upgrading.",
        riskLevel: 4,
        sourceRefs: [
          {
            label: "Release 2026.5.7",
            url: "https://github.com/openclaw/openclaw/releases/tag/2026.5.7"
          },
          {
            label: "Skills config docs",
            url: "https://docs.openclaw.ai/tools/skills-config"
          }
        ]
      },
      {
        id: "2026-05-07-security",
        releaseId: "2026-05-07",
        productId: "openclaw",
        category: "security",
        affectedAreas: ["security", "provider"],
        summary: "Tightens provider token redaction in diagnostics.",
        riskLevel: 1,
        sourceRefs: [
          {
            label: "Release 2026.5.7",
            url: "https://github.com/openclaw/openclaw/releases/tag/2026.5.7"
          }
        ]
      }
    ]
  }
];

export const sampleReleases: Release[] = rawSampleReleases.map((release) => ({
  ...release,
  items: release.items.map(withReleaseItemDefaults)
}));
