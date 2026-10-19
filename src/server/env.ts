// Server-only access to Cloudflare bindings.
// This module must only be imported from inside createServerFn handlers.
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export const bindings = env;

export const db = () => drizzle(env.DB, { schema });
