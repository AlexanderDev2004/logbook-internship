import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./env";
import { settings } from "./schema";
import { eq } from "drizzle-orm";
import { requireUser } from "./session";

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
  };
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
