import type { Release, ReleaseItem } from "./types";

const HIGH_RISK_CATEGORIES = new Set(["breaking", "security", "migration", "plugin", "doctor"]);

export type ReleaseQualityIssue = {
  releaseVersion: string;
  itemId: string;
  reason: string;
};

export function findReleaseQualityIssues(releases: Release[]): ReleaseQualityIssue[] {
  return releases.flatMap((release) =>
    release.items.flatMap((item) => qualityIssuesForItem(release, item))
  );
}

export function isPublishableRelease(release: Release): boolean {
  return findReleaseQualityIssues([release]).length === 0;
}

function qualityIssuesForItem(release: Release, item: ReleaseItem): ReleaseQualityIssue[] {
  const issues: ReleaseQualityIssue[] = [];
  const highRisk = item.riskLevel >= 4 || HIGH_RISK_CATEGORIES.has(item.category);

  if (!item.summary.trim()) {
    issues.push({
      releaseVersion: release.version,
      itemId: item.id,
      reason: "summary is empty"
    });
  }

  if (highRisk && item.sourceRefs.length === 0) {
    issues.push({
      releaseVersion: release.version,
      itemId: item.id,
      reason: "high-risk item has no source link"
    });
  }

  if (item.sourceRefs.some((source) => !source.url.startsWith("https://"))) {
    issues.push({
      releaseVersion: release.version,
      itemId: item.id,
      reason: "source link must be https"
    });
  }

  return issues;
}
