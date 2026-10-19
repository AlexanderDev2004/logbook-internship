import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./env";
import { entries, settings, weeks, signatures } from "./schema";
import { eq, and, desc } from "drizzle-orm";
import { Effect } from "effect";
import { AiClientLayer } from "../effect/ai-service";
import { refineActivity } from "../effect/refine";
import { requireUser } from "./session";
import { resolveAiConfig } from "./settings-fns";

export const refineEntryActivity = createServerFn({ method: "POST" })
  .validator(z.object({ entryId: z.string(), text: z.string().min(1).max(2000) }))
  .handler(async ({ data }) => {
    await requireUser();
    const [row] = await db().select({ partnerName: settings.partnerName }).from(settings).limit(1);
    const layer = AiClientLayer(await resolveAiConfig());

    const refined = await Effect.runPromise(
      Effect.provide(refineActivity(data.text, { partnerName: row?.partnerName }), layer),
    );

    await db()
      .update(entries)
      .set({ activity: refined, aiRefined: true })
      .where(eq(entries.id, data.entryId));

    return { refined };
  });

export const refineWeekActivities = createServerFn({ method: "POST" })
  .validator(z.object({ weekId: z.string() }))
  .handler(async ({ data }) => {
    await requireUser();
    const [setting] = await db().select().from(settings).limit(1);
    const rows = await db()
      .select()
      .from(entries)
      .where(eq(entries.weekId, data.weekId));
    const layer = AiClientLayer(await resolveAiConfig());

    const refinedEntries: string[] = [];
    for (const row of rows) {
      const program = refineActivity(row.activity, { partnerName: setting?.partnerName });
      const refined = await Effect.runPromise(Effect.provide(program, layer));
      await db()
        .update(entries)
        .set({ activity: refined, aiRefined: true })
        .where(eq(entries.id, row.id));
      refinedEntries.push(refined);
    }
    return { count: refinedEntries.length };
  });

// ---------- weeks / entries CRUD ----------

const weekInput = z.object({ label: z.string().min(1).max(80), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export const listWeeks = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const allWeeks = await db().select().from(weeks).orderBy(weeks.startDate);
  const allEntries = await db().select().from(entries).orderBy(entries.entryDate, entries.position);
  const allSignatures = await db().select().from(signatures);
  return {
    weeks: allWeeks.map((w) => ({
      ...w,
      entryCount: allEntries.filter((e) => e.weekId === w.id).length,
      signatures: Object.fromEntries(
        allSignatures
          .filter((s) => s.weekId === w.id)
          .map((s) => [s.role, { status: s.status, signerName: s.signerName, token: s.token }]),
      ),
    })),
  };
});

export const getWeek = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await requireUser();
    const [week] = await db().select().from(weeks).where(eq(weeks.id, data.id)).limit(1);
    if (!week) return null;
    const rows = await db().select().from(entries).where(eq(entries.weekId, data.id));
    rows.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.position - b.position);
    const sigs = await db().select().from(signatures).where(eq(signatures.weekId, data.id));
    return { week, entries: rows, signatures: sigs };
  });

export const createWeek = createServerFn({ method: "POST" })
  .validator(weekInput)
  .handler(async ({ data }) => {
    await requireUser();
    const id = crypto.randomUUID();
    await db().insert(weeks).values({ id, ...data, createdAt: new Date().toISOString() });
    const roles = ["student", "field_supervisor", "academic_advisor"] as const;
    for (const role of roles) {
      await db().insert(signatures).values({
        weekId: id,
        role,
        token: crypto.randomUUID(),
        status: "pending",
      });
    }
    return { id };
  });

export const deleteWeek = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await requireUser();
    const sigs = await db().select().from(signatures).where(eq(signatures.weekId, data.id));
    if (sigs.some((s) => s.status === "signed")) {
      throw new Error("Week is signed by at least one party and cannot be deleted.");
    }
    await db().delete(weeks).where(eq(weeks.id, data.id));
    return { ok: true };
  });

const entryInput = z.object({
  weekId: z.string(),
  id: z.string().optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clockIn: z.string().regex(/^\d{2}:\d{2}$/),
  clockOut: z.string().regex(/^\d{2}:\d{2}$/),
  activity: z.string().min(1).max(2000),
});

export const saveEntry = createServerFn({ method: "POST" })
  .validator(entryInput)
  .handler(async ({ data }) => {
    await requireUser();
    await assertWeekUnlocked(data.weekId);
    if (data.id) {
      await db()
        .update(entries)
        .set({
          entryDate: data.entryDate,
          clockIn: data.clockIn,
          clockOut: data.clockOut,
          activity: data.activity,
          aiRefined: false,
        })
        .where(and(eq(entries.id, data.id), eq(entries.weekId, data.weekId)));
      return { id: data.id };
    }
    const id = crypto.randomUUID();
    const [{ n } = { n: 0 }] = await db()
      .select({ n: entries.position })
      .from(entries)
      .where(eq(entries.weekId, data.weekId))
      .orderBy(desc(entries.position))
      .limit(1);
    await db().insert(entries).values({
      id,
      weekId: data.weekId,
      entryDate: data.entryDate,
      clockIn: data.clockIn,
      clockOut: data.clockOut,
      activity: data.activity,
      position: (n ?? 0) + 1,
    });
    return { id };
  });

export const deleteEntry = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await requireUser();
    const [row] = await db().select().from(entries).where(eq(entries.id, data.id)).limit(1);
    if (row) await assertWeekUnlocked(row.weekId);
    await db().delete(entries).where(eq(entries.id, data.id));
    return { ok: true };
  });

