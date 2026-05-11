import { withReleaseItemDefaults } from "./release-facts";
import type { ProductId, Release, ReleaseCategory, ReleaseItem } from "./types";

type GitHubRelease = {
  tag_name: string;
  name?: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  body?: string;
};

type GitHubAtomRelease = {
  tagName: string;
  title: string;
  htmlUrl: string;
  updatedAt: string;
  body: string;
};

const PRODUCT_REPOSITORIES: Partial<Record<ProductId, string>> = {
  openclaw: "openclaw/openclaw"
};

const CATEGORY_PATTERNS: Array<[ReleaseCategory, RegExp]> = [
  ["security", /security|token|secret|redact/i],
  ["breaking", /breaking|incompatible|remove|deprecated/i],
  ["doctor", /doctor/i],
  ["migration", /migration|migrate/i],
  ["codex", /codex|oauth/i],
  ["browser", /browser|playwright|chrome/i],
  ["cron", /cron|schedule|automation/i],
  ["memory", /memory|profile/i],
  ["plugin", /plugin|skill|install/i],
  ["channel", /telegram|discord|slack|channel/i],
  ["provider", /provider|model|api key/i],
  ["fix", /fix|bug|patch/i],
  ["feature", /add|new|support|feature/i]
];

export async function fetchGitHubReleases(productId: ProductId = "openclaw"): Promise<Release[]> {
  const repository = resolveRepository(productId);

  try {
    return await fetchGitHubApiReleases(productId, repository);
  } catch (error) {
    if (!shouldUseAtomFallback(error)) {
      throw error;
    }

    return fetchGitHubAtomReleases(productId, repository);
  }
}

async function fetchGitHubApiReleases(productId: ProductId, repository: string): Promise<Release[]> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const releases: GitHubRelease[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const url = new URL(`https://api.github.com/repos/${repository}/releases`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "versionnav",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      const reset = response.headers.get("x-ratelimit-reset");
      const suffix =
        response.status === 403 && remaining === "0"
          ? ` GitHub API rate limit is exhausted; set GITHUB_TOKEN or GH_TOKEN and retry. Reset epoch: ${reset}.`
          : "";
      throw new Error(`GitHub release fetch failed: ${response.status}.${suffix}`);
    }

    const pageReleases = (await response.json()) as GitHubRelease[];
    releases.push(...pageReleases);

    if (pageReleases.length < 100) {
      break;
    }
  }

  return releases.map((release) => mapGitHubRelease(release, productId));
}

async function fetchGitHubAtomReleases(productId: ProductId, repository: string): Promise<Release[]> {
  const response = await fetch(`https://github.com/${repository}/releases.atom`, {
    headers: {
      accept: "application/atom+xml, application/xml;q=0.9, text/xml;q=0.8",
      "user-agent": "versionnav"
    },
    next: { revalidate: 3600 }
  });

  if (!response.ok) {
    throw new Error(`GitHub release Atom fetch failed: ${response.status}.`);
  }

  const atom = await response.text();
  return parseGitHubReleaseAtom(atom).map((release) => mapGitHubAtomRelease(release, productId));
}

export function mapGitHubRelease(release: GitHubRelease, productId: ProductId = "openclaw"): Release {
  const id = release.tag_name.replace(/^v/i, "");
  const items = parseReleaseItems(productId, id, release.body ?? "", release.html_url);

  return {
    id,
    productId,
    version: id,
    date: release.published_at,
    channel: release.prerelease ? "beta" : "stable",
    sourceUrl: release.html_url,
    rawMarkdown: release.body ?? "",
    stabilityLabel: release.prerelease ? "watch" : "fresh",
    items
  };
}

export function mapGitHubAtomRelease(release: GitHubAtomRelease, productId: ProductId = "openclaw"): Release {
  const id = release.tagName.replace(/^v/i, "");
  const markdown = htmlToMarkdown(release.body);
  const items = parseReleaseItems(productId, id, markdown, release.htmlUrl);

  return {
    id,
    productId,
    version: id,
    date: release.updatedAt,
    channel: id.includes("beta") ? "beta" : "stable",
    sourceUrl: release.htmlUrl,
    rawMarkdown: markdown,
    stabilityLabel: id.includes("beta") ? "watch" : "fresh",
    items
  };
}

