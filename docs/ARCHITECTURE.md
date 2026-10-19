# Architecture

How the app is put together, from a click to a signed PDF.

## Stack

| Layer          | Choice                                             |
| -------------- | -------------------------------------------------- |
| Full-stack SSR | TanStack Start (Vite plugin, React 19)             |
| UI             | TailwindCSS v4 + hand-written shadcn-style components (`src/components/ui`) |
| Database       | Cloudflare D1 (SQLite) via Drizzle ORM             |
| Runtime        | Cloudflare Workers, provisioned by Alchemy         |
| AI             | Effect service over any [OI]-compatible chat API   |
| PDF            | Typst compiled to WASM **in the browser**          |

## Request flow

```text
┌──────────────────────────────────────────────────────────────────────┐
│ browser                                                              │
│   routes/*            app.weeks, app.weeks.$weekId, app.settings,    │
│                       sign.$token (public), login, index             │
│        │  createServerFn calls (seroval over /_serverFn/<id>)        │
└────────┼─────────────────────────────────────────────────────────────┘
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Worker (src/server/*)                                                │
│   auth.ts        register/login/logout, PBKDF2, session cookie       │
│   session.ts     requireUser() guard, cookie read/write              │
│   weeks.ts       weeks/entries CRUD, signing, lock rules, PDF data   │
│   settings-fns   identity/letterhead/fonts/signature                 │
│        │  db() ── Drizzle ──► D1                                     │
│        │  bindings ── cloudflare:workers env (DB, AI_API_KEY, …)     │
└──────────────────────────────────────────────────────────────────────┘
```

- **Server functions** are `createServerFn()` handlers in `src/server/*`,
  imported directly by routes. On the client they become RPC stubs; on the
  server they run with access to Worker bindings. Each mutation calls
  `requireUser()`; the sign endpoints are the only ones that accept an
  unauthenticated caller, and only with a valid week token.
- **The database is small and strict**: `users`, `sessions`, a single-row
  `settings` (id = 1) holding the letterhead JSON, `weeks`, `entries`, and one
  `signatures` row per `(week, role)` with a random `token` for the shareable
  signing link. Schema lives in `src/server/schema.ts`; migrations in
  `drizzle/` (apply on `alchemy dev` boot, and on deploy).

## Signing state machine

Each week has three signature roles — `student`, `field_supervisor`,
`academic_advisor` — starting `pending` with a random token.

```text
pending ──(POST /sign/<token> with name + drawn PNG)──► signed
   ▲                                                     │
   └────────── owner resets via resetSignature ──────────┘

Lock rules:
- entries are editable until field_supervisor OR academic_advisor signs
- student signature cannot be reset while a supervisor/advisor is signed
- a fully or partially signed week cannot be deleted
- getSignRequest never returns other roles' tokens
```

Signatures are drawn on a `<canvas>` (`src/components/SignatureCanvas.tsx`),
trimmed to content and stored as PNG data URLs on the signature row.

## PDF pipeline

1. `getPdfData` assembles the template payload: settings + per-week entries +
   per-week signature PNGs.
2. `src/lib/typst/generate.ts` renders Typst source that mirrors the original
   `LogBookTemplate.typ` (header box with logo `height: 3.17cm`, ministry lines
   at 14pt, 2.25pt rule, title, info table, activities table with gray-filled
   header, signature grid `columns: (3fr, 2fr, 4fr)` inside
   `block(breakable: false)`). All user text passes through an escape function;
   signature images become shadow files (`/img/sig_<week>_<role>.png`).
3. `src/lib/typst/compile.ts` feeds the source plus bundled fonts into the
   Typst WASM compiler **in the browser** and returns PDF bytes, which are
   downloaded as `LogBook_<label>.pdf`.

Fonts: Times New Roman → Liberation Serif, Calibri → Carlito (metric
compatible, bundled in `public/fonts/`). The mapping keeps the document
identical in width to the original Word/Typst output without shipping
proprietary fonts.

## AI refinement

`src/effect/ai-service.ts` defines `AiClient` as an Effect `Context.Tag` with
`AiClientLayer(config)` providing a `chat()` that POSTs to
`<AI_BASE_URL>/chat/completions` and decodes the response with an Effect
Schema. `src/effect/refine.ts` wraps it in `refineActivity` with a system
prompt that rewrites one activity into concise professional Indonesian without
inventing facts. Server functions `refineEntryActivity` and
`refineWeekActivities` run the effect via `Effect.runPromise` after
`requireUser()`, then persist the refined text with `aiRefined = true`.

The key never reaches the client: `AI_API_KEY` is a Worker binding, and the
refinement runs server-side. Any [OI]-compatible provider works by changing
`AI_BASE_URL` / `AI_MODEL` bindings.
