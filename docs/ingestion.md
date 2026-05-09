# Release Ingestion

VersionNav uses a local-first ingestion loop. Codex can run the same command each time new version data should be added.

## One Command

```bash
npm run ingest:openclaw
```

What it does:

1. Resolve Supabase admin config from env vars, or auto-detect the local `supabase-kong` docker service key.
2. Fetch OpenClaw GitHub releases with pagination.
3. Parse release markdown into structured `release_items`.
4. Run quality gates:
   - empty summary is blocked
   - high-risk items need source links
   - source links must be `https`
5. Skip versions already in Supabase unless `--force` is passed.
6. Upsert snapshots, releases, items, and item source links.
7. Record the run in `analysis_jobs`.

## Useful Modes

Dry run without writing release rows. By default OpenClaw ingestion keeps releases from `2026.3.1` onward so the public selector covers 2026.3.x without filling the UI with much older package versions:

```bash
npm run ingest:openclaw -- --dry-run --limit 5
```

Change the lower bound:

```bash
npm run ingest:openclaw -- --since-version 2026.4.1
```

Import every historical release:

```bash
npm run ingest:openclaw -- --all-versions
```

Use a local analyzed JSON file instead of GitHub:

```bash
npm run ingest:openclaw -- --input data/openclaw-releases.json
```

Reprocess existing versions:

```bash
npm run ingest:openclaw -- --force
```

Use GitHub authenticated quota:

```bash
GITHUB_TOKEN=... npm run ingest:openclaw
```

## Codex Handoff

When asked to add new version data:

1. Run `npm run ingest:openclaw -- --dry-run`.
2. If GitHub rate limit fails, ask for or use `GITHUB_TOKEN`; alternatively run with `--input` if a local analyzed JSON exists.
3. If dry-run quality issues are only expected source-gate skips, run `npm run ingest:openclaw`.
4. Verify counts:

```bash
docker exec supabase-db psql -U postgres -d postgres -c "select count(*) from public.releases; select count(*) from public.release_items;"
```

5. Open the app and confirm `/api/releases?productId=openclaw` returns Supabase data.