export function parseGitHubReleaseAtom(atom: string): GitHubAtomRelease[] {
  const entries = atom.match(/<entry\b[\s\S]*?<\/entry>/g) ?? [];

  return entries
    .map((entry) => {
      const title = decodeHtmlEntities(readXmlText(entry, "title"));
      const htmlUrl = readXmlAttribute(entry, "link", "href");
      const updatedAt = readXmlText(entry, "updated");
      const content = readXmlText(entry, "content");
      const tagName = htmlUrl.split("/").pop() ?? title;

      if (!tagName || !htmlUrl || !updatedAt) {
        return null;
      }

      return {
        tagName,
        title,
        htmlUrl,
        updatedAt,
        body: decodeHtmlEntities(content)
      };
    })
    .filter((release): release is GitHubAtomRelease => Boolean(release));
}

export function parseReleaseItems(
  productId: ProductId,
  releaseId: string,
  markdown: string,
  sourceUrl: string
): ReleaseItem[] {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line));

  return lines.map((line, index) => {
    const rawSummary = line.replace(/^[-*]\s+/, "").replace(/\s+/g, " ").trim();
    const summary = stripMarkdownLinks(rawSummary);
    const category = CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(summary))?.[0] ?? "fix";
    const affectedAreas = inferAffectedAreas(summary, category);
    const linkedSources = extractMarkdownLinks(rawSummary)
      .map((link) => ({
        label: link.label,
        url: normalizeSourceUrl(link.url, sourceUrl)
      }))
      .filter((source) => isEvidenceSourceUrl(source.url));

    return withReleaseItemDefaults({
      id: `${releaseId}-${index}`,
      releaseId,
      productId,
      category,
      affectedAreas,
      summary,
      riskLevel: category === "breaking" || category === "migration" ? 4 : category === "security" ? 1 : 2,
      sourceRefs: dedupeSourceRefs([{ label: `Release ${releaseId}`, url: sourceUrl }, ...linkedSources])
    });
  });
}

function inferAffectedAreas(summary: string, category: ReleaseCategory): string[] {
  const text = summary.toLowerCase();
  const areas = new Set<string>([category]);

  for (const area of [
    "codex",
    "oauth",
    "browser",
    "cron",
    "memory",
    "plugin",
    "skill",
    "doctor",
    "telegram",
    "discord",
    "provider"
  ]) {
    if (text.includes(area)) {
      areas.add(area);
    }
  }

  return [...areas];
}

function resolveRepository(productId: ProductId): string {
  const envKey = `${productId.toUpperCase()}_GITHUB_REPO`;
  const repository = process.env[envKey] ?? PRODUCT_REPOSITORIES[productId];

  if (!repository) {
    throw new Error(`No GitHub repository is configured for ${productId}.`);
  }

  return repository;
}

function shouldUseAtomFallback(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /GitHub release fetch failed: (403|404|429)/.test(error.message);
}

function readXmlText(xml: string, tagName: string): string {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`));
  return match?.[1]?.trim() ?? "";
}

function readXmlAttribute(xml: string, tagName: string, attributeName: string): string {
  const tag = xml.match(new RegExp(`<${tagName}\\b[^>]*\\b${attributeName}="([^"]+)"[^>]*>`));
  return decodeHtmlEntities(tag?.[1] ?? "");
}

function htmlToMarkdown(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, label: string) => {
      return `[${stripHtml(label).trim()}](${decodeHtmlEntities(href)})`;
    })
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_match, code: string) => `\`${stripHtml(code).trim()}\``)
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/?(ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_match, heading: string) => {
      return `\n### ${stripHtml(heading).trim()}\n`;
    })
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_match, paragraph: string) => {
      return `\n${stripHtml(paragraph).trim()}\n`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<\/?[^>]+>/g, ""));
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\""
  };

  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name] ?? match);
}

function extractMarkdownLinks(markdown: string): Array<{ label: string; url: string }> {
  const links: Array<{ label: string; url: string }> = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    links.push({
      label: match[1],
      url: match[2]
    });
  }

  return links;
}

function stripMarkdownLinks(markdown: string): string {
  return markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1").trim();
}

function normalizeSourceUrl(url: string, sourceUrl: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return new URL(url, sourceUrl).toString();
}

function isEvidenceSourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (parsed.hostname === "docs.openclaw.ai") {
      return true;
    }

    if (parsed.hostname !== "github.com") {
      return false;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[0] === "openclaw" && parts[1] === "openclaw" && ["issues", "pull", "releases"].includes(parts[2]);
  } catch {
    return false;
  }
}

function dedupeSourceRefs(sourceRefs: Array<{ label: string; url: string }>) {
  const seen = new Set<string>();
  return sourceRefs.filter((source) => {
    if (seen.has(source.url)) {
      return false;
    }

    seen.add(source.url);
    return true;
  });
}
