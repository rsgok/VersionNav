import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { sampleReleases } from "../lib/release-data";
import { getSupabaseAdminConfig } from "../lib/supabase/config";
import type { Release } from "../lib/types";

async function main() {
  const config = getSupabaseAdminConfig();
  if (!config) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before pushing release data.");
  }

  const releases = await readReleases(process.argv[2]);
  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  for (const release of releases) {
    const snapshotHash = createHash("sha256")
      .update(release.rawMarkdown || JSON.stringify(release))
      .digest("hex");

    const { data: snapshot, error: snapshotError } = await supabase
      .from("release_snapshots")
      .upsert(
        {
          product_id: release.productId,
          source_url: release.sourceUrl,
          content_hash: snapshotHash,
          raw_content: release.rawMarkdown,
          raw_json: release
        },
        { onConflict: "product_id,source_url,content_hash" }
      )
      .select("id")
      .single();

    if (snapshotError) {
      throw snapshotError;
    }

    const { data: releaseRow, error: releaseError } = await supabase
      .from("releases")
      .upsert(
        {
          product_id: release.productId,
          version: release.version,
          release_date: release.date,
          channel: release.channel,
          source_url: release.sourceUrl,
          raw_markdown: release.rawMarkdown,
          stability_label: release.stabilityLabel,
          snapshot_id: snapshot.id,
          published: true
        },
        { onConflict: "product_id,version" }
      )
      .select("id")
      .single();

    if (releaseError) {
      throw releaseError;
    }

    const { error: deleteItemsError } = await supabase
      .from("release_items")
      .delete()
      .eq("release_id", releaseRow.id);

    if (deleteItemsError) {
      throw deleteItemsError;
    }

    for (const item of release.items) {
      const { data: itemRow, error: itemError } = await supabase
        .from("release_items")
        .insert({
          release_id: releaseRow.id,
          product_id: release.productId,
          category: item.category,
          affected_areas: item.affectedAreas,
          summary: item.summary,
          risk_level: item.riskLevel,
          published: true
        })
        .select("id")
        .single();

      if (itemError) {
        throw itemError;
      }

      for (const source of item.sourceRefs) {
        const { error: sourceError } = await supabase.from("release_item_sources").upsert(
          {
            item_id: itemRow.id,
            label: source.label,
            url: source.url
          },
          { onConflict: "item_id,url" }
        );

        if (sourceError) {
          throw sourceError;
        }
      }
    }
  }

  console.log(`Pushed ${releases.length} releases to Supabase.`);
}

async function readReleases(path?: string): Promise<Release[]> {
  if (!path) {
    return sampleReleases;
  }

  const parsed = JSON.parse(await readFile(resolve(path), "utf8")) as {
    releases?: Release[];
  };
  return parsed.releases ?? [];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
