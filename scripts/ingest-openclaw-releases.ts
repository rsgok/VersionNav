import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchGitHubReleases } from "../lib/github-releases";
import { findReleaseQualityIssues, isPublishableRelease } from "../lib/release-quality";
import { compareVersions } from "../lib/releases";
import type { ProductId, Release } from "../lib/types";
import { resolveSupabaseAdminConfig } from "./lib/local-supabase";

type AdminClient = SupabaseClient;

type Args = {
  productId: ProductId;
  dryRun: boolean;
  force: boolean;
  inputPath?: string;
  limit?: number;
  sinceVersion?: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.productId !== "openclaw") {
    throw new Error(`No official release connector is configured for ${args.productId} yet.`);
  }

  const config = resolveSupabaseAdminConfig();
  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  const job = await createJob(supabase, args);

  try {
    const fetched = (await loadReleases(args)).sort((a, b) => compareVersions(a.version, b.version));
    const eligible = args.sinceVersion
      ? fetched.filter((release) => compareVersions(release.version, args.sinceVersion ?? "") >= 0)
      : fetched;
    const limited = args.limit ? eligible.slice(-args.limit) : eligible;
    const existingVersions = args.force
      ? new Set<string>()
      : await fetchExistingVersions(supabase, args.productId);
    const candidates = limited.filter((release) => !existingVersions.has(release.version));
    const publishable = candidates.filter(isPublishableRelease);
    const issues = findReleaseQualityIssues(candidates);

    if (args.dryRun) {
      console.log(
        JSON.stringify(
          {
            mode: "dry-run",
            fetched: fetched.length,
            eligible: eligible.length,
            sinceVersion: args.sinceVersion ?? null,
            considered: limited.length,
            existing: existingVersions.size,
            candidates: candidates.map((release) => release.version),
            publishable: publishable.map((release) => release.version),
            issues
          },
          null,
          2
        )
      );
      await finishJob(supabase, job.id, "succeeded", {
        dryRun: true,
        fetched: fetched.length,
        eligible: eligible.length,
        sinceVersion: args.sinceVersion ?? null,
        candidates: candidates.length,
        publishable: publishable.length,
        issues
      });
      return;
    }

    for (const release of publishable) {
      await upsertRelease(supabase, release);
    }
    await markSourcesChecked(supabase, args.productId);
    await finishJob(supabase, job.id, "succeeded", {
      fetched: fetched.length,
      eligible: eligible.length,
      sinceVersion: args.sinceVersion ?? null,
      considered: limited.length,
      insertedOrUpdated: publishable.length,
      skippedExisting: existingVersions.size,
      issues
    });

    console.log(
      `Ingested ${publishable.length} ${args.productId} release(s): ${
        publishable.map((release) => release.version).join(", ") || "none"
      }`
    );
    if (issues.length > 0) {
      console.log(`Quality issues: ${issues.length}`);
    }
  } catch (error) {
    await finishJob(supabase, job.id, "failed", {}, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    productId: "openclaw",
    dryRun: false,
    force: false,
    sinceVersion: "2026.3.1"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--product" && value) {
      args.productId = value as ProductId;
      index += 1;
    } else if (key === "--limit" && value) {
      args.limit = Number.parseInt(value, 10);
      index += 1;
    } else if (key === "--input" && value) {
      args.inputPath = value;
      index += 1;
    } else if (key === "--since-version" && value) {
      args.sinceVersion = value;
      index += 1;
    } else if (key === "--all-versions") {
      args.sinceVersion = undefined;
    } else if (key === "--dry-run") {
      args.dryRun = true;
    } else if (key === "--force") {
      args.force = true;
    }
  }

  return args;
}

async function loadReleases(args: Args): Promise<Release[]> {
  if (!args.inputPath) {
    return fetchGitHubReleases(args.productId);
  }

  const parsed = JSON.parse(await readFile(resolve(args.inputPath), "utf8")) as {
    releases?: Release[];
  };

  return (parsed.releases ?? []).filter((release) => release.productId === args.productId);
}

async function createJob(
  supabase: AdminClient,
  args: Args
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("analysis_jobs")
    .insert({
      product_id: args.productId,
      job_type: "sync_releases",
      status: "running",
      payload: args,
      attempts: 1,
      started_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data as { id: string };
}

async function finishJob(
  supabase: AdminClient,
  id: string,
  status: "succeeded" | "failed",
  result: Record<string, unknown>,
  error?: string
) {
  const { error: updateError } = await supabase
    .from("analysis_jobs")
    .update({
      status,
      result,
      error: error ?? null,
      finished_at: new Date().toISOString()
    })
    .eq("id", id);

  if (updateError) {
    throw updateError;
  }
}

async function fetchExistingVersions(
  supabase: AdminClient,
  productId: ProductId
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("releases")
    .select("version")
    .eq("product_id", productId);

  if (error) {
    throw error;
  }

  return new Set((data as Array<{ version: string }>).map((row) => row.version));
}

async function upsertRelease(supabase: AdminClient, release: Release) {
  const source = await findReleaseSource(supabase, release.productId, release.sourceUrl);
  const snapshotHash = await sha256(release.rawMarkdown || JSON.stringify(release));

  const { data: snapshot, error: snapshotError } = await supabase
    .from("release_snapshots")
    .upsert(
      {
        product_id: release.productId,
        source_id: source?.id ?? null,
        external_id: release.version,
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
        impact_level: item.impactLevel,
        impact_surfaces: item.impactSurfaces,
        requires_validation: item.requiresValidation,
        validation_hints: item.validationHints,
        rollback_hints: item.rollbackHints,
        source_confidence: item.sourceConfidence,
        known_issue_count: item.knownIssueCount,
        published: true
      })
      .select("id")
      .single();

    if (itemError) {
      throw itemError;
    }

    for (const sourceRef of item.sourceRefs) {
      const { error: sourceError } = await supabase.from("release_item_sources").upsert(
        {
          item_id: itemRow.id,
          label: sourceRef.label,
          url: sourceRef.url
        },
        { onConflict: "item_id,url" }
      );

      if (sourceError) {
        throw sourceError;
      }
    }
  }
}

async function findReleaseSource(
  supabase: AdminClient,
  productId: ProductId,
  releaseUrl: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("release_sources")
    .select("id,url")
    .eq("product_id", productId)
    .eq("enabled", true);

  if (error) {
    throw error;
  }

  return (
    (data as Array<{ id: string; url: string }>).find((source) =>
      releaseUrl.startsWith(source.url)
    ) ?? null
  );
}

async function markSourcesChecked(supabase: AdminClient, productId: ProductId) {
  const { error } = await supabase
    .from("release_sources")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("product_id", productId)
    .eq("source_type", "github_releases");

  if (error) {
    throw error;
  }
}

async function sha256(value: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
