alter table public.release_items
add column if not exists impact_level text not null default 'low'
  check (impact_level in ('none', 'low', 'medium', 'high', 'blocking')),
add column if not exists impact_surfaces text[] not null default '{}',
add column if not exists requires_validation boolean not null default false,
add column if not exists validation_hints text[] not null default '{}',
add column if not exists rollback_hints text[] not null default '{}',
add column if not exists source_confidence text not null default 'official'
  check (source_confidence in ('official', 'inferred', 'community')),
add column if not exists known_issue_count int not null default 0
  check (known_issue_count >= 0);

create index if not exists idx_release_items_impact_surfaces
on public.release_items using gin(impact_surfaces);

create index if not exists idx_release_items_source_confidence
on public.release_items(product_id, source_confidence);

update public.release_items
set
  impact_level = case
    when risk_level >= 5 then 'blocking'
    when risk_level >= 4 then 'high'
    when risk_level >= 3 then 'medium'
    when risk_level >= 2 then 'low'
    else 'none'
  end,
  impact_surfaces = coalesce(nullif(affected_areas, array[]::text[]), array[category]),
  requires_validation = risk_level >= 3
    or category in ('breaking', 'migration', 'security', 'provider', 'plugin', 'cron', 'browser', 'doctor'),
  validation_hints = case
    when risk_level >= 3
      or category in ('breaking', 'migration', 'security', 'provider', 'plugin', 'cron', 'browser', 'doctor')
    then array['openclaw update status --json', 'openclaw doctor --non-interactive']
    else '{}'
  end,
  rollback_hints = array[
    'Keep the previous version number before upgrading.',
    'If validation fails, reinstall the previous pinned version with the same install method.'
  ]
where source_confidence = 'official'
  and known_issue_count = 0;

create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.agent_products(id) on delete cascade,
  from_version text,
  target_version text,
  profile_fingerprint text,
  affected_surfaces text[] not null default '{}',
  reason text not null
    check (
      reason in (
        'confusing_recommendation',
        'missing_source',
        'wrong_recommendation',
        'upgrade_failed',
        'rollback_succeeded',
        'rollback_failed',
        'request_agent'
      )
    ),
  message text,
  related_release_item_ids text[] not null default '{}',
  validation_result jsonb not null default '{}'::jsonb,
  status text not null default 'new'
    check (status in ('new', 'triaged', 'converted', 'ignored')),
  created_at timestamptz not null default now()
);

alter table public.feedback_reports enable row level security;

drop policy if exists "feedback reports are private" on public.feedback_reports;

create index if not exists idx_feedback_reports_product_version
on public.feedback_reports(product_id, target_version, created_at desc);

create index if not exists idx_feedback_reports_surfaces
on public.feedback_reports using gin(affected_surfaces);
