import { OPENCLAW_SOURCE_DOCS } from "./release-data";
import { DEFAULT_PRODUCT_ID, getProduct, normalizeProductId } from "./products";
import { compareVersions, findRelease, latestStableRelease, listReleases } from "./releases";
import type {
  NaturalLanguageAnswer,
  ProductId,
  Recommendation,
  Release,
  ReleaseItem,
  SourceRef,
  UserProfile
} from "./types";

const DEFAULT_VALIDATION_STEPS = [
  "openclaw update status --json",
  "openclaw doctor --non-interactive",
  "openclaw --version",
  "Run one normal agent session and confirm provider auth, plugins, channels, and scheduled jobs still load."
];

const DEFAULT_ROLLBACK_STEPS = [
  "Keep the previous version number before upgrading.",
  "If the upgrade fails, reinstall the prior pinned version with the same install method.",
  "Run the product's doctor/update health check again after rollback and compare failed checks."
];

export function buildRecommendation(input: {
  productId?: ProductId;
  profile: UserProfile;
  userIntent?: string;
  fromVersion?: string;
  targetVersion?: string;
  releases?: Release[];
  now?: Date;
}): Recommendation {
  const productId = normalizeProductId(input.productId ?? input.profile.productId);
  const product = getProduct(productId);
  const releases = input.releases ?? listReleases(productId);
  const currentVersion = input.fromVersion ?? input.profile.currentVersion ?? releases[0]?.version;
  const target =
    input.targetVersion && findRelease(input.targetVersion, releases)
      ? findRelease(input.targetVersion, releases)
      : latestStableRelease(releases);

  if (!target || !currentVersion) {
    return fallbackRecommendation(productId, product.sourceDocs);
  }

  if (compareVersions(currentVersion, target.version) === 0) {
    return {
      productId,
      action: "stay",
      recommendedVersion: target.version,
      confidence: 0.9,
      reasons: ["Current version already matches the recommended target."],
      risks: collectRisks([target], input.profile, input.userIntent),
      validationSteps: DEFAULT_VALIDATION_STEPS,
      rollbackSteps: DEFAULT_ROLLBACK_STEPS,
      sources: uniqueSources([releaseSource(target), ...product.sourceDocs])
    };
  }

  const range = releases.filter(
    (release) =>
      compareVersions(release.version, currentVersion) > 0 &&
      compareVersions(release.version, target.version) <= 0 &&
      shouldIncludeChannel(release, target.version, input.profile, input.userIntent)
  );
  const matches = matchingItems(range, input.profile, input.userIntent);
  const highRisk = range.flatMap((release) => release.items).filter((item) => item.riskLevel >= 4);
  const hasSecurityFix = range.some((release) =>
    release.items.some((item) => item.category === "security")
  );
  const matchedSecurityFix = matches.some((item) => item.category === "security");
  const lowRiskUser = input.profile.riskTolerance === "low";
  const nowMs = input.now?.getTime() ?? Date.now();
  const targetAgeHours = (nowMs - Date.parse(target.date)) / 36e5;
  const isFresh = targetAgeHours < 48 || target.stabilityLabel === "fresh";

  if (highRisk.length > 0 && lowRiskUser && !matchedSecurityFix) {
    return response(productId, product.sourceDocs, "wait", target.version, 0.78, [
      "The target includes high-risk upgrade surface and the profile is marked low risk.",
      ...summariesFor(matches)
    ], highRisk, range);
  }

  if (highRisk.length > 0 && matches.length === 0 && !hasSecurityFix) {
    return response(productId, product.sourceDocs, "avoid", target.version, 0.72, [
      "The target has high-risk changes but no clear match to the supplied usage profile or intent."
    ], highRisk, range);
  }

  if (isFresh && lowRiskUser && !matchedSecurityFix) {
    return response(productId, product.sourceDocs, "wait", target.version, 0.74, [
      "The target release is still fresh; wait for 24-48 hours of public soak unless the fix is urgent."
    ], highRisk, range);
  }

  if (matches.length > 0 || hasSecurityFix) {
    return response(productId, product.sourceDocs, "upgrade", target.version, 0.84, [
      ...summariesFor(matches),
      hasSecurityFix ? "The range includes a security or redaction hardening item." : ""
    ], highRisk, range);
  }

  return response(productId, product.sourceDocs, "wait", target.version, 0.66, [
    "No release item strongly matches the profile; wait unless you need a listed fix."
  ], highRisk, range);
}

