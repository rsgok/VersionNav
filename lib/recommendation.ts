import { OPENCLAW_SOURCE_DOCS } from "./release-data";
import { strongConclusionAllowed } from "./release-facts";
import { DEFAULT_PRODUCT_ID, getProduct, normalizeProductId } from "./products";
import { compareVersions, findRelease, latestStableRelease, listReleases } from "./releases";
import type {
  DecisionFact,
  ImpactSurface,
  NaturalLanguageAnswer,
  PersonalizedRisk,
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
    return completeRecommendation({
      productId,
      action: "stay",
      recommendedVersion: target.version,
      confidence: 0.9,
      reasons: ["Current version already matches the recommended target."],
      risks: collectRisks([target], input.profile, input.userIntent),
      validationSteps: DEFAULT_VALIDATION_STEPS,
      rollbackSteps: DEFAULT_ROLLBACK_STEPS,
      sources: uniqueSources([releaseSource(target), ...product.sourceDocs]),
      releases: [target],
      profile: input.profile,
      userIntent: input.userIntent
    });
  }

  const range = releases.filter(
    (release) =>
      compareVersions(release.version, currentVersion) > 0 &&
      compareVersions(release.version, target.version) <= 0 &&
      shouldIncludeChannel(release, target.version, input.profile, input.userIntent)
  );
  const matches = matchingItems(range, input.profile, input.userIntent);
  const highRisk = range.flatMap((release) => release.items).filter((item) => item.riskLevel >= 4);
  const strongHighRisk = highRisk.filter(strongConclusionAllowed);
  const hasSecurityFix = range.some((release) =>
    release.items.some((item) => item.category === "security")
  );
  const matchedSecurityFix = matches.some((item) => item.category === "security");
  const lowRiskUser = input.profile.riskTolerance === "low" || hasDoctorIssues(input.profile);
  const nowMs = input.now?.getTime() ?? Date.now();
  const targetAgeHours = (nowMs - Date.parse(target.date)) / 36e5;
  const isFresh = targetAgeHours < 48 || target.stabilityLabel === "fresh";

  if (strongHighRisk.length > 0 && lowRiskUser && !matchedSecurityFix) {
    return response(productId, product.sourceDocs, "wait", target.version, 0.78, [
      "The target includes high-risk upgrade surface and the profile is marked low risk.",
      hasDoctorIssues(input.profile) ? "Local doctor output already has warnings or failures, so validate before upgrading." : "",
      ...summariesFor(matches)
    ], highRisk, range, input.profile, input.userIntent);
  }

  if (strongHighRisk.length > 0 && matches.length === 0 && !hasSecurityFix) {
    return response(productId, product.sourceDocs, "avoid", target.version, 0.72, [
      "The target has high-risk changes but no clear match to the supplied usage profile or intent."
    ], highRisk, range, input.profile, input.userIntent);
  }

  if (isFresh && lowRiskUser && !matchedSecurityFix) {
    return response(productId, product.sourceDocs, "wait", target.version, 0.74, [
      "The target release is still fresh; wait for 24-48 hours of public soak unless the fix is urgent."
    ], highRisk, range, input.profile, input.userIntent);
  }

  if (matches.length > 0 || hasSecurityFix) {
    return response(productId, product.sourceDocs, "upgrade", target.version, 0.84, [
      ...summariesFor(matches),
      hasSecurityFix ? "The range includes a security or redaction hardening item." : ""
    ], highRisk, range, input.profile, input.userIntent);
  }

  return response(productId, product.sourceDocs, "wait", target.version, 0.66, [
    "No release item strongly matches the profile; wait unless you need a listed fix."
  ], highRisk, range, input.profile, input.userIntent);
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
  return completeRecommendation({
    productId,
    action: "wait",
    recommendedVersion: "unknown",
    confidence: 0.3,
    reasons: ["No release data is available yet."],
    risks: ["Sync official releases before making an upgrade decision."],
    validationSteps: DEFAULT_VALIDATION_STEPS,
    rollbackSteps: DEFAULT_ROLLBACK_STEPS,
    sources,
    releases: [],
    profile: {}
  });
}

function response(
  productId: ProductId,
  productSources: SourceRef[],
  action: Recommendation["action"],
  version: string,
  confidence: number,
  reasons: string[],
  riskItems: ReleaseItem[],
  releases: Release[],
  profile: UserProfile,
  userIntent = ""
): Recommendation {
  return completeRecommendation({
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
    ]),
    releases,
    profile,
    userIntent
  });
}

function completeRecommendation(base: Omit<
  Recommendation,
  "matchedFacts" | "personalizedRisks" | "validationPlan" | "rollbackPlan" | "sourceLinks" | "feedbackPrompt"
> & {
  releases: Release[];
  profile: UserProfile;
  userIntent?: string;
}): Recommendation {
  const matchedItems = matchingItems(base.releases, base.profile, base.userIntent);
  const relevantItems = matchedItems.length > 0
    ? matchedItems
    : base.releases.flatMap((release) => release.items).filter((item) => item.requiresValidation || item.riskLevel >= 3);
  const sourceLinks = uniqueSources(base.sources);
  const matchedSurfaces = uniqueSurfaces([
    ...profileSurfaces(base.profile),
    ...relevantItems.flatMap((item) => item.impactSurfaces)
  ]);
  const validationPlan = buildValidationPlan(base.profile, relevantItems, matchedSurfaces);
  const rollbackPlan = buildRollbackPlan(base.rollbackSteps, relevantItems);

  return {
    productId: base.productId,
    action: base.action,
    recommendedVersion: base.recommendedVersion,
    confidence: base.confidence,
    reasons: base.reasons,
    risks: base.risks,
    validationSteps: validationPlan.afterUpgrade,
    rollbackSteps: rollbackPlan.steps,
    sources: sourceLinks,
    matchedFacts: relevantItems.slice(0, 8).map((item) => decisionFactFor(item, base.releases)),
    personalizedRisks: personalizedRisksFor(base.profile, relevantItems),
    validationPlan,
    rollbackPlan,
    sourceLinks,
    feedbackPrompt: {
      profileFingerprint: base.profile.compatibilityFingerprint,
      relatedReleaseItemIds: relevantItems.map((item) => item.id),
      suggestedReasons: [
        "confusing_recommendation",
        "missing_source",
        "wrong_recommendation",
        "upgrade_failed",
        "rollback_failed",
        "request_agent"
      ]
    }
  };
}

