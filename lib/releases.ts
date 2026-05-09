import { sampleReleases } from "./release-data";
import { DEFAULT_PRODUCT_ID, normalizeProductId } from "./products";
import type { ProductId } from "./types";
import type { Release, ReleaseCategory } from "./types";

export function parseVersion(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => {
      if (/^beta$/i.test(part)) {
        return -1;
      }

      const numeric = Number.parseInt(part, 10);
      return Number.isFinite(numeric) ? numeric : 0;
    });
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

export function listReleases(productId: ProductId = DEFAULT_PRODUCT_ID): Release[] {
  const normalized = normalizeProductId(productId);
  return sampleReleases
    .filter((release) => release.productId === normalized)
    .sort((a, b) => compareVersions(a.version, b.version));
}

export function latestStableRelease(releases = listReleases()): Release | undefined {
  const stable = releases.filter((release) => release.channel === "stable");
  return stable[stable.length - 1] ?? releases[releases.length - 1];
}

export function findRelease(version: string, releases = listReleases()): Release | undefined {
  return releases.find((release) => release.version === version);
}

export function filterReleases(params: {
  productId?: ProductId;
  version?: string;
  channel?: string;
  category?: string;
  affectedArea?: string;
}): Release[] {
  return listReleases(params.productId)
    .filter((release) => !params.version || release.version === params.version)
    .filter((release) => !params.channel || release.channel === params.channel)
    .map((release) => ({
      ...release,
      items: release.items.filter((item) => {
        const categoryMatches =
          !params.category || item.category === (params.category as ReleaseCategory);
        const areaMatches =
          !params.affectedArea ||
          item.affectedAreas.some(
            (area) => area.toLowerCase() === params.affectedArea?.toLowerCase()
          );

        return categoryMatches && areaMatches;
      })
    }))
    .filter((release) => release.items.length > 0 || (!params.category && !params.affectedArea));
}

export function compareReleaseRange(
  fromVersion?: string,
  toVersion?: string,
  productId: ProductId = DEFAULT_PRODUCT_ID
): Release[] {
  const releases = listReleases(productId);
  const from = fromVersion ?? releases[0]?.version;
  const to = toVersion ?? latestStableRelease(releases)?.version;

  if (!from || !to) {
    return [];
  }

  return releases.filter(
    (release) =>
      compareVersions(release.version, from) > 0 &&
      compareVersions(release.version, to) <= 0
  );
}
