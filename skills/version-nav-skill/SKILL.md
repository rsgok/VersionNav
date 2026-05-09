---
name: version-nav-skill
description: Use when an OpenClaw user asks whether to upgrade, which OpenClaw version to choose, how to validate after upgrading, or how a release affects their local providers, plugins, channels, skills, cron jobs, or doctor/update status.
---

# VersionNav Skill

Use this skill as VersionNav's local OpenClaw bridge. It collects read-only local state, redacts sensitive values, asks the VersionNav API for a sourced upgrade decision, and returns the decision inside OpenClaw.

## Workflow

1. Collect the local read-only profile:

```bash
npx tsx scripts/collect-profile.ts
```

2. Ask the hosted advisor API for a recommendation:

```bash
npx tsx scripts/recommend.ts --api-url https://versionnav.example.com --product openclaw --intent "I mainly use Codex OAuth and local browser"
```

3. Return the result directly to the user in this structure:

- Current status
- Recommended action: `stay`, `upgrade`, `wait`, or `avoid`
- Recommended version
- Reasons
- Risks
- Upgrade command
- Validation commands
- Rollback notes
- Sources

## Privacy Rules

- Only collect read-only state.
- Keep provider, plugin, channel, and skill names.
- Do not upload API keys, tokens, emails, phone numbers, transcript text, message content, or full local paths.
- For local paths, upload boolean/category signals only, such as `defaultOpenClawAgentsPath=true`.
- If `openclaw update status --json` fails, fall back to `openclaw --version`.
- If the API is unavailable, explain the failure and provide manual checks: `openclaw update status --json`, `openclaw doctor --non-interactive`, and the public compare page.
- Do not mention paid tiers or gated features; VersionNav is not monetized yet.
