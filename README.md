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
- **AI text refinement** — one click per entry or per week; runs against any
  OpenAI-compatible API and rewrites activities into concise professional
  Indonesian without inventing facts. The API key stays server-side.
- **Three-step signing** — student, field supervisor (Pembimbing Lapangan),
  academic advisor (Dosen Pembimbing). Each party signs via a private,
  single-use link; signatures are drawn in the browser and embedded into the
  PDF. Weeks lock once a supervisor/advisor has signed.
- **PDF export** — compiled in the browser with the Typst WASM compiler using
  bundled metric-compatible fonts (Liberation Serif ≈ Times New Roman, Carlito
  ≈ Calibri). Export a single week or everything at once.
- **Customizable** — letterhead logo and lines, titles, fonts, student
  identity, supervisor names, your stored signature.

## Getting started

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in AI_API_KEY etc.
npm run dev                      # alchemy dev: provisions local D1 + vite
```

Open http://localhost:3000, create the owner account (first run only), then:

1. Fill in identity + letterhead under **Settings**.
2. Create a **week** per log book page and add daily entries.
3. Hit **Refine with AI**, sign as the student, copy the two signing links to
   your supervisors, and download the signed PDF.

## Deployment (Cloudflare)

Requirements: a Cloudflare account with the `alexanderar.com` zone, and an API
token with Workers + D1 + DNS permissions.

```bash
npm run deploy        # = alchemy deploy
```

Alchemy provisions the D1 database, applies `drizzle/` migrations, builds the
worker and binds the custom domain `logbook.alexanderar.com`.

Secrets (set as environment variables when deploying, or persist them in your
shell profile):

| Variable         | Purpose                                     | Default                     |
| ---------------- | ------------------------------------------- | --------------------------- |
| `AI_API_KEY`     | LLM API key (server-side only)              | — (required for AI)         |
| `AI_BASE_URL`    | OpenAI-compatible endpoint                  | `https://api.openai.com/v1` |
| `AI_MODEL`       | Chat model                                  | `gpt-4o-mini`               |
| `ALCHEMY_PASSWORD` | Encrypts secrets in Alchemy state files   | —                           |

## Development notes

- `src/lib/typst/generate.ts` builds the Typst source from DB rows; it mirrors
  `LogBookTemplate.typ` from the original folder one-to-one.
- `scripts/compile-check.mjs` compiles a sample document in Node with the same
  WASM pipeline the browser uses:
  `node --experimental-strip-types scripts/compile-check.mjs`
- Server-only code lives in `src/server/*` and reaches bindings through
  `cloudflare:workers` (`env.DB`, `AI_*`), so it works identically in local
  miniflare and production.
