import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import FeedbackForm from "@/components/FeedbackForm";
import RecommendationResult from "@/components/RecommendationResult";
import { dictionary, normalizeLocale } from "@/lib/i18n";
import { normalizeProductId } from "@/lib/products";
import { buildRecommendation } from "@/lib/recommendation";
import {
  getProductFromStore,
  latestStableFromReleases,
  listReleaseRangeWithItemsFromStore,
  listReleaseVersionsFromStore
} from "@/lib/supabase/release-store";
import type { UserProfile } from "@/lib/types";

type DecisionPageProps = {
  searchParams: Promise<{
    channels?: string;
    cron?: string;
    from?: string;
    intent?: string;
    lang?: string;
    plugins?: string;
    product?: string;
    providers?: string;
    risk?: string;
    skills?: string;
    to?: string;
  }>;
};

export default async function DecisionPage({ searchParams }: DecisionPageProps) {
  const params = await searchParams;
  const locale = normalizeLocale(params.lang);
  const messages = dictionary[locale];
  const productId = normalizeProductId(params.product);
  const [product, releaseVersions] = await Promise.all([
    getProductFromStore(productId),
    listReleaseVersionsFromStore(productId)
  ]);
  const currentVersion = params.from ?? releaseVersions[0]?.version;
  const targetVersion = params.to ?? latestStableFromReleases(releaseVersions)?.version;
  const releases = await listReleaseRangeWithItemsFromStore({
    productId,
    fromVersion: currentVersion,
    toVersion: targetVersion
  });
  const profile: UserProfile = {
    productId,
    currentVersion,
    enabledProviders: splitParam(params.providers),
    enabledPlugins: splitParam(params.plugins),
    enabledChannels: splitParam(params.channels),
    enabledSkills: splitParam(params.skills),
    cronUsed: params.cron === "true",
    riskTolerance: normalizeRisk(params.risk)
  };
  const result = buildRecommendation({
    productId,
    profile,
    userIntent: params.intent ?? "",
    fromVersion: currentVersion,
    targetVersion,
    releases
  });
  const compareHref = `/compare?product=${productId}&lang=${locale}&from=${currentVersion ?? ""}&to=${result.recommendedVersion}`;

  return (
    <main>
      <section className="decision-hero">
        <Link href={`/?product=${productId}&lang=${locale}`} className="back-link">
          <ArrowLeft size={16} />
          VersionNav · {product.name}
        </Link>
        <h1>{messages.decisionTitle}</h1>
        <p>
          <span>{currentVersion}</span>
          <ArrowRight size={18} />
          <span>{result.recommendedVersion}</span>
        </p>
      </section>

      <section className="decision-layout">
        <RecommendationResult result={result} messages={messages} />
        <aside className="decision-side">
          <div>
            <p className="kicker">{messages.scenario}</p>
            <p>{params.intent || messages.askEmpty}</p>
          </div>
          <Link className="button button--quiet" href={compareHref as never}>
            {messages.showFullCompare}
            <ArrowRight size={16} />
          </Link>
          <div>
            <p className="kicker">{messages.feedback}</p>
            <FeedbackForm
              messages={messages}
              productId={productId}
              fromVersion={currentVersion}
              targetVersion={result.recommendedVersion}
              recommendation={result}
            />
          </div>
        </aside>
      </section>
    </main>
  );
}

function splitParam(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeRisk(value?: string): UserProfile["riskTolerance"] {
  return value === "low" || value === "high" ? value : "medium";
}
