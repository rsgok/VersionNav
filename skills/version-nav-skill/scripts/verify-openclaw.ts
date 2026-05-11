import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProfileEnvelope, ValidationResult } from "../../../lib/types";

type Args = {
  profilePath?: string;
  targetVersion?: string;
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  const envelope = readEnvelope(args.profilePath);
  const profile = envelope?.profile ?? {};
  const targetVersion = args.targetVersion;
  const risks: string[] = [];

  if (!targetVersion) {
    risks.push("No target version was supplied.");
  }

  if (!envelope?.localEvidence.commandAvailability.updateStatus) {
    risks.push("openclaw update status --json was unavailable during profile collection.");
  }

  if (!envelope?.localEvidence.commandAvailability.doctor) {
    risks.push("openclaw doctor --non-interactive was unavailable during profile collection.");
  }

  if ((profile.doctorSummary ?? []).some((check) => ["warn", "fail", "error"].includes(check.status))) {
    risks.push("Local doctor output already has warnings or failures before upgrade.");
  }

  const result: ValidationResult = {
    productId: "openclaw",
    targetVersion,
    status: risks.length > 0 ? "warning" : "passed",
    risks,
    suggestedAction: risks.length > 0 ? "manual_check" : "continue",
    evidence: {
      beforeVersion: profile.currentVersion,
      afterVersion: undefined,
      newDoctorIssues: profile.doctorSummary ?? [],
      removedProviders: [],
      removedPlugins: [],
      removedChannels: [],
      removedSkills: [],
      cronMissing: false
    },
    sources: [
      {
        label: "OpenClaw update status",
        url: "https://docs.openclaw.ai/cli/update"
      },
      {
        label: "OpenClaw doctor",
        url: "https://docs.openclaw.ai/doctor"
      }
    ]
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function readEnvelope(path?: string): ProfileEnvelope | null {
  if (!path) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(resolve(path), "utf8")) as ProfileEnvelope;
  return parsed.profile ? parsed : null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--profile" && value) {
      args.profilePath = value;
      index += 1;
    } else if (key === "--target" && value) {
      args.targetVersion = value;
      index += 1;
    }
  }

  return args;
}

main();
