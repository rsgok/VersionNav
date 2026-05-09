create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.agent_products (
  id text primary key,
  name text not null,
  description text not null default '',
  source_status text not null default 'pending'
    check (source_status in ('active', 'pending', 'paused')),
  local_profile_hints text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.release_sources (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.agent_products(id) on delete cascade,
  source_type text not null
    check (source_type in ('github_releases', 'docs', 'rss', 'npm', 'manual')),
  label text not null,
  url text not null,
  enabled boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, url)
);

create table if not exists public.release_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.agent_products(id) on delete cascade,
  source_id uuid references public.release_sources(id) on delete set null,
  external_id text,
  source_url text not null,
  content_hash text not null,
  fetched_at timestamptz not null default now(),
  raw_content text,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (product_id, source_url, content_hash)
);

create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.agent_products(id) on delete cascade,
  version text not null,
  release_date timestamptz not null,
  channel text not null default 'stable'
    check (channel in ('stable', 'beta', 'nightly')),
  source_url text not null,
  raw_markdown text not null default '',
  stability_label text not null default 'fresh'
    check (stability_label in ('fresh', 'settled', 'watch', 'avoid')),
  snapshot_id uuid references public.release_snapshots(id) on delete set null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, version)
);

create table if not exists public.release_items (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  product_id text not null references public.agent_products(id) on delete cascade,
  category text not null
    check (
      category in (
        'feature',
        'fix',
        'breaking',
        'migration',
        'security',
        'provider',
        'plugin',
        'channel',
        'cron',
        'memory',
        'browser',
        'codex',
        'doctor'
      )
    ),
  affected_areas text[] not null default '{}',
  summary text not null,
  risk_level int not null check (risk_level between 1 and 5),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.release_item_sources (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.release_items(id) on delete cascade,
  label text not null,
  url text not null,
  created_at timestamptz not null default now(),
  unique (item_id, url)
);

create table if not exists public.release_item_embeddings (
  item_id uuid primary key references public.release_items(id) on delete cascade,
  embedding vector(1536),
  embedding_model text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.agent_products(id) on delete cascade,
  job_type text not null
    check (job_type in ('sync_releases', 'parse_release', 'embed_items', 'publish_review')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text,
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_release_sources_product on public.release_sources(product_id);
create index if not exists idx_releases_product_date on public.releases(product_id, release_date desc);
create index if not exists idx_releases_product_published on public.releases(product_id, published);
create index if not exists idx_release_items_release on public.release_items(release_id);
create index if not exists idx_release_items_product_category on public.release_items(product_id, category);
create index if not exists idx_release_items_affected_areas on public.release_items using gin(affected_areas);
create index if not exists idx_analysis_jobs_status_run_after on public.analysis_jobs(status, run_after);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_agent_products_updated_at on public.agent_products;
create trigger trg_agent_products_updated_at
before update on public.agent_products
for each row execute function public.set_updated_at();

drop trigger if exists trg_release_sources_updated_at on public.release_sources;
create trigger trg_release_sources_updated_at
before update on public.release_sources
for each row execute function public.set_updated_at();

drop trigger if exists trg_releases_updated_at on public.releases;
create trigger trg_releases_updated_at
before update on public.releases
for each row execute function public.set_updated_at();

drop trigger if exists trg_release_items_updated_at on public.release_items;
create trigger trg_release_items_updated_at
before update on public.release_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_release_item_embeddings_updated_at on public.release_item_embeddings;
create trigger trg_release_item_embeddings_updated_at
before update on public.release_item_embeddings
for each row execute function public.set_updated_at();

drop trigger if exists trg_analysis_jobs_updated_at on public.analysis_jobs;
create trigger trg_analysis_jobs_updated_at
before update on public.analysis_jobs
for each row execute function public.set_updated_at();

alter table public.agent_products enable row level security;
alter table public.release_sources enable row level security;
alter table public.release_snapshots enable row level security;
alter table public.releases enable row level security;
alter table public.release_items enable row level security;
alter table public.release_item_sources enable row level security;
alter table public.release_item_embeddings enable row level security;
alter table public.analysis_jobs enable row level security;

drop policy if exists "public read products" on public.agent_products;
create policy "public read products"
on public.agent_products for select
to anon, authenticated
using (source_status in ('active', 'pending'));

drop policy if exists "public read enabled sources" on public.release_sources;
create policy "public read enabled sources"
on public.release_sources for select
to anon, authenticated
using (enabled = true);

drop policy if exists "public read published releases" on public.releases;
create policy "public read published releases"
on public.releases for select
to anon, authenticated
using (published = true);

drop policy if exists "public read published release items" on public.release_items;
create policy "public read published release items"
on public.release_items for select
to anon, authenticated
using (published = true);

drop policy if exists "public read sources for published items" on public.release_item_sources;
create policy "public read sources for published items"
on public.release_item_sources for select
to anon, authenticated
using (
  exists (
    select 1
    from public.release_items item
    where item.id = release_item_sources.item_id
      and item.published = true
  )
);

insert into public.agent_products (id, name, description, source_status, local_profile_hints)
values
  (
    'openclaw',
    'OpenClaw',
    'Local agent CLI with update, doctor, skill, plugin, provider, channel, memory, browser, and cron surfaces.',
    'active',
    array[
      'openclaw --version',
      'openclaw update status --json',
      'openclaw doctor --non-interactive',
      '~/.openclaw/openclaw.json'
    ]
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  source_status = excluded.source_status,
  local_profile_hints = excluded.local_profile_hints;

insert into public.release_sources (product_id, source_type, label, url, enabled)
values
  ('openclaw', 'github_releases', 'OpenClaw GitHub releases', 'https://github.com/openclaw/openclaw/releases', true),
  ('openclaw', 'docs', 'OpenClaw update docs', 'https://docs.openclaw.ai/cli/update', true),
  ('openclaw', 'docs', 'OpenClaw doctor docs', 'https://docs.openclaw.ai/doctor', true),
  ('openclaw', 'docs', 'OpenClaw skills config docs', 'https://docs.openclaw.ai/tools/skills-config', true)
on conflict (product_id, url) do update set
  source_type = excluded.source_type,
  label = excluded.label,
  enabled = excluded.enabled;
