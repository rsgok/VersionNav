import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DoctorCheckSummary, ProfileEnvelope, ValidationResult } from "../../../lib/types";

type Args = {
  beforePath?: string;
  afterPath?: string;
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  const before = readEnvelope(args.beforePath, "before");
  const after = readEnvelope(args.afterPath, "after");
  const newDoctorIssues = newIssues(before.profile.doctorSummary ?? [], after.profile.doctorSummary ?? []);
  const removedProviders = removed(before.profile.enabledProviders, after.profile.enabledProviders);
  const removedPlugins = removed(before.profile.enabledPlugins, after.profile.enabledPlugins);
  const removedChannels = removed(before.profile.enabledChannels, after.profile.enabledChannels);
  const removedSkills = removed(before.profile.enabledSkills, after.profile.enabledSkills);
  const cronMissing = Boolean(before.profile.cronUsed && !after.profile.cronUsed);
  const risks = [
    ...newDoctorIssues.map((check) => `New doctor ${check.status}: ${check.check}`),
    ...removedProviders.map((name) => `Provider disappeared after upgrade: ${name}`),
    ...removedPlugins.map((name) => `Plugin disappeared after upgrade: ${name}`),
    ...removedChannels.map((name) => `Channel disappeared after upgrade: ${name}`),
    ...removedSkills.map((name) => `Skill disappeared after upgrade: ${name}`),
    cronMissing ? "Cron signal existed before upgrade but is missing after upgrade." : ""
  ].filter(Boolean);
  const failed = newDoctorIssues.some((check) => check.status === "fail" || check.status === "error");

  const result: ValidationResult = {
    productId: "openclaw",
    targetVersion: after.profile.currentVersion,
    status: failed ? "failed" : risks.length > 0 ? "warning" : "passed",
    risks,
    suggestedAction: failed ? "rollback" : risks.length > 0 ? "manual_check" : "continue",
    evidence: {
      beforeVersion: before.profile.currentVersion,
      afterVersion: after.profile.currentVersion,
      newDoctorIssues,
      removedProviders,
      removedPlugins,
      removedChannels,
      removedSkills,
      cronMissing
    },
    sources: [
      {
        label: "OpenClaw doctor",
        url: "https://docs.openclaw.ai/doctor"
      },
      {
        label: "OpenClaw update docs",
        url: "https://docs.openclaw.ai/cli/update"
      }
    ]
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function readEnvelope(path: string | undefined, label: string): ProfileEnvelope {
  if (!path) {
    throw new Error(`Missing --${label} profile path.`);
  }

  const parsed = JSON.parse(readFileSync(resolve(path), "utf8")) as ProfileEnvelope;

  if (!parsed.profile) {
    throw new Error(`${label} profile is not a VersionNav profile envelope.`);
  }

  return parsed;
}

function newIssues(before: DoctorCheckSummary[], after: DoctorCheckSummary[]): DoctorCheckSummary[] {
  const beforeKeys = new Set(before.map((check) => `${check.status}:${check.check}`));
  return after.filter(
    (check) =>
      (check.status === "warn" || check.status === "fail" || check.status === "error") &&
      !beforeKeys.has(`${check.status}:${check.check}`)
  );
}

function removed(before: string[] = [], after: string[] = []): string[] {
  const afterSet = new Set(after);
  return before.filter((value) => !afterSet.has(value));
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--before" && value) {
      args.beforePath = value;
      index += 1;
    } else if (key === "--after" && value) {
      args.afterPath = value;
      index += 1;
    }
  }

  return args;
}

main();
