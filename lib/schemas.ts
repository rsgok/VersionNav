import { z } from "zod";

export const productIdSchema = z.enum(["openclaw"]).default("openclaw");

export const impactSurfaceSchema = z.enum([
  "provider",
  "plugin",
  "skill",
  "browser",
  "cron",
  "doctor",
  "auth",
  "config",
  "channel",
  "memory",
  "codex",
  "update",
  "security"
]);

const doctorSummarySchema = z.object({
  status: z.enum(["pass", "ok", "warn", "fail", "error", "unknown"]),
  check: z.string().max(180)
});

const updateStatusSummarySchema = z.object({
  ok: z.boolean().optional(),
  currentVersion: z.string().optional(),
  latestVersion: z.string().optional(),
  channel: z.string().optional(),
  installMethod: z.string().optional()
});

const configShapeSchema = z.object({
  topLevelKeys: z.array(z.string()).default([]),
  providerKeys: z.array(z.string()).default([]),
  pluginKeys: z.array(z.string()).default([]),
  channelKeys: z.array(z.string()).default([]),
  skillKeys: z.array(z.string()).default([]),
  containsCron: z.boolean().default(false)
});

export const profileSchema = z.object({
  profileVersion: z.number().int().optional(),
  productId: productIdSchema.optional(),
  currentVersion: z.string().optional(),
  installMethod: z.string().optional(),
  updateChannel: z.string().optional(),
  enabledProviders: z.array(z.string()).optional(),
  enabledPlugins: z.array(z.string()).optional(),
  enabledChannels: z.array(z.string()).optional(),
  enabledSkills: z.array(z.string()).optional(),
  cronUsed: z.boolean().optional(),
  os: z.string().optional(),
  riskTolerance: z.enum(["low", "medium", "high"]).optional(),
  doctorSummary: z.array(doctorSummarySchema).optional(),
  updateStatusSummary: updateStatusSummarySchema.optional(),
  defaultOpenClawConfigPath: z.boolean().optional(),
  defaultOpenClawAgentsPath: z.boolean().optional(),
  configShape: configShapeSchema.optional(),
  compatibilityFingerprint: z.string().optional()
});

export const recommendRequestSchema = z.object({
  productId: productIdSchema,
  profile: profileSchema.default({}),
  userIntent: z.string().max(1200).optional().default(""),
  fromVersion: z.string().optional(),
  targetVersion: z.string().optional()
});

export const releasesQuerySchema = z.object({
  productId: productIdSchema,
  version: z.string().optional(),
  channel: z.string().optional(),
  category: z.string().optional(),
  affectedArea: z.string().optional()
});

export const profileAnalyzeSchema = z.object({
  productId: productIdSchema,
  profile: profileSchema,
  email: z.string().email().optional()
});

export const askRequestSchema = z.object({
  productId: productIdSchema,
  question: z.string().min(1).max(1600),
  profile: profileSchema.default({}),
  fromVersion: z.string().optional(),
  targetVersion: z.string().optional()
});

const validationResultSummarySchema = z.object({
  status: z.enum(["passed", "warning", "failed"]),
  risks: z.array(z.string()).default([]),
  suggestedAction: z.enum(["continue", "rollback", "wait", "manual_check"]).optional()
});

export const feedbackRequestSchema = z.object({
  productId: productIdSchema,
  fromVersion: z.string().optional(),
  targetVersion: z.string().optional(),
  profileFingerprint: z.string().max(128).optional(),
  affectedSurfaces: z.array(impactSurfaceSchema).default([]),
  reason: z.enum([
    "confusing_recommendation",
    "missing_source",
    "wrong_recommendation",
    "upgrade_failed",
    "rollback_succeeded",
    "rollback_failed",
    "request_agent"
  ]),
  message: z.string().max(1200).optional(),
  relatedReleaseItemIds: z.array(z.string()).default([]),
  validationResult: validationResultSummarySchema.optional()
});
