import { products as fixtureProducts, sampleReleases } from "@/lib/release-data";
import { compareVersions } from "@/lib/releases";
import type { Product, ProductId, Release, ReleaseCategory, ReleaseItem, SourceRef } from "@/lib/types";
import { createPublicSupabaseClient } from "./client";

const PAGE_SIZE = 1000;

type ProductRow = {
  id: ProductId;
  name: string;
  description: string;
  source_status: Product["sourceStatus"];
  local_profile_hints: string[];
};

type SourceRow = {
  product_id: ProductId;
  label: string;
  url: string;
};

type ReleaseRow = {
  id: string;
  product_id: ProductId;
  version: string;
  release_date: string;
  channel: Release["channel"];
  source_url: string;
  raw_markdown: string;
  stability_label: Release["stabilityLabel"];
};

type ReleaseItemRow = {
  id: string;
  release_id: string;
  product_id: ProductId;
  category: ReleaseCategory;
  affected_areas: string[];
  summary: string;
  risk_level: 1 | 2 | 3 | 4 | 5;
};

type ReleaseItemSourceRow = {
  item_id: string;
  label: string;
  url: string;
};

export async function listProductsFromStore(): Promise<Product[]> {
  const supabase = createPublicSupabaseClient();

  if (!supabase) {
    return fixtureProducts;
  }

  const { data: productRows, error: productError } = await supabase
    .from("agent_products")
    .select("id,name,description,source_status,local_profile_hints")
    .order("name", { ascending: true });

  const { data: sourceRows, error: sourceError } = await supabase
    .from("release_sources")
    .select("product_id,label,url")
    .eq("enabled", true);

  if (productError || sourceError || !productRows) {
    return fixtureProducts;
  }

  return (productRows as ProductRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    sourceStatus: row.source_status,
    localProfileHints: row.local_profile_hints ?? [],
    sourceDocs: (sourceRows as SourceRow[] | null ?? [])
      .filter((source) => source.product_id === row.id)
      .map((source) => ({ label: source.label, url: source.url }))
  }));
}

export async function getProductFromStore(productId: ProductId): Promise<Product> {
  const products = await listProductsFromStore();
  return products.find((product) => product.id === productId) ?? fixtureProducts[0];
}

export async function listReleasesFromStore(productId: ProductId): Promise<Release[]> {
  return listReleaseRangeWithItemsFromStore({ productId });
}

export async function listReleaseVersionsFromStore(productId: ProductId): Promise<Release[]> {
  const supabase = createPublicSupabaseClient();

  if (!supabase) {
    return fixtureReleases(productId);
  }

  const releaseRows = await fetchReleaseRows(supabase, productId);

  if (!releaseRows || releaseRows.length === 0) {
    return fixtureReleases(productId);
  }

  return mapReleases(releaseRows, []);
}