export function answerNaturalLanguageQuestion(input: {
  productId?: ProductId;
  question: string;
  profile?: UserProfile;
  fromVersion?: string;
  targetVersion?: string;
  releases?: Release[];
}): NaturalLanguageAnswer {
  const productId = normalizeProductId(input.productId ?? input.profile?.productId);
  const product = getProduct(productId);
  const releases = input.releases ?? listReleases(productId);

  if (releases.length === 0) {
    return {
      productId,
      answer: `${product.name} does not have a configured release source yet. Add official release/doc sources before publishing factual upgrade answers.`,
      matchedItems: [],
      suggestedAction: "wait",
      sources: product.sourceDocs
    };
  }

  const question = input.question.toLowerCase();
  const inferredVersions = inferQuestionVersions(
    releases,
    input.fromVersion ?? input.profile?.currentVersion,
    input.targetVersion,
    question
  );
  const range = compareQuestionRange(
    releases,
    inferredVersions.from,
    inferredVersions.to,
    input.profile,
    input.question
  );
  const profileTerms = profileTermsFor(input.profile ?? {}, input.question);
  const questionTokens = meaningfulTokens(question);
  const matchedItems = range
    .flatMap((release) => release.items)
    .filter((item) => {
      const haystack = `${item.category} ${item.affectedAreas.join(" ")} ${item.summary}`.toLowerCase();

      return (
        item.affectedAreas.some((area) => profileTerms.includes(area.toLowerCase())) ||
        questionTokens.some((token) => haystack.includes(token))
      );
    })
    .sort(
      (a, b) =>
        scoreMatchedItem(b, profileTerms, questionTokens) -
        scoreMatchedItem(a, profileTerms, questionTokens)
    );

  const recommendation = buildRecommendation({
    productId,
    profile: input.profile ?? {},
    userIntent: input.question,
    fromVersion: inferredVersions.from,
    targetVersion: inferredVersions.to,
    releases
  });
  const items = (matchedItems.length > 0 ? matchedItems : range.flatMap((release) => release.items)).slice(0, 6);
  const itemSummaries = items.map(formatItemFact);
  const isChinese = /[\u3400-\u9fff]/.test(input.question);
  const actionLabel = isChinese
    ? actionTextZh(recommendation.action)
    : `${recommendation.action} ${recommendation.recommendedVersion}`;

  return {
    productId,
    answer:
      itemSummaries.length > 0
        ? isChinese
          ? `结论：${actionLabel} ${recommendation.recommendedVersion}。关键依据：${itemSummaries.join("；")}`
          : `Answer: ${actionLabel}. Key facts: ${itemSummaries.join("; ")}`
        : isChinese
          ? `没有找到匹配这个问题的 ${product.name} release 事实。可以补充版本范围，或先同步更多 release。`
          : `No matching ${product.name} release facts were found for that question. Try adding a version range or syncing more releases.`,
    matchedItems: items,
    suggestedAction: recommendation.action,
    sources: uniqueSources([
      ...items.flatMap((item) => item.sourceRefs),
      ...range.map(releaseSource),
      ...product.sourceDocs
    ])
  };
}

function fallbackRecommendation(
  productId: ProductId = DEFAULT_PRODUCT_ID,
  sources: SourceRef[] = OPENCLAW_SOURCE_DOCS
): Recommendation {
  return {
    productId,
    action: "wait",
    recommendedVersion: "unknown",
    confidence: 0.3,
    reasons: ["No release data is available yet."],
    risks: ["Sync official releases before making an upgrade decision."],
    validationSteps: DEFAULT_VALIDATION_STEPS,
    rollbackSteps: DEFAULT_ROLLBACK_STEPS,
    sources
  };
}

function response(
  productId: ProductId,
  productSources: SourceRef[],
  action: Recommendation["action"],
  version: string,
  confidence: number,
  reasons: string[],
  riskItems: ReleaseItem[],
  releases: Release[]
): Recommendation {
  return {
    productId,
    action,
    recommendedVersion: version,
    confidence,
    reasons: reasons.filter(Boolean),
    risks:
      riskItems.length > 0
        ? riskItems.map((item) => item.summary)
        : ["No high-risk release item matched the current profile."],
    validationSteps: DEFAULT_VALIDATION_STEPS,
    rollbackSteps: DEFAULT_ROLLBACK_STEPS,
    sources: uniqueSources([
      ...releases.flatMap((release) => [
        { label: `Release ${release.version}`, url: release.sourceUrl },
        ...release.items.flatMap((item) => item.sourceRefs)
      ]),
      ...productSources
    ])
  };
}

