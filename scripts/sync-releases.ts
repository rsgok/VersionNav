import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fetchGitHubReleases } from "../lib/github-releases";
import { normalizeProductId } from "../lib/products";

const productId = normalizeProductId(process.argv[2] ?? "openclaw");
const outputPath = resolve(process.cwd(), `data/${productId}-releases.json`);

async function main() {
  if (productId !== "openclaw") {
    throw new Error(`No official release connector is configured for ${productId} yet.`);
  }

  const releases = await fetchGitHubReleases(productId);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ releases }, null, 2)}\n`, "utf8");
  console.log(`Synced ${releases.length} OpenClaw releases to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
