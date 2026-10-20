// Generates Typst source that reproduces the original LogBookTemplate.typ
// layout: Polinema-style header, student info table, weekly activities table
// and the three-party signature block.

export interface TypstEntry {
  entryDate: string; // yyyy-mm-dd
  clockIn: string; // HH:MM
  clockOut: string; // HH:MM
  activity: string;
}

export interface TypstSignatures {
  student?: { signerName?: string | null; signaturePng?: string | null } | undefined;
  field_supervisor?: { signerName?: string | null; signaturePng?: string | null } | undefined;
  academic_advisor?: { signerName?: string | null; signaturePng?: string | null } | undefined;
}

export interface TypstSettings {
  studentName: string;
  studentNim: string;
  studyProgram: string;
  partnerName: string;
  logoPng: string; // data url or public path
  institutionLines: string[]; // [0,1] small-caps 14pt, [2] normal, [3] bold
  subLines: string[];
  titleLines: string[];
  fontHeading: "Times New Roman" | "Calibri";
  fontBody: "Times New Roman" | "Calibri";
  fieldSupervisorName: string;
  academicAdvisorName: string;
  studentSignaturePng?: string | null;
  /** Optional company stamp shown beside the field supervisor block. */
  companyStampPng?: string | null;
}

/** Client-tweakable layout of the signature block (preview panel edits this). */
export interface SignatureLayout {
  /** Height of every signature image, in em. Default 4. */
  sigHeightEm: number;
  /** Height of the company stamp image, in em. Default 6. */
  stampHeightEm: number;
  // Offsets are displacements from the element's natural column position,
  // positive X = right, positive Y = down (negative Y = up). In em.
  // Scale multiplies the element's base height; rotation is in degrees.
  stampOffsetXEm: number;
  stampOffsetYEm: number;
  stampScale: number;
  stampRot: number;
  studentOffsetXEm: number;
  studentOffsetYEm: number;
  studentScale: number;
  studentRot: number;
  fieldOffsetXEm: number;
  fieldOffsetYEm: number;
  fieldScale: number;
  fieldRot: number;
  advisorOffsetXEm: number;
  advisorOffsetYEm: number;
  advisorScale: number;
  advisorRot: number;
}

export const DEFAULT_SIGNATURE_LAYOUT: SignatureLayout = {
  sigHeightEm: 4,
  stampHeightEm: 6,
  stampOffsetXEm: 4,
  stampOffsetYEm: -4,
  stampScale: 1,
  stampRot: 0,
  studentOffsetXEm: 0,
  studentOffsetYEm: 0,
  studentScale: 1,
  studentRot: 0,
  fieldOffsetXEm: 0,
  fieldOffsetYEm: 0,
  fieldScale: 1,
  fieldRot: 0,
  advisorOffsetXEm: 0,
  advisorOffsetYEm: 0,
  advisorScale: 1,
  advisorRot: 0,
};

export interface TypstWeek {
  entries: TypstEntry[];
  signatures?: TypstSignatures;
}

export interface GeneratedTyp {
  source: string;
  files: Record<string, Uint8Array>; // virtual files mapped into the compiler
}

const FONT_MAP: Record<string, string> = {
  // The bundled TTF (public/fonts/LiberationSerif-*.ttf) registers its
  // family as "TypoPRO Liberation Serif"; Carlito's is plain "Carlito".
  "Times New Roman": "TypoPRO Liberation Serif",
  Calibri: "Carlito",
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Parse yyyy-mm-dd without timezone surprises.
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function formatDateTypst(iso: string): string {
  const dt = parseDate(iso);
  const day = dt.getDate();
  const month = dt.getMonth() + 1;
  return `${WEEKDAYS[dt.getDay()]}, ${day}/${month}/${dt.getFullYear()}`;
}

export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  // The original template renders datetime.display("[hour]:[minute]"),
  // which zero-pads both parts ("09:00").
  return `${String(Number(h)).padStart(2, "0")}:${m.padStart(2, "0")}`;
}