function matchingItems(releases: Release[], profile: UserProfile, userIntent = ""): ReleaseItem[] {
  const profileTerms = profileTermsFor(profile, userIntent);
  const surfaces = profileSurfaces(profile);

  return releases
    .flatMap((release) => release.items)
    .filter((item) =>
      item.affectedAreas.some((area) => profileTerms.includes(area.toLowerCase())) ||
      item.impactSurfaces.some((surface) => surfaces.includes(surface))
    );
}

function decisionFactFor(item: ReleaseItem, releases: Release[]): DecisionFact {
  return {
    id: item.id,
    releaseId: item.releaseId,
    version: releases.find((release) => release.id === item.releaseId)?.version,
    summary: item.summary,
    category: item.category,
    impactLevel: item.impactLevel,
    impactSurfaces: item.impactSurfaces,
    sourceConfidence: item.sourceConfidence,
    sourceRefs: item.sourceRefs
  };
}

function personalizedRisksFor(profile: UserProfile, items: ReleaseItem[]): PersonalizedRisk[] {
  const surfaces = profileSurfaces(profile);
  const risks = items
    .flatMap((item) =>
      item.impactSurfaces
        .filter((surface) => surfaces.includes(surface) || item.riskLevel >= 4)
        .map((surface) => ({
          level: item.impactLevel,
          surface,
          summary: item.summary,
          reason: surfaces.includes(surface)
            ? `This release touches ${surface}, which appears in your local profile.`
            : `This release has ${item.impactLevel} impact and should be validated even without a direct profile match.`,
          sourceRefs: item.sourceRefs
        }))
    );

  return risks.slice(0, 8);
}

function buildValidationPlan(
  profile: UserProfile,
  items: ReleaseItem[],
  matchedSurfaces: ImpactSurface[]
): Recommendation["validationPlan"] {
  const beforeUpgrade = uniqueStrings([
    "openclaw update status --json",
    "openclaw doctor --non-interactive",
    "openclaw --version"
  ]);
  const afterUpgrade = uniqueStrings([
    "openclaw --version",
    "openclaw update status --json",
    "openclaw doctor --non-interactive",
    ...items.flatMap((item) => item.validationHints),
    ...surfaceValidationSteps(profile, matchedSurfaces)
  ]).slice(0, 10);

  return {
    beforeUpgrade,
    afterUpgrade,
    requiredChecks: afterUpgrade,
    matchedSurfaces
  };
}

function buildRollbackPlan(defaultSteps: string[], items: ReleaseItem[]): Recommendation["rollbackPlan"] {
  return {
    steps: uniqueStrings(defaultSteps),
    hints: uniqueStrings(items.flatMap((item) => item.rollbackHints)).slice(0, 8)
  };
}

function surfaceValidationSteps(profile: UserProfile, surfaces: ImpactSurface[]): string[] {
  const steps: string[] = [];

  if (surfaces.includes("provider") || profile.enabledProviders?.length) {
    steps.push("Run one provider-backed agent request and confirm auth still works.");
  }
  if (surfaces.includes("plugin") || profile.enabledPlugins?.length) {
    steps.push("Confirm configured plugins still load.");
  }
  if (surfaces.includes("skill") || profile.enabledSkills?.length) {
    steps.push("Confirm configured skills still load.");
  }
  if (surfaces.includes("cron") || profile.cronUsed) {
    steps.push("Confirm scheduled jobs still appear in cron status.");
  }
  if (surfaces.includes("browser")) {
    steps.push("Run one local browser-backed agent action.");
  }

  return steps;
}

function profileSurfaces(profile: UserProfile): ImpactSurface[] {
  const surfaces: ImpactSurface[] = [];

  if (profile.enabledProviders?.length) surfaces.push("provider", "auth");
  if (profile.enabledPlugins?.length) surfaces.push("plugin");
  if (profile.enabledSkills?.length) surfaces.push("skill");
  if (profile.enabledChannels?.length) surfaces.push("channel");
  if (profile.cronUsed || profile.configShape?.containsCron) surfaces.push("cron");
  if (profile.doctorSummary?.length) surfaces.push("doctor");
  if (profile.installMethod || profile.updateStatusSummary) surfaces.push("update");

  return uniqueSurfaces(surfaces);
}

function hasDoctorIssues(profile: UserProfile): boolean {
  return (profile.doctorSummary ?? []).some((check) =>
    check.status === "warn" || check.status === "fail" || check.status === "error"
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
    profile.doctorSummary?.some((check) => check.status === "warn" || check.status === "fail" || check.status === "error")
      ? "doctor"
      : "",
    profile.updateChannel ?? "",
    profile.installMethod ?? "",
    profile.updateStatusSummary?.channel ?? "",
    profile.configShape?.containsCron ? "cron" : "",
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueSurfaces(values: ImpactSurface[]): ImpactSurface[] {
  return [...new Set(values)].sort();
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
