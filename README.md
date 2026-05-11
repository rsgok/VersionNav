# VersionNav

VersionNav is an agent upgrade advisor. It compares official release facts, answers natural-language upgrade questions, and uses an optional Skill for local profile-aware decisions.

The current product intentionally has no paid tier. The priority is to prove trustworthy version intelligence and repeated personal use before deciding any monetization model.

## Sponsors

Sponsorship helps maintain release ingestion, source review, and coverage for more agent products.

<!-- sponsors-start -->
No public sponsors yet. [Become a sponsor](https://github.com/sponsors/rsgok).
<!-- sponsors-end -->

The sponsors block is updated by `.github/workflows/update-sponsors.yml` using public GitHub Sponsors data. Private sponsorships are not shown.

## Development

```bash
npm install
npm run dev
```

## Interfaces

- `POST /api/recommend`
- `POST /api/ask`
- `GET /api/releases?productId=openclaw`
- `GET /compare?product=openclaw&from=2026.4.23&to=2026.5.7`
- `POST /api/profile/analyze`
- `POST /api/feedback`

## Products

- `openclaw`: active fixture data, GitHub release connector, `version-nav-skill` local collector.

## Skill

Install the Skill when you want to ask upgrade questions from inside OpenClaw without filling a website profile form:

```bash
npx skills add https://github.com/rsgok/VersionNav --skill version-nav-skill
```

The Skill collects read-only OpenClaw signals, redacts sensitive values, and asks VersionNav for a sourced upgrade decision.

For upgrade validation, the Skill can collect before/after profile envelopes and compare them without executing upgrade or rollback commands:

```bash
npx tsx scripts/collect-profile.ts --mode before > before.json
npx tsx scripts/recommend.ts --api-url https://versionnav.example.com --product openclaw --profile before.json --intent "I mainly use browser and cron"
npx tsx scripts/verify-openclaw.ts --profile before.json --target 2026.x.x
npx tsx scripts/collect-profile.ts --mode after > after.json
npx tsx scripts/compare-validation.ts --before before.json --after after.json
```

`recommend.ts` returns a concise summary plus a `reportUrl` for the matching VersionNav `/decision` page. The URL uses public query params only and does not include the full local profile.

## Release Data Pipeline

1. Fetch official releases/docs per product connector.
2. Store raw markdown/html plus parsed structured facts.
3. Parse release items into category, affected areas, source refs, and risk level.
4. Block high-risk facts such as `breaking`, `security`, `auth`, `plugin install`, and `doctor migration` if they lack source links.
5. Answer natural-language questions from structured facts only; LLM summarization can rewrite explanations but cannot invent version facts.

For OpenClaw:

```bash
GITHUB_TOKEN=... npm run sync:releases -- openclaw
```

The GitHub token is optional locally until unauthenticated API quota is exhausted, but should be used for cron jobs.

For the normal local Codex workflow, use:

```bash
npm run ingest:openclaw -- --dry-run
npm run ingest:openclaw
```

OpenClaw ingestion uses GitHub release pagination and defaults to `--since-version 2026.3.1`, which keeps the public version selector broad enough for 2026.3.x upgrade paths without importing much older package-era releases. Use `--all-versions` when full history is needed.

See `docs/ingestion.md` for failure handling and local JSON input mode.

## Supabase-Only Backend

The app is wired to prefer Supabase data when these env vars are present:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Read path:

- Pages and API routes call `lib/supabase/release-store.ts`.
- The store uses the public anon key and RLS-protected published rows.
- If Supabase env vars are missing or empty, the app falls back to local fixtures.
- Browser-visible code never uses the service role key.

Write path:

- Apply `supabase/migrations/20260509173500_initial_versionnav_schema.sql`.
- Analyze release data locally.
- Push analyzed releases with:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run push:releases -- data/openclaw-releases.json
```

Main tables:

- `agent_products`: OpenClaw and later agent products.
- `release_sources`: official release/docs/RSS/package sources.
- `release_snapshots`: raw fetched payloads for replay and audit.
- `releases`: version-level published facts.
- `release_items`: structured feature/fix/security/breaking/etc facts.
- `release_item_sources`: source links for each fact.
- `release_item_embeddings`: optional pgvector rows for semantic search.
- `analysis_jobs`: queue/status table for Supabase Cron or future worker jobs.

RLS is enabled on all tables. Public clients can only read products, enabled sources, published releases, published release items, and source links for published items. Snapshots, jobs, and embeddings are private by default.

## I18n

The app supports `lang=en` and `lang=zh` query params. UI strings live in `lib/i18n.ts`.
