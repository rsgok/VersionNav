import { z } from "zod";

export const productIdSchema = z.enum(["openclaw"]).default("openclaw");

export const profileSchema = z.object({
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
  riskTolerance: z.enum(["low", "medium", "high"]).optional()
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
