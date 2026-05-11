import type {
  ImpactLevel,
  ImpactSurface,
  ReleaseCategory,
  ReleaseItem
} from "./types";

type ReleaseItemWithOptionalFacts = Omit<
  ReleaseItem,
  | "impactLevel"
  | "impactSurfaces"
  | "requiresValidation"
  | "validationHints"
  | "rollbackHints"
  | "sourceConfidence"
  | "knownIssueCount"
> &
  Partial<
    Pick<
      ReleaseItem,
      | "impactLevel"
      | "impactSurfaces"
      | "requiresValidation"
      | "validationHints"
      | "rollbackHints"
      | "sourceConfidence"
      | "knownIssueCount"
    >
  >;

const CATEGORY_SURFACES: Record<ReleaseCategory, ImpactSurface[]> = {
  feature: ["config"],
  fix: ["config"],
  breaking: ["config"],
  migration: ["config", "doctor"],
  security: ["security", "auth"],
  provider: ["provider", "auth"],
  plugin: ["plugin"],
  channel: ["channel"],
  cron: ["cron"],
  memory: ["memory"],
  browser: ["browser", "plugin"],
  codex: ["codex", "provider", "auth"],
  doctor: ["doctor"]
};

const SURFACE_VALIDATION: Record<ImpactSurface, string[]> = {
  provider: ["Confirm provider auth still works in one normal agent session."],
  plugin: ["Confirm configured plugins still load."],
  skill: ["Confirm configured skills still load."],
  browser: ["Run one browser-backed agent action."],
  cron: ["Confirm scheduled jobs still appear in cron status."],
  doctor: ["openclaw doctor --non-interactive"],
  auth: ["Run one authenticated provider call."],
  config: ["Review config keys that changed across the upgrade."],
  channel: ["openclaw update status --json"],
  memory: ["Run one memory-backed agent action if memory is enabled."],
  codex: ["Run one Codex provider session if Codex is enabled."],
  update: ["openclaw update status --json"],
  security: ["Confirm diagnostics still redact secrets."]
};

export function withReleaseItemDefaults(item: ReleaseItemWithOptionalFacts): ReleaseItem {
  const impactSurfaces = uniqueSurfaces(
    item.impactSurfaces?.length ? item.impactSurfaces : inferImpactSurfaces(item.category, item.affectedAreas)
  );
  const impactLevel = item.impactLevel ?? impactLevelFromRisk(item.riskLevel);
  const requiresValidation =
    item.requiresValidation ??
    (item.riskLevel >= 3 || impactLevel === "high" || impactLevel === "blocking");

  return {
    ...item,
    impactLevel,
    impactSurfaces,
    requiresValidation,
    validationHints: item.validationHints?.length
      ? item.validationHints
      : validationHintsFor(impactSurfaces, requiresValidation),
    rollbackHints: item.rollbackHints?.length
      ? item.rollbackHints
      : rollbackHintsFor(impactLevel, impactSurfaces),
    sourceConfidence: item.sourceConfidence ?? "official",
    knownIssueCount: item.knownIssueCount ?? 0
  };
}

export function impactLevelFromRisk(riskLevel: ReleaseItem["riskLevel"]): ImpactLevel {
  if (riskLevel >= 5) {
    return "blocking";
  }

  if (riskLevel >= 4) {
    return "high";
  }

  if (riskLevel >= 3) {
    return "medium";
  }

  if (riskLevel >= 2) {
    return "low";
  }

  return "none";
}

export function inferImpactSurfaces(
  category: ReleaseCategory,
  affectedAreas: string[] = []
): ImpactSurface[] {
  return uniqueSurfaces([
    ...CATEGORY_SURFACES[category],
    ...affectedAreas.map(areaToSurface).filter((surface): surface is ImpactSurface => Boolean(surface))
  ]);
}

export function validationHintsFor(
  surfaces: ImpactSurface[],
  required: boolean
): string[] {
  if (!required && surfaces.length === 0) {
    return [];
  }

  return uniqueStrings([
    "openclaw update status --json",
    "openclaw doctor --non-interactive",
    ...surfaces.flatMap((surface) => SURFACE_VALIDATION[surface] ?? [])
  ]);
}

export function rollbackHintsFor(level: ImpactLevel, surfaces: ImpactSurface[]): string[] {
  const hints = [
    "Keep the previous version number before upgrading.",
    "If validation fails, reinstall the previous pinned version with the same install method."
  ];

  if (level === "high" || level === "blocking") {
    hints.push("Do not continue on this target until the impacted surfaces validate cleanly.");
  }

  if (surfaces.includes("config")) {
    hints.push("Keep a copy of the previous OpenClaw config shape before upgrading.");
  }

  return uniqueStrings(hints);
}

export function strongConclusionAllowed(item: ReleaseItem): boolean {
  if (item.sourceConfidence === "community") {
    return false;
  }

  if (item.sourceConfidence === "inferred" && item.sourceRefs.length === 0) {
    return false;
  }

  return true;
}

function areaToSurface(area: string): ImpactSurface | undefined {
  const normalized = area.toLowerCase();

  if (normalized.includes("provider")) return "provider";
  if (normalized.includes("plugin") || normalized.includes("install")) return "plugin";
  if (normalized.includes("skill")) return "skill";
  if (normalized.includes("browser")) return "browser";
  if (normalized.includes("cron") || normalized.includes("automation")) return "cron";
  if (normalized.includes("doctor") || normalized.includes("migration")) return "doctor";
  if (normalized.includes("auth") || normalized.includes("oauth") || normalized.includes("token")) return "auth";
  if (normalized.includes("config")) return "config";
  if (normalized.includes("channel") || normalized.includes("beta")) return "channel";
  if (normalized.includes("memory")) return "memory";
  if (normalized.includes("codex")) return "codex";
  if (normalized.includes("update")) return "update";
  if (normalized.includes("security") || normalized.includes("redaction")) return "security";

  return undefined;
}

function uniqueSurfaces(values: ImpactSurface[]): ImpactSurface[] {
  return [...new Set(values)].sort();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
