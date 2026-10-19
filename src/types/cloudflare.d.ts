// Type declarations for Cloudflare-specific modules and bindings.

interface Bindings {
  DB: D1Database;
  AI_API_KEY: string;
  AI_BASE_URL: string;
  AI_MODEL: string;
}

declare module "cloudflare:workers" {
  export const env: Bindings;
}
