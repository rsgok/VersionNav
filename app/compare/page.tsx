import { ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import CompareControls from "@/components/CompareControls";
import { dictionary, normalizeLocale } from "@/lib/i18n";
import { normalizeProductId } from "@/lib/products";
import {
  compareRangeFromReleases,
  getProductFromStore,
  listReleaseRangeWithItemsFromStore,
  listReleaseVersionsFromStore
} from "@/lib/supabase/release-store";
import type { Release, ReleaseItem } from "@/lib/types";

type ComparePageProps = {
  searchParams: Promise<{
    from?: string;
    lang?: string;
    product?: string;
    to?: string;
  }>;
};

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const locale = normalizeLocale(params.lang);
  const messages = dictionary[locale];
  const productId = normalizeProductId(params.product);
  const [product, releases] = await Promise.all([
    getProductFromStore(productId),
    listReleaseVersionsFromStore(productId)
  ]);
  const from = params.from ?? releases[0]?.version;
  const to = params.to ?? releases[releases.length - 1]?.version;
  const releasesWithItems = await listReleaseRangeWithItemsFromStore({
    productId,
    fromVersion: from,
    toVersion: to
  });
  const range = compareRangeFromReleases(releasesWithItems, from, to);
  const items = range.flatMap((release) =>
    release.items.map((item) => ({
      ...item,
      releaseSourceUrl: release.sourceUrl,
      releaseVersion: release.version
    }))
  );
  const summary = summarizeCompare(range, items, locale);
  const riskBuckets = buildRiskBuckets(items);
  const categoryBars = summary.topCategories.slice(0, 5);
  const maxCategoryCount = Math.max(...categoryBars.map(([, count]) => count), 1);
  const notableItems = [...items]
    .sort((left, right) => scoreCompareItem(right) - scoreCompareItem(left))
    .slice(0, 6);
  const grouped = Object.entries(
    items.reduce<Record<string, typeof items>>((acc, item) => {
      acc[item.category] = [...(acc[item.category] ?? []), item];
      return acc;
    }, {})
  ).sort(([, left], [, right]) => right.length - left.length);

  return (
    <main>
      <section className="compare-hero">
        <Link href="/" className="back-link">
          VersionNav · {product.name}
        </Link>
        <h1>
          <span>{from}</span>
          <ArrowRight size={28} />
          <span>{to}</span>
        </h1>
        <p>{messages.compareIntro}</p>
        <CompareControls releases={releases} from={from} to={to} productId={productId} locale={locale} />
      </section>

      <section className="compare-summary">
        {items.length === 0 ? (
          <div className="compare-empty">
            <h2>{messages.noItems}</h2>
            <p>{messages.chooseWider}</p>
          </div>
        ) : (
          <>
            <div className="summary-lead">
              <p className="kicker">{messages.compareSummaryTitle}</p>
              <h2>{summary.sentence}</h2>
              <div className="summary-metrics" aria-label="Compare summary metrics">
                <span>
                  <strong>{summary.releaseCount}</strong>
                  {messages.summaryVersions}
                </span>
                <span>
                  <strong>{items.length}</strong>
                  {messages.releaseFacts}
                </span>
                <span>
                  <strong>{summary.highRiskCount}</strong>
                  {messages.summaryHighRisk}
                </span>
              </div>
            </div>

            <section className="compare-visuals" aria-label={messages.visualSummary}>
              <div className="visual-panel visual-panel--wide">
                <div className="visual-panel__header">
                  <h3>{messages.riskDistribution}</h3>
                  <small>{items.length} {messages.releaseFacts}</small>
                </div>
                <div className="risk-bars">
                  {riskBuckets.map((bucket) => (
                    <a className="risk-bar" href={`#risk-${bucket.risk}`} key={bucket.risk}>
                      <span>{riskLabelFor(bucket.risk, messages)}</span>
                      <div>
                        <i style={{ width: `${percent(bucket.count, items.length)}%` }} />
                      </div>
                      <strong>{bucket.count}</strong>
                    </a>
                  ))}
                </div>
              </div>
              <div className="visual-panel">
                <div className="visual-panel__header">
                  <h3>{messages.summaryCategories}</h3>
                  <small>{summary.topCategories.length}</small>
                </div>
                <div className="category-bars">
                  {categoryBars.map(([category, count]) => (
                    <a className="category-bar" href={`#category-${category}`} key={category}>
                      <span>{category}</span>
                      <div>
                        <i style={{ width: `${percent(count, maxCategoryCount)}%` }} />
                      </div>
                      <strong>{count}</strong>
                    </a>
                  ))}
                </div>
              </div>
            </section>

            <div className="summary-breakdown">
              <div>
                <h3>{messages.summaryTopAreas}</h3>
                <div className="summary-tags">
                  {summary.topAreas.map(([area, count]) => (
                    <span key={area}>{area} · {count}</span>
                  ))}
                </div>
              </div>
              <div>
                <h3>{messages.summaryCategories}</h3>
                <div className="summary-tags">
                  {summary.topCategories.map(([category, count]) => (
                    <span key={category}>{category} · {count}</span>
                  ))}
                </div>
              </div>
            </div>

            <section className="notable-list" aria-label={messages.notableChanges}>
              <div className="notable-heading">
                <h2>{messages.notableChanges}</h2>
                <p>{messages.notableLimitHint}</p>
              </div>
              <div>
                {notableItems.map((item) => (
                  <article className="notable-item" key={item.id}>
                    <span>{item.releaseVersion} · {item.category} · {riskLabelFor(item.riskLevel, messages)}</span>
                    <strong>{truncate(item.summary, 210)}</strong>
                    <div className="source-list">
                      {sourceLinksFor(item).slice(0, 2).map((source) => (
                        <a href={source.url} key={source.url} target="_blank" rel="noreferrer">
                          {source.label} <ExternalLink size={12} />
                        </a>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <details className="compare-details">
              <summary>{messages.detailTable} ({items.length})</summary>
              <div className="detail-groups">
                {riskBuckets
                  .filter((bucket) => bucket.count > 0)
                  .sort((left, right) => right.risk - left.risk)
                  .map((bucket) => (
                    <details className="category-detail" id={`risk-${bucket.risk}`} key={bucket.risk}>
                      <summary>
                        <span>{riskLabelFor(bucket.risk, messages)}</span>
                        <small>{bucket.count}</small>
                      </summary>
                      <div className="detail-table-wrap">
                        <table className="detail-table">
                          <thead>
                            <tr>
                              <th>{messages.detailVersion}</th>
                              <th>{messages.detailChange}</th>
                              <th>{messages.riskLabel}</th>
                              <th>{messages.detailAreas}</th>
                              <th>{messages.sources}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items
                              .filter((item) => item.riskLevel === bucket.risk)
                              .map((item) => (
                                <tr key={item.id}>
                                  <td>{item.releaseVersion}</td>
                                  <td>{item.summary}</td>
                                  <td>{riskLabelFor(item.riskLevel, messages)}</td>
                                  <td>{item.affectedAreas.join(", ")}</td>
                                  <td>
                                    {sourceLinksFor(item).slice(0, 2).map((source) => (
                                      <a href={source.url} key={source.url} target="_blank" rel="noreferrer">
                                        {source.label}
                                      </a>
                                    ))}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                {grouped.map(([category, categoryItems]) => (
                  <details className="category-detail" id={`category-${category}`} key={category}>
                    <summary>
                      <span>{category}</span>
                      <small>{categoryItems.length}</small>
                    </summary>
                    <div className="detail-table-wrap">
                      <table className="detail-table">
                        <thead>
                          <tr>
                            <th>{messages.detailVersion}</th>
                            <th>{messages.detailChange}</th>
                            <th>{messages.riskLabel}</th>
                            <th>{messages.detailAreas}</th>
                            <th>{messages.sources}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryItems.map((item) => (
                            <tr key={item.id}>
                              <td>{item.releaseVersion}</td>
                              <td>{item.summary}</td>
                              <td>{item.riskLevel}/5</td>
                              <td>{item.affectedAreas.join(", ")}</td>
                              <td>
                                {sourceLinksFor(item).slice(0, 2).map((source) => (
                                  <a href={source.url} key={source.url} target="_blank" rel="noreferrer">
                                    {source.label}
                                  </a>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          </>
        )}
      </section>
    </main>
  );
}

type CompareItem = ReleaseItem & {
  releaseSourceUrl: string;
  releaseVersion: string;
};

function summarizeCompare(releases: Release[], items: CompareItem[], locale: "en" | "zh") {
  const highRiskCount = items.filter((item) => item.riskLevel >= 4).length;
  const securityCount = items.filter((item) => item.category === "security").length;
  const topAreas = topCounts(items.flatMap((item) => item.affectedAreas), 6);
  const topCategories = topCounts(items.map((item) => item.category), 6);
  const sentence =
    locale === "zh"
      ? [
          `这个范围包含 ${releases.length} 个版本、${items.length} 条变更。`,
          highRiskCount > 0 ? `其中 ${highRiskCount} 条是高风险或迁移相关变更。` : "没有标记为高风险的变更。",
          securityCount > 0 ? `包含 ${securityCount} 条安全相关变更。` : ""
        ]
          .filter(Boolean)
          .join("")
      : [
          `This range includes ${items.length} change items across ${releases.length} releases.`,
          highRiskCount > 0 ? `${highRiskCount} are high-risk migration/breaking items.` : "No high-risk item is marked in this range.",
          securityCount > 0 ? `${securityCount} security-related items are included.` : ""
        ]
          .filter(Boolean)
          .join(" ");

  return {
    highRiskCount,
    releaseCount: releases.length,
    sentence,
    topAreas,
    topCategories
  };
}

function topCounts(values: string[], limit: number): Array<[string, number]> {
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort(([, left], [, right]) => right - left)
    .slice(0, limit);
}

function buildRiskBuckets(items: CompareItem[]) {
  return [1, 2, 3, 4, 5].map((risk) => ({
    risk,
    count: items.filter((item) => item.riskLevel === risk).length
  }));
}

function riskLabelFor(risk: number, messages: typeof dictionary.en): string {
  const labels = [
    messages.riskLevel1,
    messages.riskLevel2,
    messages.riskLevel3,
    messages.riskLevel4,
    messages.riskLevel5
  ];

  return labels[risk - 1] ?? `${messages.riskLabel} ${risk}`;
}

function percent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.max(2, Math.round((value / total) * 100));
}

function scoreCompareItem(item: CompareItem): number {
  // Prioritize changes that should be reviewed before upgrading, not a generic changelog highlight.
  return item.riskLevel * 4 + (item.category === "security" ? 5 : 0) + (item.category === "doctor" ? 3 : 0);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function sourceLinksFor(item: CompareItem) {
  return item.sourceRefs.length > 0
    ? item.sourceRefs
    : [{ label: `Release ${item.releaseVersion}`, url: item.releaseSourceUrl }];
}
