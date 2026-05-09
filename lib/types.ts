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
};

export type NaturalLanguageAnswer = {
  productId: ProductId;
  answer: string;
  matchedItems: ReleaseItem[];
  suggestedAction?: RecommendationAction;
  sources: SourceRef[];
};
