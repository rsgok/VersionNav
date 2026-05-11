import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Recommendation, UserProfile } from "../../../lib/types";

type Args = {
  apiUrl: string;
  intent: string;
  productId: string;
  profilePath?: string;
  targetVersion?: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = readProfile(args.profilePath);
  const response = await fetch(`${args.apiUrl.replace(/\/$/, "")}/api/recommend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      productId: args.productId,
      profile,
      userIntent: args.intent,
      targetVersion: args.targetVersion
    })
  });

  if (!response.ok) {
    throw new Error(`Advisor API failed with ${response.status}: ${await response.text()}`);
  }

  const recommendation = (await response.json()) as Recommendation;
  const reportUrl = buildReportUrl(args, profile, recommendation);
  const output = {
    summary: {
      action: recommendation.action,
      recommendedVersion: recommendation.recommendedVersion,
      reasons: recommendation.reasons.slice(0, 3),
      risks: ((recommendation.personalizedRisks?.length ?? 0) > 0
        ? recommendation.personalizedRisks.map((risk) => `${risk.surface}: ${risk.summary}`)
        : recommendation.risks
      ).slice(0, 3),
      validationPlan: (recommendation.validationPlan?.afterUpgrade ?? recommendation.validationSteps).slice(0, 6),
      rollbackPlan: [
        ...(recommendation.rollbackPlan?.steps ?? recommendation.rollbackSteps),
        ...(recommendation.rollbackPlan?.hints ?? [])
      ].slice(0, 4),
      sources: (recommendation.sourceLinks ?? recommendation.sources).slice(0, 6)
    },
    reportUrl,
    recommendation
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function readProfile(path?: string): UserProfile {
  if (!path) {
    return {};
  }

  const parsed = JSON.parse(readFileSync(resolve(path), "utf8")) as {
    profile?: UserProfile;
  };

  return parsed.profile ?? (parsed as UserProfile);
}

export function buildReportUrl(
  args: Pick<Args, "apiUrl" | "intent" | "productId" | "targetVersion">,
  profile: UserProfile,
  recommendation: Pick<Recommendation, "recommendedVersion">
): string {
  const base = args.apiUrl.replace(/\/api\/?$/, "").replace(/\/$/, "");
  const url = new URL("/decision", base);

  url.searchParams.set("product", args.productId);
  url.searchParams.set("lang", /[\u3400-\u9fff]/.test(args.intent) ? "zh" : "en");

  if (profile.currentVersion) {
    url.searchParams.set("from", profile.currentVersion);
  }

  url.searchParams.set("to", args.targetVersion ?? recommendation.recommendedVersion);

  if (args.intent) {
    url.searchParams.set("intent", args.intent);
  }

  return url.toString();
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apiUrl: "http://localhost:3000", intent: "", productId: "openclaw" };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--api-url" && value) {
      args.apiUrl = value;
      index += 1;
    } else if (key === "--intent" && value) {
      args.intent = value;
      index += 1;
    } else if (key === "--profile" && value) {
      args.profilePath = value;
      index += 1;
    } else if (key === "--target" && value) {
      args.targetVersion = value;
      index += 1;
    } else if (key === "--product" && value) {
      args.productId = value;
      index += 1;
    }
  }

  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Advisor API unavailable. Run openclaw update status --json and openclaw doctor --non-interactive manually."
    );
    process.exit(1);
  });
}
