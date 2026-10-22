/**
 * Parser for DERMAGA JTI (jti.polinema.ac.id/dermaga) attendance/activity
 * tables. DERMAGA has no public API and renders its monitoring table
 * server-side, so the import flow is "copy the page (or its HTML) and paste
 * it here". The parser is deliberately tolerant: DERMAGA's exact markup may
 * change, so rows are recognized by shape (a date, optionally two clock
 * times, free text) rather than by CSS class.
 */

export interface DermagaRow {
  /** Normalized YYYY-MM-DD. */
  date: string;
  /** HH:MM or "" when the source row has no clock-in. */
  clockIn: string;
  /** HH:MM or "" when the source row has no clock-out. */
  clockOut: string;
  activity: string;
}

const MONTHS_ID: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agu: 8, agt: 8,
  sep: 9, sept: 9, okt: 10, nov: 11, des: 12,
};

const WEEKDAYS_ID =
  /^(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)[,\s]+/i;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DMY_DATE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/;
const CLOCK = /^(\d{1,2})[:.](\d{2})$/;

/** Normalize a single cell into YYYY-MM-DD, or null when it is not a date. */
export function parseDermagaDate(raw: string): string | null {
  let text = raw.trim().replace(WEEKDAYS_ID, "").trim();
  if (!text) return null;

  if (ISO_DATE.test(text)) return text;

  const dmy = DMY_DATE.exec(text);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    return formatDate(day, month, year);
  }

  // Indonesian month name: "13 Oktober 2025" / "13-Okt-2025".
  const named = /^(\d{1,2})[\s\-.]+([a-zA-Z]+)[\s\-.]+(\d{4})$/.exec(text);
  if (named) {
    const month = MONTHS_ID[named[2].toLowerCase()];
    if (month) return formatDate(Number(named[1]), month, Number(named[3]));
  }
  return null;
}

/** Normalize "8:5"-shaped tokens into "HH:MM", or null when not a clock. */
export function parseDermagaClock(raw: string): string | null {
  const m = CLOCK.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function formatDate(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
    return null;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null; // e.g. 31 Feb
  return d.toISOString().slice(0, 10);
}

/**
 * Parse pasted content into rows. Accepts full page HTML (Ctrl+U → Ctrl+A →
 * Ctrl+C), a copied table (Ctrl+A → Ctrl+C on the page), or plain text/TSV
 * lines. Rows without their own date/time but with text are appended to the
 * previous row's activity, because DERMAGA sometimes wraps long activities
 * onto continuation rows.
 */
export function parseDermagaPasted(input: string): DermagaRow[] {
  const text = input.trim();
  if (!text) return [];
  const looksHtml = /<\/?(table|tr|td|th|tbody|html|div|p)\b/i.test(text);
  return looksHtml ? parseHtml(text) : parseLines(text);
}

function parseHtml(html: string): DermagaRow[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows: DermagaRow[] = [];

  for (const tr of doc.querySelectorAll("tr")) {
    const cells = Array.from(tr.querySelectorAll("th,td")).map(
      (c) => (c.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    if (cells.length === 0 || cells.every((c) => !c)) continue;

    const dates = cells.map(parseDermagaDate);
    const dateIdx = dates.findIndex((d) => d !== null);
    const clocks = cells.map(parseDermagaClock);

    const rest: string[] = [];
    let clockIn = "";
    let clockOut = "";
    let clockCount = 0;
    for (let i = 0; i < cells.length; i++) {
      if (dates[i]) continue;
      if (clocks[i] && clocks[i] !== dates[i]) {
        // Skip header cells that happen to look like clocks (rare) and cells
        // already treated as the date.
        if (clockCount === 0) clockIn = clocks[i]!;
        else if (clockCount === 1) clockOut = clocks[i]!;
        clockCount++;
        continue;
      }
      if (cells[i]) {
        // Skip row-number columns ("No": 1, 2, …) — DERMAGA-style tables
        // number their rows and the number is not part of the activity.
        if (/^\d{1,3}$/.test(cells[i])) continue;
        rest.push(cells[i]);
      }
    }

    if (dateIdx === -1 && clockCount === 0) {
      // Continuation row: glue its text onto the previous entry.
      if (rows.length > 0 && rest.length > 0) {
        const last = rows[rows.length - 1];
        last.activity = `${last.activity}\n${rest.join(" ")}`.slice(0, 4000);
      }
      continue;
    }
    if (dateIdx === -1 && clockCount > 0 && rows.length > 0) {
      // Times on a continuation row: rare; treat text as continuation and
      // backfill missing times.
      const last = rows[rows.length - 1];
      if (!last.clockIn) last.clockIn = clockIn;
      if (!last.clockOut) last.clockOut = clockOut;
      if (rest.length > 0) {
        last.activity = `${last.activity}\n${rest.join(" ")}`.slice(0, 4000);
      }
      continue;
    }

    const activity = rest.join(" ").trim();
    if (!activity && !clockIn && !clockOut) continue;
    // Header rows (e.g. "Tanggal | Jam Masuk | ...") have a date-shaped cell
    // but no times and generic words only — filter the obvious ones.
    if (/^(tanggal|no|hari)\b/i.test(activity) && !clockIn && !clockOut) continue;

    rows.push({
      date: dates[dateIdx] ?? rows[rows.length - 1]?.date ?? "",
      clockIn,
      clockOut,
      activity,
    });
  }

  return dedupe(rows);
}

function parseLines(text: string): DermagaRow[] {
  const rows: DermagaRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/\s+/g, " ").trim();
    if (!clean) continue;

    // Tokenize the RAW line (tabs / runs of spaces / pipes separate cells),
    // then collapse inner whitespace per token — collapsing the whole line
    // first would destroy the separators.
    const tokens = line
      .split(/\t|\s{2,}|\s*\|\s*/)
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const dateIdx = tokens.findIndex((t) => parseDermagaDate(t) !== null);
    const clocks = tokens
      .map((t) => parseDermagaClock(t))
      .filter((t): t is string => t !== null);

    if (dateIdx === -1) {
      if (rows.length > 0) {
        rows[rows.length - 1].activity = `${rows[rows.length - 1].activity}\n${clean}`.slice(0, 4000);
      }
      continue;
    }

    const activity = tokens
      .filter((t, i) => i !== dateIdx && parseDermagaClock(t) === null)
      .join(" ")
      .trim();
    if (!activity && clocks.length === 0) continue;

    rows.push({
      date: parseDermagaDate(tokens[dateIdx]) ?? "",
      clockIn: clocks[0] ?? "",
      clockOut: clocks[1] ?? "",
      activity,
    });
  }
  return dedupe(rows);
}

function dedupe(rows: DermagaRow[]): DermagaRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (!r.date) return false;
    const key = `${r.date}|${r.clockIn}|${r.clockOut}|${r.activity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
