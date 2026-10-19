// Client-side git log parsing for the "Import dari Git" feature.
//
// Two sources are supported:
// 1. The project folder itself: we read `.git/logs/HEAD` (the reflog), which is
//    plain text and records every commit on the checked-out branch with a
//    timestamp — no zlib/packfile parsing needed.
// 2. A pasted `git log --pretty=format:"%ad|%s" --date=format:"%Y-%m-%d %H:%M"`
//    export, for users whose browser cannot read a folder or who prefer the CLI.

export interface GitCommit {
  /** Committer wall-clock date, YYYY-MM-DD. */
  date: string;
  /** Committer wall-clock time, HH:MM. */
  time: string;
  message: string;
  /** Author name as recorded in the reflog (or pasted export). */
  author?: string;
}

export interface GitDayGroup {
  date: string;
  clockIn: string;
  clockOut: string;
  messages: string[];
}

const REFLOG_COMMIT_RE =
  /^\S+\s\S+\s(.+?)\s<[^>]*>\s(\d+)\s([+-]\d{4})\tcommit(?:\s\([^)]*\))?:\s?(.*)$/;

const EXPORT_LINE_RE =
  /^(?:(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?(?:\s([+-]\d{4}))?)(?:\s*\|\s*([^|]*?)(?:\s*\|\s*(.*))?)?$/;

/** Parse the text of a `.git/logs/HEAD` reflog into commits (newest last). */
export function parseReflog(text: string): GitCommit[] {
  const commits: GitCommit[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = REFLOG_COMMIT_RE.exec(line);
    if (!m) continue;
    const epochSec = Number(m[2]);
    const tz = m[3];
    const offsetMs =
      Number(tz.slice(1, 3)) * 3600_000 + Number(tz.slice(3, 5)) * 60_000;
    const sign = tz[0] === "-" ? -1 : 1;
    // Shift by the committer's offset and read via UTC getters to recover the
    // wall-clock time the commit was made in.
    const d = new Date((epochSec + sign * offsetMs) * 1000);
    commits.push({
      date: wallDate(d),
      time: wallTime(d),
      author: m[1].trim() || undefined,
      message: m[4].trim(),
    });
  }
  return commits;
}

/**
 * Parse pasted `git log` output. Supports both
 * `%ad|%an|%s` (with author) and the older `%ad|%s` (without).
 */
export function parseGitLogExport(text: string): GitCommit[] {
  const commits: GitCommit[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = EXPORT_LINE_RE.exec(line.trim());
    if (!m) continue;
    const rest = (m[5] ?? m[4] ?? "").trim();
    const author = m[5] !== undefined ? (m[4] ?? "").trim() || undefined : undefined;
    if (!rest) continue;
    commits.push({ date: m[1], time: m[2], author, message: rest });
  }
  return commits;
}

/** Unique author names in first-seen order, with per-author commit counts. */
export function listAuthors(commits: GitCommit[]): { author: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of commits) {
    const key = c.author ?? "(tanpa nama)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([author, count]) => ({ author, count }));
}

/** Group commits by date: earliest commit = clock in, latest = clock out. */
export function groupCommitsByDate(commits: GitCommit[]): GitDayGroup[] {
  const byDate = new Map<string, GitCommit[]>();
  for (const c of commits) {
    const list = byDate.get(c.date);
    if (list) list.push(c);
    else byDate.set(c.date, [c]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const times = list.map((c) => c.time).sort();
      return {
        date,
        clockIn: times[0],
        clockOut: addOneHour(times[times.length - 1]),
        messages: list.map((c) => c.message),
      };
    });
}

function wallDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function wallTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function addOneHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const total = Math.min(h * 60 + m + 60, 23 * 60 + 59);
  const p = (n: number) => String(Math.floor(n)).padStart(2, "0");
  return `${p(total / 60)}:${p(total % 60)}`;
}
