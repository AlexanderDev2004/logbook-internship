// Client-only shim for "cloudflare:workers".
//
// Server-function modules (weeks.ts, settings-fns.ts, auth.ts, session.ts)
// statically import ./env, which imports "cloudflare:workers". TanStack Start
// strips the handler bodies from the client bundle but keeps module-level
// imports, so without this shim the browser would try to fetch
// "cloudflare:workers" as a script (404 + CORS). The vite config aliases the
// import to this empty stub in the client environment only; the real module
// is provided by the workerd runtime in the SSR/worker environment.
export const env = {} as unknown as Record<string, unknown>;
