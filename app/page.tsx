import {
  ArrowRight,
  GitCompareArrows,
  Languages
} from "lucide-react";
import AdvisorForm from "@/components/AdvisorForm";
import ProductSelect from "@/components/ProductSelect";
import SourcePill from "@/components/SourcePill";
import { dictionary, normalizeLocale } from "@/lib/i18n";
import { normalizeProductId } from "@/lib/products";
import {
  getReleaseItemCountFromStore,
  getProductFromStore,
  latestStableFromReleases,
  listReleaseVersionsFromStore,
  listProductsFromStore,
} from "@/lib/supabase/release-store";

const feedbackUrl = "https://github.com/rsgok/VersionNav/issues/new";
const repositoryUrl = "https://github.com/rsgok/VersionNav";
const githubSponsorsUrl = "https://github.com/sponsors/rsgok";

function GitHubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.02c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18.92-.26 1.9-.38 2.88-.39.98 0 1.96.13 2.88.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.42-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12v3.15c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

type HomePageProps = {
  searchParams: Promise<{
    lang?: string;
    product?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const locale = normalizeLocale(params.lang);
  const messages = dictionary[locale];
  const productId = normalizeProductId(params.product);
  const [products, product, releases, releaseItemCount] = await Promise.all([
    listProductsFromStore(),
    getProductFromStore(productId),
    listReleaseVersionsFromStore(productId),
    getReleaseItemCountFromStore(productId)
  ]);
  const latest = latestStableFromReleases(releases);
  const firstVersion = releases[0]?.version ?? "";
  const latestVersion = latest?.version ?? "";
  const compareHref = `/compare?product=${productId}&lang=${locale}&from=${firstVersion}&to=${latestVersion}`;

  return (
    <main className="app-main">
      <header className="app-header">
        <a className="brand-mark" href={`/?product=${productId}&lang=${locale}`}>
          <span>VersionNav</span>
          <small>{messages.tagline}</small>
        </a>
        <nav className="header-actions" aria-label="Primary">
          <a className="button button--quiet" href={compareHref}>
            <GitCompareArrows size={17} />
            {messages.compareVersions}
          </a>
          <a
            className="button button--quiet button--icon"
            href={repositoryUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
            title="GitHub repository"
          >
            <GitHubMark />
          </a>
          <a
            className="button button--quiet"
            href={`/?product=${productId}&lang=${locale === "en" ? "zh" : "en"}`}
          >
            <Languages size={17} />
            {locale === "en" ? "中文" : "English"}
          </a>
        </nav>
      </header>

      <section className="tool-hero">
        <div className="tool-hero__copy">
          <p className="eyebrow">{product.name}</p>
          <h1>{messages.mainTitle}</h1>
          <p>{messages.mainSubtitle}</p>
        </div>
        <div className="hero-meta" aria-label="Product release status">
          <ProductSelect
            messages={messages}
            products={products}
            productId={productId}
            locale={locale}
          />
          <dl>
            <div>
              <dt>{messages.latestStable}</dt>
              <dd>{latest?.version ?? "Pending"}</dd>
            </div>
            <div>
              <dt>{messages.releaseFacts}</dt>
              <dd>{releaseItemCount.toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="upgrade-workbench" id="advisor">
        <div className="workbench-bar">
          <div>
            <span>{messages.workbenchLabel}</span>
            <strong>{messages.workbenchTitle}</strong>
          </div>
          <a href={compareHref}>
            <GitCompareArrows size={17} />
            {messages.compareVersions}
            <ArrowRight size={16} />
          </a>
        </div>

        <div className="workbench-grid">
          <div className="advisor-section">
            <div className="section-heading">
              <div>
                <p className="kicker">{messages.advisorKicker}</p>
                <h2>{messages.recommendationTitle}</h2>
              </div>
            </div>
            {releases.length > 0 ? (
              <AdvisorForm releases={releases} messages={messages} productId={productId} locale={locale} />
            ) : (
              <p>{product.description}</p>
            )}
          </div>
        </div>

        <div className="workbench-footer">
          <p>
            <strong>{messages.sourceCardTitle}.</strong> {messages.sourceCardBody}
          </p>
          <div className="source-band" aria-label="Fact sources">
            {product.sourceDocs.length > 0 ? (
              product.sourceDocs.map((source) => <SourcePill key={source.url} source={source} />)
            ) : (
              <span className="source-pill">{product.name} source pending</span>
            )}
          </div>
        </div>
      </section>

      <section className="public-info-grid">
        <div className="public-info">
          <p className="kicker">{messages.skillKicker}</p>
          <h2>{messages.skillTitle}</h2>
          <p>{messages.skillBody}</p>
          <code>npx skills add https://github.com/rsgok/VersionNav --skill version-nav-skill</code>
        </div>
        <div className="public-info public-info--actions">
          <p className="kicker">{messages.communityKicker}</p>
          <h2>{messages.communityTitle}</h2>
          <p>{messages.communityBody}</p>
          <div className="public-actions">
            <a href={feedbackUrl} target="_blank" rel="noreferrer">
              {messages.feedback}
            </a>
            <a className="public-actions__primary" href={githubSponsorsUrl} target="_blank" rel="noreferrer">
              {messages.sponsor}
            </a>
          </div>
        </div>
      </section>

    </main>
  );
}
