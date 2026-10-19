import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";


export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: text("expires_at").notNull(),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(), // always 1
  // student identity shown on every log book page
  studentName: text("student_name").notNull(),
  studentNim: text("student_nim").notNull(),
  studyProgram: text("study_program").notNull(),
  partnerName: text("partner_name").notNull(),
  // customization
  logoPng: text("logo_png").notNull(), // base64 data url
  institutionLines: text("institution_lines").notNull(), // JSON array of header lines
  subLines: text("sub_lines").notNull(), // JSON array of small address lines
  titleLines: text("title_lines").notNull(), // JSON array of title lines
  fontHeading: text("font_heading").notNull().default("Times New Roman"),
  fontBody: text("font_body").notNull().default("Calibri"),
  // signature roles metadata (names shown on the PDF)
  fieldSupervisorName: text("field_supervisor_name").notNull(),
  academicAdvisorName: text("academic_advisor_name").notNull(),
  studentSignaturePng: text("student_signature_png"), // base64 data url
  // Per-user AI configuration (Settings → AI). The key is stored server-side
  // and never returned to the client; env bindings are the fallback.
  aiApiKey: text("ai_api_key"),
  aiBaseUrl: text("ai_base_url"),
  aiModel: text("ai_model"),
  updatedAt: text("updated_at").notNull(),
});

export const weeks = sqliteTable("weeks", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  startDate: text("start_date").notNull(), // ISO yyyy-mm-dd
  createdAt: text("created_at").notNull(),
});

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  weekId: text("week_id")
    .notNull()
    .references(() => weeks.id, { onDelete: "cascade" }),
  entryDate: text("entry_date").notNull(), // ISO yyyy-mm-dd
  clockIn: text("clock_in").notNull(), // HH:MM
  clockOut: text("clock_out").notNull(), // HH:MM
  activity: text("activity").notNull(),
  aiRefined: integer("ai_refined", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull().default(0),
});

// One signature request per role per week. The token is a shareable link that
// lets the signee sign without an account.
export const signatures = sqliteTable(
  "signatures",
  {
    weekId: text("week_id")
      .notNull()
      .references(() => weeks.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // student | field_supervisor | academic_advisor
    token: text("token").notNull().unique(),
    status: text("status").notNull().default("pending"), // pending | signed
    signerName: text("signer_name"),
    signaturePng: text("signature_png"), // base64 data url
    signedAt: text("signed_at"),
  },
  (t) => [primaryKey({ columns: [t.weekId, t.role] })],
);