// Escape Typst markup special characters.
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/([#$@*_[\]`~<>\u00a0])/g, "\\$1")
    .replace(/\r?\n/g, "\\\\ ");
}

export function decodeDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function resolveImageBytes(
  ref: string | null | undefined,
): Promise<Uint8Array | null> {
  if (!ref) return null;
  if (ref.startsWith("data:")) return decodeDataUrl(ref);
  try {
    const res = await fetch(ref);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

const t = (n: number) => " ".repeat(n);

/** Format a layout number for Typst source (trim float noise from sliders). */
const num = (n: number) => String(Math.round(n * 100) / 100);

export async function generateLogBookTyp(
  settings: TypstSettings,
  weeks: TypstWeek[],
  layout: SignatureLayout = DEFAULT_SIGNATURE_LAYOUT,
): Promise<GeneratedTyp> {
  const files: Record<string, Uint8Array> = {};

  // ---- virtual images ----
  const logoBytes = await resolveImageBytes(settings.logoPng);
  const hasLogo = logoBytes !== null;
  if (hasLogo) files["/img/logo.png"] = logoBytes!;

  // Optional company stamp for the field supervisor column.
  const stampBytes = await resolveImageBytes(settings.companyStampPng);
  const hasStamp = stampBytes !== null;
  if (hasStamp) files["/img/stamp.png"] = stampBytes!;

  // Per-week signature images (week signatures take precedence over the
  // stored student signature in settings).
  const resolveSig = async (
    role: string,
    wi: number,
    ref?: string | null,
  ): Promise<string | null> => {
    const bytes = await resolveImageBytes(ref ?? null);
    if (!bytes) return null;
    const path = `/img/sig_${wi}_${role}.png`;
    files[path] = bytes;
    return path;
  };

  const sigPaths: Array<Record<string, string | null>> = await Promise.all(
    weeks.map(async (week, wi) => ({
      student: await resolveSig(
        "student",
        wi,
        week.signatures?.student?.signaturePng ??
          (wi === 0 ? settings.studentSignaturePng : null),
      ),
      field_supervisor: await resolveSig(
        "field_supervisor",
        wi,
        week.signatures?.field_supervisor?.signaturePng,
      ),
      academic_advisor: await resolveSig(
        "academic_advisor",
        wi,
        week.signatures?.academic_advisor?.signaturePng,
      ),
    })),
  );

  const fontHeading = FONT_MAP[settings.fontHeading] ?? settings.fontHeading;
  const fontBody = FONT_MAP[settings.fontBody] ?? settings.fontBody;

  const out: string[] = [];
  const w = (s = "") => out.push(s);

  // ---- header ----
  w("#set page(margin: 1in)");
  w(`#set text(size: 12pt, font: "${fontHeading}", hyphenate: false)`);
  w("");
  w("#box()[");
  w(`  ${t(2)}#box()[`);
  if (hasLogo) w(`    #image("/img/logo.png", height: 3.17cm)`);
  w("  ]");
  w("  #box(width: 1fr)[");
  w("    #align(center + horizon)[");
  const [l0 = "", l1 = "", l2 = "", l3 = ""] = settings.institutionLines;
  w(`      #text(size: 14pt)[`);
  // A single "\" at end of line is a Typst line break, like the original template.
  w(`        ${esc(l0)}\\`);
  w(`        ${esc(l1)}\\`);
  w("      ]");
  w(`      ${esc(l2)}\\`);
  w(`      *${esc(l3)}*\\`);
  w("      #text(size: 9pt)[");
  settings.subLines.forEach((line) => {
    w(`        ${esc(line)}\\`);
  });
  w("      ]");
  w("    ]");
  w("  ]");
  w("]");
  w("");
  w("#box()[");
  w("  #line(length: 100%, stroke: 2.25pt)");
  w("  #text(size: 11pt)[]");
  w("]");
  w("");
  w("#align(center)[");
  settings.titleLines.forEach((line) => {
    w(`  *${esc(line)}*\\`);
  });
  w("]");
  w("");

  // ---- student info table ----
  w(`#set text(size: 11pt, font: "${fontHeading}")`);
  w("#box(inset: 0pt, outset: 0pt)[");
  w("  #table(");
  w("    columns: (1fr, 1fr),");
  w("    rows: 0.63cm,");
  w("    inset: (x: 0pt),");
  w("    stroke: gray + 0.75pt,");
  w(`    [*Nama*], [*: ${esc(settings.studentName)}*],`);
  w(`    [*NIM*], [*: ${esc(settings.studentNim)}*],`);
  w(`    [*Program Studi*], [*: ${esc(settings.studyProgram)}*],`);
  w(`    [*Nama Mitra*], [*: ${esc(settings.partnerName)}*],`);
  w("  )");
  w("]");
  w("");

  weeks.forEach((week, wi) => {
    if (wi > 0) {
      w("#pagebreak()");
      w("");
    }

    // ---- activities table ----
    w(`#set text(font: "${fontBody}", size: 11pt)`);
    w("#box(inset: 0pt, outset: 0pt)[");
    w("  #table(");
    w("    align: center + horizon,");
    w("    inset: 2.5pt,");
    w("    stroke: 0.5pt,");
    w("    columns: (1fr, 2.75cm, 2.5cm, 7.75cm),");
    w("    rows: (auto, 1.6cm),");
    w("    table.header(");
    w("      table.cell(fill: gray)[*Hari, Tanggal*],");
    w("      table.cell(fill: gray)[*Jam Masuk*],");
    w("      table.cell(fill: gray)[*Jam Pulang*],");
    w("      table.cell(fill: gray)[*Kegiatan*],");
    w("    ),");
    for (const item of week.entries) {
      w(`    [${esc(formatDateTypst(item.entryDate))}],`);
      w(`    [${esc(formatClock(item.clockIn))}],`);
      w(`    [${esc(formatClock(item.clockOut))}],`);
      w(`    table.cell(align: left + horizon)[${esc(item.activity)}],`);
    }
    w("  )");
    w("]");

    // ---- signature block (kept together on one page) ----
    w("  #v(1em)");
    w("  #block(breakable: false)[");
    w("    #grid(");
    w("      columns: (3fr, 4fr, 3fr),");
    w("      gutter: 0pt,");
    w("      [], [], [");
    w("        Mahasiswa,");
    const paths = sigPaths[wi];
    const sigH = num(layout.sigHeightEm);
    const stampX = num(layout.stampOffsetXEm);
    const stampY = num(layout.stampOffsetYEm);
    // Signature image with box-model placement: offset (em), scale, rotation.
    const sigImg = (path: string, x: number, y: number, scale: number, rot: number) => {
      const h = num(layout.sigHeightEm * scale);
      const img = `#image("${path}", height: ${h}em)`;
      const content = rot ? `#rotate(${num(rot)}deg)[${img}]` : img;
      return x || y || rot || scale !== 1
        ? `#box(width: 100%, inset: (left: ${num(x)}em, top: ${num(y)}em))[${content}]`
        : img;
    };
    if (paths.student) {
      w(`        ${sigImg(paths.student, layout.studentOffsetXEm, layout.studentOffsetYEm, layout.studentScale, layout.studentRot)}`);
    } else {
      w(`        #v(${sigH}em)`);
    }
    w(`        ${esc(week.signatures?.student?.signerName || settings.studentName)}`);
    w("      ],");
    w("      [Mengetahui,], [],");
    w("      [");
    w("        Pembimbing Lapangan,");
    if (paths.field_supervisor) {
      w(`        ${sigImg(paths.field_supervisor, layout.fieldOffsetXEm, layout.fieldOffsetYEm, layout.fieldScale, layout.fieldRot)}`);
    } else {
      w(`        #v(${sigH}em)`);
    }
    if (hasStamp) {
      // Stamp overlaps the signature area, like a stamped paper document.
      const stampImg = `#image("/img/stamp.png", height: ${num(layout.stampHeightEm * layout.stampScale)}em)`;
      const stampContent = layout.stampRot ? `#rotate(${num(layout.stampRot)}deg)[${stampImg}]` : stampImg;
      w(`        #box(width: 100%, inset: (left: ${stampX}em, top: ${stampY}em))[${stampContent}]`);
    }
    w(
      `        ${esc(week.signatures?.field_supervisor?.signerName || settings.fieldSupervisorName)}`,
    );
    w("      ],");
    w("      [], [");
    w("        Dosen Pembimbing,");
    if (paths.academic_advisor) {
      w(`        ${sigImg(paths.academic_advisor, layout.advisorOffsetXEm, layout.advisorOffsetYEm, layout.advisorScale, layout.advisorRot)}`);
    } else {
      w(`        #v(${sigH}em)`);
    }
    w(`        ${esc(week.signatures?.academic_advisor?.signerName || settings.academicAdvisorName)}`);
    w("      ],");
    w("    )");
    w("  ]");
    w("");
  });

  return { source: out.join("\n"), files };
}
