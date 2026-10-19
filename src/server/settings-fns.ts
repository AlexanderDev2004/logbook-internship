import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db, bindings } from "./env";
import { settings } from "./schema";
import { eq } from "drizzle-orm";
import { requireUser } from "./session";
import { Effect } from "effect";
import { AiClientLayer } from "../effect/ai-service";
import { refineActivity } from "../effect/refine";

const stringArray = z.array(z.string().max(200)).max(10);

const settingsInput = z.object({
  studentName: z.string().min(1).max(120),
  studentNim: z.string().min(1).max(40),
  studyProgram: z.string().min(1).max(120),
  partnerName: z.string().min(1).max(160),
  logoPng: z.string().max(500_000),
  institutionLines: stringArray,
  subLines: stringArray,
  titleLines: stringArray,
  fontHeading: z.enum(["Times New Roman", "Calibri"]),
  fontBody: z.enum(["Times New Roman", "Calibri"]),
  fieldSupervisorName: z.string().min(1).max(120),
  academicAdvisorName: z.string().min(1).max(120),
  studentSignaturePng: z.string().max(500_000).nullable(),
});

const fonts = ["Times New Roman", "Calibri"] as const;
type Font = (typeof fonts)[number];
const toFont = (value: string, fallback: Font): Font =>
  (fonts as readonly string[]).includes(value) ? (value as Font) : fallback;

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const [row] = await db().select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (!row) return null;
  return {
    ...row,
    fontHeading: toFont(row.fontHeading, "Times New Roman"),
    fontBody: toFont(row.fontBody, "Calibri"),
    institutionLines: JSON.parse(row.institutionLines) as string[],
    subLines: JSON.parse(row.subLines) as string[],
    titleLines: JSON.parse(row.titleLines) as string[],
    // The AI key never leaves the server; the UI only learns that one exists.
    aiApiKey: undefined,
    hasAiKey: row.aiApiKey !== null && row.aiApiKey !== "",
  };
});

// ---------- AI configuration (Settings → AI) ----------

const aiInput = z.object({
  baseUrl: z.string().url().max(300),
  model: z.string().min(1).max(120),
  // Empty string = keep the stored key; null = remove it.
  apiKey: z.string().max(300).nullable(),
});

export const saveAiConfig = createServerFn({ method: "POST" })
  .validator(aiInput)
  .handler(async ({ data }) => {
    await requireUser();
    await db()
      .update(settings)
      .set({
        aiBaseUrl: data.baseUrl,
        aiModel: data.model,
        ...(data.apiKey === null
          ? { aiApiKey: null }
          : data.apiKey === ""
            ? {}
            : { aiApiKey: data.apiKey }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(settings.id, 1));
    return { ok: true };
  });

// Resolves the AI config the refinement actually uses: per-user settings first,
// then the deployment bindings as fallback.
export async function resolveAiConfig(): Promise<{
  apiKey: string;
  baseUrl: string;
  model: string;
  source: "settings" | "env";
}> {
  const [row] = await db()
    .select({ aiApiKey: settings.aiApiKey, aiBaseUrl: settings.aiBaseUrl, aiModel: settings.aiModel })
    .from(settings)
    .limit(1);
  const apiKey = row?.aiApiKey || bindings.AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No AI API key configured. Set it in Settings → AI (or via the AI_API_KEY binding).",
    );
  }
  return {
    apiKey,
    baseUrl: row?.aiBaseUrl || (bindings.AI_BASE_URL as string | undefined) || "https://api.openai.com/v1",
    model: row?.aiModel || (bindings.AI_MODEL as string | undefined) || "gpt-4o-mini",
    source: row?.aiApiKey ? "settings" : "env",
  };
}

export const testAiConnection = createServerFn({ method: "POST" }).handler(async () => {
  await requireUser();
  const cfg = await resolveAiConfig();
  const layer = AiClientLayer({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model });
  const reply = await Effect.runPromise(
    Effect.provide(
      refineActivity("uji koneksi, balas singkat: siap", { partnerName: undefined }),
      layer,
    ).pipe(Effect.timeout("30 seconds")),
  );
  return { ok: true, model: cfg.model, source: cfg.source, sample: reply.slice(0, 80) };
});

export const listAiModels = createServerFn({ method: "POST" }).handler(async () => {
  await requireUser();
  const cfg = await resolveAiConfig();
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/models`, {
    headers: { authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Model list request failed (${res.status}). You can still type the model id manually.`);
  }
  const json = (await res.json()) as { data?: Array<{ id?: string }> };
  const models = (json.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string")
    .sort();
  return { models };
});

export const updateSettings = createServerFn({ method: "POST" })
  .validator(settingsInput)
  .handler(async ({ data }) => {
    await requireUser();
    await db()
      .insert(settings)
      .values({
        id: 1,
        ...data,
        institutionLines: JSON.stringify(data.institutionLines),
        subLines: JSON.stringify(data.subLines),
        titleLines: JSON.stringify(data.titleLines),
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: settings.id,
        set: {
          ...data,
          institutionLines: JSON.stringify(data.institutionLines),
          subLines: JSON.stringify(data.subLines),
          titleLines: JSON.stringify(data.titleLines),
          updatedAt: new Date().toISOString(),
        },
      });
    return { ok: true };
  });

export const saveStudentSignature = createServerFn({ method: "POST" })
  .validator(z.object({ signaturePng: z.string().max(500_000).nullable() }))
  .handler(async ({ data }) => {
    await requireUser();
    await db()
      .update(settings)
      .set({ studentSignaturePng: data.signaturePng, updatedAt: new Date().toISOString() })
      .where(eq(settings.id, 1));
    return { ok: true };
  });
