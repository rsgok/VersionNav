export type ReleaseCategory =
  | "feature"
  | "fix"
  | "breaking"
  | "migration"
  | "security"
  | "provider"
  | "plugin"
  | "channel"
  | "cron"
  | "memory"
  | "browser"
  | "codex"
  | "doctor";

export type SourceRef = {
  label: string;
  url: string;
};

export type ProductId = "openclaw";

export type ImpactLevel = "none" | "low" | "medium" | "high" | "blocking";

export type ImpactSurface =
  | "provider"
  | "plugin"
  | "skill"
  | "browser"
  | "cron"
  | "doctor"
  | "auth"
  | "config"
  | "channel"
  | "memory"
  | "codex"
  | "update"
  | "security";

export type SourceConfidence = "official" | "inferred" | "community";

export type Product = {
  id: ProductId;
  name: string;
  description: string;
  sourceStatus: "active" | "pending";
  sourceDocs: SourceRef[];
  localProfileHints: string[];
};

export type ReleaseItem = {
  id: string;
  releaseId: string;
  productId: ProductId;
  category: ReleaseCategory;
  affectedAreas: string[];
  summary: string;
  riskLevel: 1 | 2 | 3 | 4 | 5;
  sourceRefs: SourceRef[];
  impactLevel: ImpactLevel;
  impactSurfaces: ImpactSurface[];
  requiresValidation: boolean;
  validationHints: string[];
  rollbackHints: string[];
  sourceConfidence: SourceConfidence;
  knownIssueCount: number;
};

export type Release = {
  id: string;
  productId: ProductId;
  version: string;
  date: string;
  channel: "stable" | "beta" | "nightly";
  sourceUrl: string;
  rawMarkdown: string;
  stabilityLabel: "fresh" | "settled" | "watch" | "avoid";
  items: ReleaseItem[];
};

export type UserProfile = {
  profileVersion?: number;
  productId?: ProductId;
  currentVersion?: string;
  installMethod?: string;
  updateChannel?: string;
  enabledProviders?: string[];
  enabledPlugins?: string[];
  enabledChannels?: string[];
  enabledSkills?: string[];
  cronUsed?: boolean;
  os?: string;
  riskTolerance?: "low" | "medium" | "high";
  doctorSummary?: DoctorCheckSummary[];
  updateStatusSummary?: UpdateStatusSummary;
  defaultOpenClawConfigPath?: boolean;
  defaultOpenClawAgentsPath?: boolean;
  configShape?: ConfigShape;
  compatibilityFingerprint?: string;
};

export type RecommendationAction = "stay" | "upgrade" | "wait" | "avoid";

export type Recommendation = {
  productId: ProductId;
  action: RecommendationAction;
  recommendedVersion: string;
  confidence: number;
  reasons: string[];
  risks: string[];
  validationSteps: string[];
  rollbackSteps: string[];
  sources: SourceRef[];
  matchedFacts: DecisionFact[];
  personalizedRisks: PersonalizedRisk[];
  validationPlan: ValidationPlan;
  rollbackPlan: RollbackPlan;
  sourceLinks: SourceRef[];
  feedbackPrompt: FeedbackPrompt;
};

export type NaturalLanguageAnswer = {
  productId: ProductId;
  answer: string;
  matchedItems: ReleaseItem[];
  suggestedAction?: RecommendationAction;
  sources: SourceRef[];
};

export type DoctorStatus = "pass" | "ok" | "warn" | "fail" | "error" | "unknown";

export type DoctorCheckSummary = {
  status: DoctorStatus;
  check: string;
};

export type UpdateStatusSummary = {
  ok?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  channel?: string;
  installMethod?: string;
};

export type ConfigShape = {
  topLevelKeys: string[];
  providerKeys: string[];
  pluginKeys: string[];
  channelKeys: string[];
  skillKeys: string[];
  containsCron: boolean;
};

export type LocalEvidence = {
  collectedAt: string;
  collectionMode: "before" | "after" | "snapshot";
  commandAvailability: {
    updateStatus: boolean;
    doctor: boolean;
    version: boolean;
  };
  doctorSummary: DoctorCheckSummary[];
  defaultOpenClawConfigPath: boolean;
  defaultOpenClawAgentsPath: boolean;
};

export type ProfileEnvelope = {
  profileVersion: 2;
  productId: ProductId;
  profile: UserProfile;
  localEvidence: LocalEvidence;
};

export type DecisionFact = {
  id: string;
  releaseId: string;
  version?: string;
  summary: string;
  category: ReleaseCategory;
  impactLevel: ImpactLevel;
  impactSurfaces: ImpactSurface[];
  sourceConfidence: SourceConfidence;
  sourceRefs: SourceRef[];
};

export type PersonalizedRisk = {
  level: ImpactLevel;
  surface: ImpactSurface;
  summary: string;
  reason: string;
  sourceRefs: SourceRef[];
};

export type ValidationPlan = {
  beforeUpgrade: string[];
  afterUpgrade: string[];
  requiredChecks: string[];
  matchedSurfaces: ImpactSurface[];
};

export type RollbackPlan = {
  steps: string[];
  hints: string[];
};

export type FeedbackPrompt = {
  profileFingerprint?: string;
  relatedReleaseItemIds: string[];
  suggestedReasons: FeedbackReason[];
};

export type FeedbackReason =
  | "confusing_recommendation"
  | "missing_source"
  | "wrong_recommendation"
  | "upgrade_failed"
  | "rollback_succeeded"
  | "rollback_failed"
  | "request_agent";

export type ValidationStatus = "passed" | "warning" | "failed";

export type ValidationResult = {
  productId: ProductId;
  targetVersion?: string;
  status: ValidationStatus;
  risks: string[];
  suggestedAction: "continue" | "rollback" | "wait" | "manual_check";
  evidence: {
    beforeVersion?: string;
    afterVersion?: string;
    newDoctorIssues: DoctorCheckSummary[];
    removedProviders: string[];
    removedPlugins: string[];
    removedChannels: string[];
    removedSkills: string[];
    cronMissing: boolean;
  };
  sources: SourceRef[];
};
