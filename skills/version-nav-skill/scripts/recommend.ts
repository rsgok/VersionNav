import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  process.stdout.write(`${JSON.stringify(await response.json(), null, 2)}\n`);
}

function readProfile(path?: string) {
  if (!path) {
    return {};
  }

  return JSON.parse(readFileSync(resolve(path), "utf8")) as unknown;
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

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Advisor API unavailable. Run openclaw update status --json and openclaw doctor --non-interactive manually."
  );
  process.exit(1);
});