function matchingItems(releases: Release[], profile: UserProfile, userIntent = ""): ReleaseItem[] {
  const profileTerms = profileTermsFor(profile, userIntent);

  return releases
    .flatMap((release) => release.items)
    .filter((item) =>
      item.affectedAreas.some((area) => profileTerms.includes(area.toLowerCase()))
    );
}

function shouldIncludeChannel(
  release: Release,
  targetVersion: string,
  profile: UserProfile,
  userIntent = ""
): boolean {
  const wantsBeta =
    profile.updateChannel?.toLowerCase() === "beta" ||
    targetVersion.toLowerCase().includes("beta") ||
    userIntent.toLowerCase().includes("beta");

  return wantsBeta || release.channel === "stable";
}

function profileTermsFor(profile: UserProfile, userIntent = ""): string {
  return [
    ...(profile.enabledProviders ?? []),
    ...(profile.enabledPlugins ?? []),
    ...(profile.enabledChannels ?? []),
    ...(profile.enabledSkills ?? []),
    profile.cronUsed ? "cron" : "",
    profile.updateChannel ?? "",
    profile.installMethod ?? "",
    userIntent
  ]
    .join(" ")
    .toLowerCase();
}

function collectRisks(releases: Release[], profile: UserProfile, userIntent = ""): string[] {
  const matched = matchingItems(releases, profile, userIntent).filter((item) => item.riskLevel >= 3);
  return matched.length > 0
    ? matched.map((item) => item.summary)
    : ["No high-risk release item matched the current profile."];
}

function summariesFor(items: ReleaseItem[]): string[] {
  return items.map((item) => `${item.category}: ${item.summary}`);
}

function formatItemFact(item: ReleaseItem): string {
  return `${item.category}: ${truncateText(item.summary, 190)}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function meaningfulTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}._/-]+/u)
    .filter((token) => token.length > 2);
}

function scoreMatchedItem(item: ReleaseItem, profileTerms: string, questionTokens: string[]): number {
  const haystack = `${item.category} ${item.affectedAreas.join(" ")} ${item.summary}`.toLowerCase();
  let score = 0;

  for (const area of item.affectedAreas) {
    if (profileTerms.includes(area.toLowerCase())) {
      score += 4;
    }
  }

  for (const token of questionTokens) {
    if (haystack.includes(token)) {
      score += 2;
    }
  }

  if (item.category === "security" || item.category === "doctor") {
    score += 2;
  }

  if (item.riskLevel >= 4) {
    score += 1;
  }

  return score;
}

function actionTextZh(action: Recommendation["action"]): string {
  if (action === "upgrade") {
    return "建议升级到";
  }
  if (action === "stay") {
    return "建议停留在";
  }
  if (action === "avoid") {
    return "建议避开";
  }
  return "建议先等待";
}

function uniqueSources(sources: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) {
      return false;
    }
    seen.add(source.url);
    return true;
  });
}

function releaseSource(release: Release): SourceRef {
  return {
    label: `Release ${release.version}`,
    url: release.sourceUrl
  };
}

function compareQuestionRange(
  releases: Release[],
  fromVersion?: string,
  targetVersion?: string,
  profile: UserProfile = {},
  userIntent = ""
): Release[] {
  const from = fromVersion ?? releases[0]?.version;
  const to = targetVersion ?? latestStableRelease(releases)?.version;

  if (!from || !to) {
    return releases;
  }

  return releases.filter(
    (release) =>
      compareVersions(release.version, from) > 0 &&
      compareVersions(release.version, to) <= 0 &&
      shouldIncludeChannel(release, to, profile, userIntent)
  );
}

function inferQuestionVersions(
  releases: Release[],
  fromVersion?: string,
  targetVersion?: string,
  question = ""
): { from?: string; to?: string } {
  const versions = question.match(/\d{4}\.\d+\.\d+|v?\d+\.\d+\.\d+/g) ?? [];
  return {
    from: fromVersion ?? versions[0] ?? releases[0]?.version,
    to: targetVersion ?? versions[1] ?? latestStableRelease(releases)?.version
  };
}
