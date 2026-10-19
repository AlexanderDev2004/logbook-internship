import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./env";
import { users, settings } from "./schema";
import { hashPassword, randomToken, constantTimeEqual } from "./crypto";
import {
  createSession,
  destroySession,
  sessionCookieValue,
  clearedSessionCookieValue,
} from "./session";
import { eq, sql } from "drizzle-orm";

export const hasAccount = createServerFn({ method: "GET" }).handler(async () => {
  const [{ n }] = await db()
    .select({ n: sql<number>`count(*)` })
    .from(users);
  return n > 0;
});

const credentials = z.object({ identifier: z.string().min(1).max(200), password: z.string().min(1).max(200) });

// Resolve the account from an email address or a student NIM. Email lookups go
// through users.email; a NIM is matched against the seeded settings row, and
// the owner account is the only user on the instance (register enforces that).
async function resolveUserByIdentifier(identifier: string) {
  const ident = identifier.trim();
  if (ident.includes("@")) {
    const [user] = await db()
      .select()
      .from(users)
      .where(eq(users.email, ident.toLowerCase()))
      .limit(1);
    return user ?? null;
  }
  const [matched] = await db()
    .select({ n: sql<number>`count(*)` })
    .from(settings)
    .where(eq(settings.studentNim, ident));
  if (!matched || matched.n === 0) return null;
  const [user] = await db().select().from(users).limit(1);
  return user ?? null;
}

export const register = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8).max(200),
      })
      .extend({
      name: z.string().min(1).max(120),
      studentName: z.string().min(1),
      studentNim: z.string().min(1),
      studyProgram: z.string().min(1),
      partnerName: z.string().min(1),
      fieldSupervisorName: z.string().min(1),
      academicAdvisorName: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const [{ n }] = await db().select({ n: sql<number>`count(*)` }).from(users);
    if (n > 0) throw new Error("An account already exists on this instance.");

    const salt = randomToken(16);
    const passwordHash = await hashPassword(data.password, salt);
    const userId = crypto.randomUUID();
    await db().insert(users).values({
      id: userId,
      email: data.email.toLowerCase(),
      name: data.name,
      passwordHash,
      salt,
      createdAt: new Date().toISOString(),
    });

    // Seed default settings modeled on the original Polinema log book.
    await db().insert(settings).values({
      id: 1,
      studentName: data.studentName,
      studentNim: data.studentNim,
      studyProgram: data.studyProgram,
      partnerName: data.partnerName,
      logoPng: "/img/polinema-header-logo.png",
      institutionLines: JSON.stringify([
        "KEMENTERIAN PENDIDIKAN TINGGI, SAINS,",
        "DAN TEKNOLOGI",
        "POLITEKNIK NEGERI MALANG",
        "JURUSAN TEKNOLOGI INFORMASI",
      ]),
      subLines: JSON.stringify([
        "Jalan Soekarno Hatta Nomor 9 Jatimulyo, Lowokwaru, Malang 65141",
        "Telepon (0341) 404424, 404425, Faksimile (0341) 404420",
        "Laman www.polinema.ac.id",
      ]),
      titleLines: JSON.stringify(["LOG BOOK KEGIATAN", "PROGRAM MAGANG KAMPUS MERDEKA"]),
      fontHeading: "Times New Roman",
      fontBody: "Calibri",
      fieldSupervisorName: data.fieldSupervisorName,
      academicAdvisorName: data.academicAdvisorName,
      studentSignaturePng: null,
      updatedAt: new Date().toISOString(),
    });

    const token = await createSession(userId);
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("set-cookie", sessionCookieValue(token));
    return { ok: true };
  });

export const login = createServerFn({ method: "POST" })
  .validator(credentials)
  .handler(async ({ data }) => {
    const user = await resolveUserByIdentifier(data.identifier);
    if (!user) throw new Error("Invalid email/NIM or password.");
    const hash = await hashPassword(data.password, user.salt);
    if (!constantTimeEqual(hash, user.passwordHash)) {
      throw new Error("Invalid email/NIM or password.");
    }
    const token = await createSession(user.id);
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("set-cookie", sessionCookieValue(token));
    return { ok: true };
  });

// Self-service reset for the single-owner instance: after confirming in the UI,
// the password is set back to the student NIM on record. The new password is
// returned so the login page can show it once.
export const resetPassword = createServerFn({ method: "POST" })
  .validator(z.object({ identifier: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    const user = await resolveUserByIdentifier(data.identifier);
    if (!user) throw new Error("No account found for that email or NIM.");
    const [s] = await db().select().from(settings).limit(1);
    const nim = s?.studentNim?.trim();
    if (!nim) throw new Error("No NIM is on record; password cannot be reset.");
    const salt = randomToken(16);
    const passwordHash = await hashPassword(nim, salt);
    await db()
      .update(users)
      .set({ passwordHash, salt })
      .where(eq(users.id, user.id));
    await destroySession();
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("set-cookie", clearedSessionCookieValue());
    return { ok: true, nim };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  await destroySession();
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("set-cookie", clearedSessionCookieValue());
  return { ok: true };
});

// Convenience: get the authenticated user from routes
export const getSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { requireUser } = await import("./session");
    return await requireUser();
  } catch {
    return null;
  }
});
