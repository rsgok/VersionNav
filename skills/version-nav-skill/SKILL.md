---
name: version-nav-skill
description: Use when an OpenClaw user asks whether to upgrade, which OpenClaw version to choose, how to validate after upgrading, or how a release affects their local providers, plugins, channels, skills, cron jobs, or doctor/update status.
---

# VersionNav Skill

Use this skill as VersionNav's local OpenClaw bridge. It collects read-only local state, redacts sensitive values, asks the VersionNav API for a sourced upgrade decision, and returns the decision inside OpenClaw.

## Workflow

1. Collect the local read-only profile and local evidence:

```bash
npx tsx scripts/collect-profile.ts --mode before > before.json
```

2. Ask the hosted advisor API for a recommendation:

```bash
npx tsx scripts/recommend.ts --api-url https://versionnav.example.com --product openclaw --profile before.json --intent "I mainly use Codex OAuth and local browser"
```

The response includes a short upgrade summary and a `reportUrl` pointing to the matching VersionNav `/decision` report. The report URL only carries public query parameters such as product, versions, language, and intent; it does not embed the full local profile.

3. Optionally generate a read-only validation plan, then compare before/after profiles after the user upgrades manually:

```bash
npx tsx scripts/verify-openclaw.ts --profile before.json --target 2026.x.x
npx tsx scripts/collect-profile.ts --mode after > after.json
npx tsx scripts/compare-validation.ts --before before.json --after after.json
```

4. Return the result directly to the user in this structure:

- Current status
- Recommended action: `stay`, `upgrade`, `wait`, or `avoid`
- Recommended version
- Reasons
- Risks
- Validation plan
- Rollback notes
- Sources
- VersionNav report link

## Privacy Rules

- Only collect read-only state.
- Keep provider, plugin, channel, and skill names.
- Do not upload API keys, tokens, emails, phone numbers, transcript text, message content, or full local paths.
- For local paths, upload boolean/category signals only, such as `defaultOpenClawAgentsPath=true`.
- Do not execute upgrade or rollback commands. Validation scripts only read OpenClaw status and compare collected profiles.
- If `openclaw update status --json` fails, fall back to `openclaw --version`.
- If the API is unavailable, explain the failure and provide manual checks: `openclaw update status --json`, `openclaw doctor --non-interactive`, and the public compare page.
- Do not mention paid tiers or gated features; VersionNav is not monetized yet.
