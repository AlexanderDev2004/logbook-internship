# Deployment Guide

Deploying the log book app to Cloudflare Workers at
`logbook.alexanderar.com` with Alchemy.

## Prerequisites

1. A Cloudflare account with the `alexanderar.com` zone active.
2. An API token with permissions for:
   - **Account** — Workers Scripts: Edit, D1: Edit, Account Settings: Read
   - **Zone** — DNS: Edit (for the `logbook.` subdomain + TLS certificate),
     Zone: Read
3. Node.js 22+ and pnpm 12.

## One-time authentication

Alchemy talks to the Cloudflare API for both `alchemy dev` and
`alchemy deploy`. Authenticate once, either way:

```bash
npx alchemy login        # browser device flow; stores a profile in ~/.alchemy
```

or export in your shell (or CI):

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
```

## Stages

Alchemy keeps separate state per stage:

- **`dev`** — `pnpm dev` (`alchemy dev --stage dev`). Resources are created
  **locally** (miniflare D1, no real Cloudflare data). Safe to wipe anytime.
- **`prod`** — `pnpm deploy` (`alchemy deploy`, default stage). Real
  resources: the D1 database, the Worker, and the custom domain.

State lives in `.alchemy/logbook/<stage>/*.json`. It is safe to delete the
`dev` state; do **not** delete `prod` state unless you intend to recreate the
production resources (state loss means Alchemy will create new ones, and the
old D1 with your data is orphaned).

## Patched dependency

`patches/alchemy@0.78.0.patch` fixes a bug in Alchemy 0.78.0's Cloudflare API
client: when a request passed extra headers (which D1 create/update always
does), the default `Content-Type: application/json` header was dropped, so
Cloudflare saw an empty body and D1 creation failed with
`7400: Invalid property: name => Required`. The patch merges the extra
headers into the defaults instead of replacing them (in both `src/` and
`lib/` â€” Node runs the compiled `lib/`). pnpm applies it automatically on
`pnpm install`. If you upgrade Alchemy, first check whether the fix landed
upstream and delete the patch if so.

The Typst compiler WASM (~27 MB) exceeds Cloudflare's 25 MB per-file static
asset limit, so it is loaded at runtime from a pinned jsDelivr URL of the
same package version instead of being bundled
(see `src/lib/typst/compile.ts`).

## First deploy

```bash
pnpm install
pnpm deploy
```

Alchemy will:

1. Create the D1 database `logbook-db` (APAC location hint) and apply the
   migrations in `drizzle/`.
2. Build the TanStack Start worker and upload it.
3. Bind the custom domain `logbook.alexanderar.com` and provision its
   certificate. DNS is created automatically if the zone is on the same
   account.

Then set the runtime secrets:

```bash
npx alchemy secret set AI_API_KEY      # prompts for the value
# optional:
npx alchemy secret set AI_BASE_URL     # default https://api.openai.com/v1
npx alchemy secret set AI_MODEL        # default gpt-4o-mini
```

Secrets are encrypted into the stage state with `ALCHEMY_PASSWORD` — keep that
passphrase safe; you need the same one to manage the secrets later.

Open https://logbook.alexanderar.com and register the owner account (first
visit only). The first account becomes the single owner of the instance.

## Updating

```bash
git pull
pnpm install
pnpm deploy
```

Database schema changes:

```bash
pnpm db:generate                        # drizzle-kit generate → drizzle/*.sql
pnpm deploy                             # migrations apply on deploy
```

Rollback: redeploy a previous commit (`git checkout <sha> && pnpm deploy`).
The D1 data is never touched by deploys.

## Deploying from CI (GitHub Actions)

The repo has a CI workflow (`.github/workflows/ci.yml`) that typechecks and
runs the Typst compile check on every push. Automated deploys from CI are
**not** set up, deliberately: Alchemy state is file-based, and a CI runner
without the committed `prod` state would recreate (not update) the D1
database, losing data. If you want CI deploys later, commit the `prod` state
files and add `ALCHEMY_PASSWORD`, `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` as repository secrets, then run `pnpm deploy` in the
workflow. Until then, deploy from a machine that has the `prod` state
(i.e. the one that ran the first deploy).

The `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` already stored in GitHub
Actions secrets are still useful for any workflow that needs Cloudflare API
access; they are not readable by anyone — not even repository admins.

## Destroying

```bash
pnpm destroy        # alchemy destroy — removes worker, domain, D1 (data loss)
```

## Troubleshooting

- **`No credentials found`** — run `npx alchemy login` or export the token
  variables.
- **`authentication failed` / 403 from Cloudflare** — the token lacks one of
  the permissions listed above; regenerate it.
- **Domain stuck pending** — the zone must be active on the same account;
  check the certificate status in the Cloudflare dashboard (SSL/TLS → Custom
  Hostnames).
- **`no such table` after deploy** — migrations did not run; check that
  `drizzle/` contains the generated SQL and redeploy.