export async function getReleaseItemCountFromStore(productId: ProductId): Promise<number> {
  const supabase = createPublicSupabaseClient();

  if (!supabase) {
    return fixtureReleases(productId).flatMap((release) => release.items).length;
  }

  const { count, error } = await supabase
    .from("release_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("published", true);

  if (error || count === null) {
    return fixtureReleases(productId).flatMap((release) => release.items).length;
  }

  return count;
}

export async function listReleaseRangeWithItemsFromStore(params: {
  productId: ProductId;
  fromVersion?: string;
  toVersion?: string;
}): Promise<Release[]> {
  const supabase = createPublicSupabaseClient();

  if (!supabase) {
    return selectReleaseRange(fixtureReleases(params.productId), params.fromVersion, params.toVersion);
  }

  const releaseRows = await fetchReleaseRows(supabase, params.productId);

  if (!releaseRows || releaseRows.length === 0) {
    return selectReleaseRange(fixtureReleases(params.productId), params.fromVersion, params.toVersion);
  }

  const releasesWithoutItems = mapReleases(releaseRows, []);
  const selectedReleases = selectReleaseRange(releasesWithoutItems, params.fromVersion, params.toVersion);
  const selectedIds = new Set(selectedReleases.map((release) => release.id));
  const selectedRows = releaseRows.filter((release) => selectedIds.has(release.id));
  const releaseIds = selectedRows.map((release) => release.id);

  if (releaseIds.length === 0) {
    return [];
  }

  const itemRows = await fetchReleaseItems(supabase, releaseIds);

  if (!itemRows) {
    return mapReleases(selectedRows, []);
  }

  const itemIds = itemRows.map((item) => item.id);
  const sourceRows = itemIds.length > 0 ? await fetchReleaseItemSources(supabase, itemIds) : [];

  if (!sourceRows) {
    return mapReleases(selectedRows, itemRows);
  }

  return mapReleases(selectedRows, itemRows, sourceRows);
}

async function fetchReleaseRows(
  supabase: NonNullable<ReturnType<typeof createPublicSupabaseClient>>,
  productId: ProductId
): Promise<ReleaseRow[] | null> {
  const { data: releaseRows, error: releaseError } = await supabase
    .from("releases")
    .select("id,product_id,version,release_date,channel,source_url,raw_markdown,stability_label")
    .eq("product_id", productId)
    .eq("published", true)
    .order("release_date", { ascending: true });

  if (releaseError || !releaseRows || releaseRows.length === 0) {
    return null;
  }

  return releaseRows as ReleaseRow[];
}

export async function filterReleasesFromStore(params: {
  productId: ProductId;
  version?: string;
  channel?: string;
  category?: string;
  affectedArea?: string;
}): Promise<Release[]> {
  if (!params.version && !params.category && !params.affectedArea) {
    const releases = await listReleaseVersionsFromStore(params.productId);
    return releases.filter((release) => !params.channel || release.channel === params.channel);
  }

  const releases = params.version
    ? await listReleaseRangeWithItemsFromStore({
        productId: params.productId,
        fromVersion: params.version,
        toVersion: params.version
      })
    : await listReleaseRangeWithItemsFromStore({ productId: params.productId });

  return releases
    .filter((release) => !params.version || release.version === params.version)
    .filter((release) => !params.channel || release.channel === params.channel)
    .map((release) => ({
      ...release,
      items: release.items.filter((item) => {
        const categoryMatches = !params.category || item.category === params.category;
        const areaMatches =
          !params.affectedArea ||
          item.affectedAreas.some(
            (area) => area.toLowerCase() === params.affectedArea?.toLowerCase()
          );

        return categoryMatches && areaMatches;
      })
    }))
    .filter((release) => release.items.length > 0 || (!params.category && !params.affectedArea));
}

export function latestStableFromReleases(releases: Release[]): Release | undefined {
  const stable = releases.filter((release) => release.channel === "stable");
  return stable[stable.length - 1] ?? releases[releases.length - 1];
}

export function compareRangeFromReleases(
  releases: Release[],
  fromVersion?: string,
  toVersion?: string
): Release[] {
  return selectReleaseRange(releases, fromVersion, toVersion).filter((release) => {
    const from = fromVersion ?? releases[0]?.version;
    return !from || compareVersions(release.version, from) > 0;
  });
}

function selectReleaseRange(
  releases: Release[],
  fromVersion?: string,
  toVersion?: string
): Release[] {
  if (!fromVersion && !toVersion) {
    return releases;
  }

  const from = fromVersion ?? releases[0]?.version;
  const to = toVersion ?? latestStableFromReleases(releases)?.version;

  if (!from || !to) {
    return [];
  }

  if (compareVersions(from, to) === 0) {
    return releases.filter((release) => release.version === to);
  }

  return releases.filter(
    (release) =>
      compareVersions(release.version, from) >= 0 && compareVersions(release.version, to) <= 0
  );
}

function fixtureReleases(productId: ProductId): Release[] {
  return sampleReleases
    .filter((release) => release.productId === productId)
    .sort((a, b) => compareVersions(a.version, b.version));
}

function mapReleases(
  releases: ReleaseRow[],
  items: ReleaseItemRow[],
  sources: ReleaseItemSourceRow[] = []
): Release[] {
  return releases.map((release) => ({
    id: release.id,
    productId: release.product_id,
    version: release.version,
    date: release.release_date,
    channel: release.channel,
    sourceUrl: release.source_url,
    rawMarkdown: release.raw_markdown,
    stabilityLabel: release.stability_label,
    items: items
      .filter((item) => item.release_id === release.id)
      .map((item) => mapReleaseItem(item, sources))
  }));
}

function mapReleaseItem(item: ReleaseItemRow, sources: ReleaseItemSourceRow[]): ReleaseItem {
  return {
    id: item.id,
    releaseId: item.release_id,
    productId: item.product_id,
    category: item.category,
    affectedAreas: item.affected_areas ?? [],
    summary: item.summary,
    riskLevel: item.risk_level,
    sourceRefs: sources
      .filter((source) => source.item_id === item.id)
      .map<SourceRef>((source) => ({ label: source.label, url: source.url }))
  };
}

async function fetchReleaseItems(
  supabase: NonNullable<ReturnType<typeof createPublicSupabaseClient>>,
  releaseIds: string[]
): Promise<ReleaseItemRow[] | null> {
  const rows: ReleaseItemRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("release_items")
      .select("id,release_id,product_id,category,affected_areas,summary,risk_level")
      .in("release_id", releaseIds)
      .eq("published", true)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return null;
    }

    const page = (data as ReleaseItemRow[] | null) ?? [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      return rows;
    }
  }
}

async function fetchReleaseItemSources(
  supabase: NonNullable<ReturnType<typeof createPublicSupabaseClient>>,
  itemIds: string[]
): Promise<ReleaseItemSourceRow[] | null> {
  const rows: ReleaseItemSourceRow[] = [];

  for (let index = 0; index < itemIds.length; index += PAGE_SIZE) {
    const batch = itemIds.slice(index, index + PAGE_SIZE);

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("release_item_sources")
        .select("item_id,label,url")
        .in("item_id", batch)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return null;
      }

      const page = (data as ReleaseItemSourceRow[] | null) ?? [];
      rows.push(...page);

      if (page.length < PAGE_SIZE) {
        break;
      }
    }
  }

  return rows;
}