async function assertWeekUnlocked(weekId: string) {
  const sigs = await db().select().from(signatures).where(eq(signatures.weekId, weekId));
  if (sigs.filter((s) => s.role !== "student").some((s) => s.status === "signed")) {
    throw new Error("Week is locked: it has already been signed by a supervisor or advisor.");
  }
}

// ---------- signing ----------

export const signWeek = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string(),
      signerName: z.string().min(1).max(120),
      signaturePng: z.string().min(1).max(500_000), // data url
    }),
  )
  .handler(async ({ data }) => {
    const [sig] = await db()
      .select()
      .from(signatures)
      .where(eq(signatures.token, data.token))
      .limit(1);
    if (!sig) throw new Error("Invalid signing link.");
    if (sig.status === "signed") throw new Error("This week has already been signed.");
    await db()
      .update(signatures)
      .set({
        status: "signed",
        signerName: data.signerName,
        signaturePng: data.signaturePng,
        signedAt: new Date().toISOString(),
      })
      .where(eq(signatures.token, data.token));
    return { ok: true, weekId: sig.weekId, role: sig.role };
  });

export const getSignRequest = createServerFn({ method: "GET" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }) => {
    const [sig] = await db()
      .select()
      .from(signatures)
      .where(eq(signatures.token, data.token))
      .limit(1);
    if (!sig) return null;
    const [week] = await db().select().from(weeks).where(eq(weeks.id, sig.weekId)).limit(1);
    const setting = await db().select().from(settings).limit(1);
    const weekEntries = await db()
      .select()
      .from(entries)
      .where(eq(entries.weekId, sig.weekId));
    weekEntries.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.position - b.position);
    const allSigs = await db().select().from(signatures).where(eq(signatures.weekId, sig.weekId));
    // Never expose tokens here: anyone holding one role's link must not be able
    // to sign as another role. Status and signer name are safe to display.
    const byRole = Object.fromEntries(
      allSigs.map((s) => [
        s.role,
        { role: s.role, status: s.status, signerName: s.signerName, signedAt: s.signedAt },
      ]),
    ) as Record<string, typeof sig>;
    return {
      role: sig.role,
      status: sig.status,
      week,
      entries: weekEntries,
      setting: setting[0]
        ? {
            studentName: setting[0].studentName,
            studentNim: setting[0].studentNim,
            studyProgram: setting[0].studyProgram,
            partnerName: setting[0].partnerName,
            fieldSupervisorName: setting[0].fieldSupervisorName,
            academicAdvisorName: setting[0].academicAdvisorName,
            studentSignaturePng: setting[0].studentSignaturePng,
          }
        : null,
      signatures: byRole,
    };
  });

// Public data for the PDF view shared with signers
export const getPdfData = createServerFn({ method: "POST" })
  .validator(z.object({ weekIds: z.array(z.string()).min(1) }))
  .handler(async ({ data }) => {
    await requireUser();
    const [setting] = await db().select().from(settings).limit(1);
    if (!setting) throw new Error("Settings not found");
    const result = [];
    for (const weekId of data.weekIds) {
      const [week] = await db().select().from(weeks).where(eq(weeks.id, weekId)).limit(1);
      if (!week) continue;
      const rows = await db().select().from(entries).where(eq(entries.weekId, weekId));
      rows.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.position - b.position);
      const sigs = await db().select().from(signatures).where(eq(signatures.weekId, weekId));
      result.push({
        label: week.label,
        entries: rows.map((e) => ({
          entryDate: e.entryDate,
          clockIn: e.clockIn,
          clockOut: e.clockOut,
          activity: e.activity,
        })),
        signatures: Object.fromEntries(
          sigs.map((s) => [
            s.role,
            { signerName: s.signerName, signaturePng: s.signaturePng, status: s.status },
          ]),
        ),
      });
    }
    return {
      settings: {
        studentName: setting.studentName,
        studentNim: setting.studentNim,
        studyProgram: setting.studyProgram,
        partnerName: setting.partnerName,
        logoPng: setting.logoPng,
        institutionLines: JSON.parse(setting.institutionLines) as string[],
        subLines: JSON.parse(setting.subLines) as string[],
        titleLines: JSON.parse(setting.titleLines) as string[],
        fontHeading: setting.fontHeading as "Times New Roman" | "Calibri",
        fontBody: setting.fontBody as "Times New Roman" | "Calibri",
        fieldSupervisorName: setting.fieldSupervisorName,
        academicAdvisorName: setting.academicAdvisorName,
        studentSignaturePng: setting.studentSignaturePng,
      },
      weeks: result,
    };
  });

export const resetSignature = createServerFn({ method: "POST" })
  .validator(z.object({ weekId: z.string(), role: z.string() }))
  .handler(async ({ data }) => {
    await requireUser();
    if (data.role === "student") {
      const other = await db()
        .select()
        .from(signatures)
        .where(and(eq(signatures.weekId, data.weekId)));
      if (other.filter((s) => s.role !== "student").some((s) => s.status === "signed")) {
        throw new Error("Cannot reset the student signature once supervisors have signed.");
      }
    }
    await db()
      .update(signatures)
      .set({ status: "pending", signerName: null, signaturePng: null, signedAt: null })
      .where(and(eq(signatures.weekId, data.weekId), eq(signatures.role, data.role)));
    return { ok: true };
  });

