# Log Book Magang — Internship Journal

A web app that replaces the manual Typst/Word log book workflow for **Magang
Kampus Merdeka** (Polinema): write daily activities, let AI polish the wording,
collect the three required signatures, and export the signed PDF in the exact
official format.

Built with **TanStack Start** (SSR), **Vite**, **TailwindCSS v4**,
**shadcn/ui**, **Drizzle ORM** on **Cloudflare D1**, **Effect** for the AI
service layer, **Typst (WASM)** for PDF generation, deployed via **Alchemy** to
**Cloudflare Workers** at **https://logbook.alexanderar.com**.

## Features

- **Weekly log book pages** matching the official Polinema template — header
  letterhead, student info table, activities table (Hari/Tanggal, Jam Masuk,
  Jam Pulang, Kegiatan) and the three-party signature block.
- **AI text refinement** - one click per entry or per week; each user brings
  their own API key (**Settings > AI**): OpenRouter, [OI], Claude, Groq,
  OpenCode Zen, or any [OI]-compatible endpoint, with a model picker that loads
  the provider's model list. The key is stored server-side and never sent to
  the browser. A deployment-wide AI_API_KEY binding works as a fallback.

- **Three-step signing** — student, field supervisor (Pembimbing Lapangan),
  academic advisor (Dosen Pembimbing). Each party signs via a private,
  single-use link; signatures are drawn in the browser and embedded into the
  PDF. Weeks lock once a supervisor/advisor has signed.
- **PDF export** — compiled in the browser with the Typst WASM compiler using
  bundled metric-compatible fonts (Liberation Serif ≈ Times New Roman, Carlito
  ≈ Calibri). Export a single week or everything at once.
- **Customizable** — letterhead logo and lines, titles, fonts, student
  identity, supervisor names, your stored signature.

## Requirements

- Node.js 22+
- [pnpm](https://pnpm.io) 12 (set via `packageManager`; Alchemy requires pnpm)
- A Cloudflare account with the `alexanderar.com` zone (for deployment only —
  local dev also needs credentials because Alchemy creates the Worker resource
  through the Cloudflare API even in dev mode)

## Quick start

```bash
pnpm install
cp .dev.vars.example .dev.vars   # fill in AI_API_KEY (or export it instead)

# authenticate Alchemy once — pick either:
npx alchemy login                # browser device flow, stores a profile
# ...or export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID

pnpm dev                         # alchemy dev (stage "dev"): local D1 + Vite
```

Open http://localhost:3000. On the first run only, the registration form
creates the **owner account** for the instance and seeds the settings with the
Polinema letterhead template. After that, the login page appears.

### Environment variables

| Variable               | Scope           | Purpose                                              |
| ---------------------- | --------------- | ---------------------------------------------------- |
| `AI_API_KEY`           | runtime secret  | *Optional* fallback LLM key; users normally set their own key in **Settings → AI** |
| `AI_BASE_URL`          | runtime secret  | OpenAI-compatible endpoint, default `https://api.openai.com/v1` |
| `AI_MODEL`             | runtime secret  | Chat model, default `gpt-4o-mini`                    |
| `ALCHEMY_PASSWORD`     | local/CI        | Encrypts secrets stored in Alchemy state files       |
| `CLOUDFLARE_API_TOKEN` | local/CI        | Cloudflare auth for `alchemy dev` / `alchemy deploy` |
| `CLOUDFLARE_ACCOUNT_ID`| local/CI        | Cloudflare account ID                                |

Set runtime secrets (`AI_API_KEY`, …) for production with
`npx alchemy secret set AI_API_KEY`, or export them in the shell before
`pnpm deploy`.

## Daily usage

1. **Settings → Identity** — student name, NIM, program studi, nama mitra,
   supervisor names. These fill every PDF.
2. **Settings → Document** — letterhead logo, ministry/institution lines,
   address lines, title lines, heading/body fonts.
3. **Settings → Signature** — draw and store your own signature once; it is
   reused on every week you sign.
4. **Weeks** — create one week per log book page (`26_10_w3` + Monday date),
   add daily entries, hit **Refine with AI** on single entries or the whole
   week.
5. **Signing** — sign as the student in-app, then copy the two signing links
   from the week page to your field supervisor and academic advisor. They open
   the link, review the entries, and draw their signature — no account needed.
6. **PDF** — download a single week or export everything; the browser compiles
   the exact Polinema layout from your data.

Once a supervisor or advisor has signed, the week locks against editing. The
owner can reset a signature to unlock (the student signature cannot be reset
while supervisors are signed).

## Architecture

A short tour — full details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```text
browser ──► TanStack Start routes (SSR) ──► server fns (/_serverFn/*) ──► D1 (Drizzle)
   │                                              │
   │                                              ├─► Effect AiClient ──► OpenAI-compatible API
   │                                              └─► getPdfData (template payload)
   └─► Typst WASM compiler ◄── generate.ts (Typst source) ──► signed PDF download
```

- `src/routes/*` — file-based routes: `/login`, `/app`, `/app/weeks`,
  `/app/weeks/$weekId`, `/app/settings`, and the public `/sign/$token`.
- `src/server/*` — server functions, Drizzle schema, PBKDF2 auth, sessions.
  Bindings come from `cloudflare:workers` (`env.DB`, `AI_*`), so the same code
  runs against local miniflare in dev and real D1 in production.
- `src/effect/*` — the AI layer: `AiClient` (Effect service) + the refinement
  prompt. Swapping providers is a config change, not a code change.
- `src/lib/typst/*` — Typst source generation from DB rows + the WASM compile
  step, mirroring `LogBookTemplate.typ` one-to-one.
- `alchemy.run.ts` — infrastructure: `D1Database` (migrations from `drizzle/`)
  and the `TanStackStart` Worker bound to `logbook.alexanderar.com`.

## Testing

```bash
pnpm typecheck                   # tsc --noEmit

# Typst compile check: builds a sample document with the real WASM pipeline
node --experimental-strip-types scripts/compile-check.mjs

# End-to-end flow (40 checks): auth, weeks, entries, signing, lock rules, PDF
# data, SSR pages. Requires a running dev server and a FRESH database —
# wipe first, run, then re-register your account afterwards:
node scripts/e2e-flow.mjs [baseUrl]   # default http://localhost:3000
```

The E2E suite registers its own account (`alex@dev.test`), so run it against a
throwaway database, not one with real data.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the step-by-step guide. In
short:

```bash
pnpm deploy        # alchemy deploy → D1 + Worker + custom domain
```

## Troubleshooting

- **`/@id/virtual:tanstack-start-dev-client-entry` returns 500** in dev — make
  sure `@vitejs/plugin-react` is in `vite.config.ts` **after** `tanstackStart()`
  (the router plugin must transform routes before JSX).
- **Multiple dev servers fighting** — `alchemy dev` writes state under
  `.alchemy/` shared by every instance on the machine. Kill stale instances
  before starting a new one.
- **`No credentials found` when starting dev** — run `npx alchemy login` or
  export `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.
- **A resource stuck in `creating`** (e.g. `.alchemy/logbook/<stage>/<id>.json`
  after a crash) — delete that state file and restart; Alchemy will recreate it.
- **`no such table` errors** — migrations did not apply; restart
  `alchemy dev` (it applies `drizzle/` migrations on boot).
