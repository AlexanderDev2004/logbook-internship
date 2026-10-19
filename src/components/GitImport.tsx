import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, GitBranch, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  groupCommitsByDate,
  listAuthors,
  parseGitLogExport,
  parseReflog,
  type GitCommit,
} from "@/lib/git-log";
import { saveEntry } from "@/server/weeks";

const MAX_ACTIVITY_LENGTH = 2000;

interface GitImportProps {
  weekId: string;
  /** Week start date (YYYY-MM-DD); days inside the 7-day window are pre-selected. */
  startDate: string;
  onImported: () => Promise<void> | void;
}

/** One editable day in the review step. */
interface ReviewRow {
  date: string;
  clockIn: string;
  clockOut: string;
  activity: string;
  commitCount: number;
  include: boolean;
}

type Step = "source" | "filter" | "review";

export function GitImport({ weekId, startDate, onImported }: GitImportProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("source");
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [reading, setReading] = useState(false);
  const [commits, setCommits] = useState<GitCommit[] | null>(null);
  const [authors, setAuthors] = useState<{ author: string; count: number }[]>([]);
  const [authorFilter, setAuthorFilter] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  /** Progress of the import loop: how many days have been saved so far. */
  const [savedCount, setSavedCount] = useState(0);
  /** Import finished successfully; dialog stays open until the user closes it. */
  const [finished, setFinished] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);

  const weekEnd = weekEndDate(startDate);

  const reset = () => {
    setStep("source");
    setError(null);
    setReading(false);
    setCommits(null);
    setAuthors([]);
    setAuthorFilter(new Set());
    setRows([]);
    setPasted("");
    setSavedCount(0);
    setFinished(false);
  };

  /** Step 1 done: keep the raw commits, move to the author filter. */
  const loadCommits = (parsed: GitCommit[]) => {
    if (parsed.length === 0) {
      setError("Tidak ada commit yang ditemukan di sumber itu.");
      return;
    }
    const found = listAuthors(parsed);
    setCommits(parsed);
    setAuthors(found);
    setAuthorFilter(new Set(found.map((a) => a.author)));
    setError(null);
    setReading(false);
    setStep("filter");
  };

  const onPickFolder = async (files: FileList) => {
    setError(null);
    setReading(true);
    // The directory input exposes every file under the picked folder; find the
    // git reflog without reading anything else.
    try {
      let reflog: File | null = null;
      for (const file of files) {
        const path =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name;
        if (/\.git\/logs\/HEAD$/i.test(path) || /\.git\/logs\/refs\/heads\/[^/]+$/i.test(path)) {
          if (!reflog || /HEAD$/i.test(path)) reflog = file;
        }
      }
      if (!reflog) {
        setError("File .git/logs/HEAD tidak ditemukan di folder itu — apakah ini repo git?");
        setReading(false);
        return;
      }
      loadCommits(parseReflog(await reflog.text()));
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setReading(false);
    }
  };

  /** Step 2 done: group the filtered commits into editable review rows. */
  const applyFilter = () => {
    if (!commits) return;
    const filtered = commits.filter((c) => authorFilter.has(c.author ?? "(tanpa nama)"));
    if (filtered.length === 0) {
      setError("Pilih minimal satu author.");
      return;
    }
    const grouped = groupCommitsByDate(filtered);
    setRows(
      grouped.map((day) => ({
        date: day.date,
        clockIn: day.clockIn,
        clockOut: day.clockOut,
        activity: day.messages.join("\n").slice(0, MAX_ACTIVITY_LENGTH),
        commitCount: day.messages.length,
        include: day.date >= startDate && day.date <= weekEnd,
      })),
    );
    setError(null);
    setStep("review");
  };

  const updateRow = (date: string, patch: Partial<ReviewRow>) => {
    setRows((rs) => rs.map((r) => (r.date === date ? { ...r, ...patch } : r)));
  };

  const onImport = async () => {
    setBusy(true);
    setError(null);
    setFinished(false);
    setSavedCount(0);
    try {
      let done = 0;
      for (const row of rows) {
        if (!row.include) continue;
        await saveEntry({
          data: {
            weekId,
            entryDate: row.date,
            clockIn: row.clockIn,
            clockOut: row.clockOut,
            activity: row.activity,
          },
        });
        done += 1;
        setSavedCount(done);
      }
      setFinished(true);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  /** Close after a successful import: sync the week table first. */
  const finishAndClose = async () => {
    closeAndReset(false);
    await onImported();
  };

  const selectedCount = rows.filter((r) => r.include).length;
  const importProgress =
    selectedCount > 0 ? Math.round((savedCount / selectedCount) * 100) : 0;
  const filteredTotal = authors
    .filter((a) => authorFilter.has(a.author))
    .reduce((sum, a) => sum + a.count, 0);

  const closeAndReset = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  return (
    <Dialog open={open} onOpenChange={closeAndReset}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <GitBranch /> Import dari Git
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import aktivitas dari Git</DialogTitle>
          <DialogDescription>
            {step === "source" &&
              "Pilih folder project atau tempel git log. Commit dikelompokkan per hari: commit pertama jadi jam masuk, terakhir jadi jam keluar, pesan commit jadi aktivitas."}
            {step === "filter" &&
              "Pilih author mana yang commit-nya mau dijadikan aktivitasmu, lalu lanjut ke review."}
            {step === "review" &&
              "Review dan edit dulu — tanggal, jam, dan isi aktivitas bisa diubah sebelum masuk ke tabel."}
          </DialogDescription>
        </DialogHeader>

        {step === "source" && (
          <Tabs defaultValue="folder">
            <TabsList>
              <TabsTrigger value="folder">Pilih folder project</TabsTrigger>
              <TabsTrigger value="paste">Tempel git log</TabsTrigger>
            </TabsList>

            <TabsContent value="folder" className="grid gap-2">
              {reading ? (
                <div className="grid gap-2">
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                    <Loader2 className="animate-spin" />
                    Membaca git log, mohon tunggu…
                  </div>
                  <Progress value={100} className="animate-pulse" />
                </div>
              ) : (
                <>
                  <input
                    ref={(el) => {
                      // React has no typed prop for these non-standard attributes.
                      if (el) {
                        el.setAttribute("webkitdirectory", "");
                        el.setAttribute("directory", "");
                      }
                      folderInput.current = el;
                    }}
                    type="file"
                    className="hidden"
                    onChange={(e) => e.target.files && void onPickFolder(e.target.files)}
                  />
                  <Button variant="outline" onClick={() => folderInput.current?.click()}>
                    Pilih folder project…
                  </Button>
                </>
              )}
              <p className="text-xs text-muted-foreground">
                Diparse langsung dari <code>.git/logs/HEAD</code> di browser — tidak ada file yang
                diunggah ke server.
              </p>
            </TabsContent>

            <TabsContent value="paste" className="grid gap-2">
              <Textarea
                rows={5}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={`git log --pretty=format:"%ad|%an|%s" --date=format:"%Y-%m-%d %H:%M"\n\n2026-10-13 09:14|Alexander|feat: menambahkan halaman login\n2026-10-13 16:42|Alexander|fix: perbaikan validasi form`}
              />
              <Button
                variant="outline"
                onClick={() => {
                  setReading(true);
                  loadCommits(parseGitLogExport(pasted));
                }}
                disabled={!pasted.trim() || reading}
              >
                Parse
              </Button>
            </TabsContent>
          </Tabs>
        )}

        {step === "filter" && commits && (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {commits.length} commit ditemukan dari {authors.length} author.
            </p>
            <div className="max-h-56 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Author</TableHead>
                    <TableHead className="w-20 text-right">Commit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {authors.map(({ author, count }) => (
                    <TableRow key={author}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={authorFilter.has(author)}
                          onChange={() => toggleAuthor(author, authorFilter, setAuthorFilter)}
                        />
                      </TableCell>
                      <TableCell>{author}</TableCell>
                      <TableCell className="text-right">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("source")}>
                <ArrowLeft /> Ganti sumber
              </Button>
              <Button onClick={() => applyFilter()} disabled={filteredTotal === 0}>
                Lanjut ke review ({filteredTotal} commit)
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Centang hari yang mau dimasukkan, edit isi aktivitas langsung di tabel.
            </p>
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead className="w-32">Tanggal</TableHead>
                    <TableHead className="w-40">Jam</TableHead>
                    <TableHead>Aktivitas (bisa diedit)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const inWeek = row.date >= startDate && row.date <= weekEnd;
                    return (
                      <TableRow key={row.date} className={row.include ? "" : "opacity-50"}>
                        <TableCell>
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={row.include}
                            onChange={() => updateRow(row.date, { include: !row.include })}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {row.date}
                          {!inWeek && (
                            <div className="text-xs text-muted-foreground">(di luar minggu)</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              type="time"
                              className="h-8 w-20 px-1 text-xs"
                              value={row.clockIn}
                              onChange={(e) => updateRow(row.date, { clockIn: e.target.value })}
                            />
                            <span className="text-xs text-muted-foreground">–</span>
                            <Input
                              type="time"
                              className="h-8 w-20 px-1 text-xs"
                              value={row.clockOut}
                              onChange={(e) => updateRow(row.date, { clockOut: e.target.value })}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Textarea
                            rows={Math.min(4, Math.max(2, row.activity.split("\n").length))}
                            className="text-sm"
                            maxLength={MAX_ACTIVITY_LENGTH}
                            value={row.activity}
                            onChange={(e) => updateRow(row.date, { activity: e.target.value })}
                          />
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.commitCount} commit • {row.activity.length}/{MAX_ACTIVITY_LENGTH}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("filter")}
                disabled={busy || finished}
              >
                <ArrowLeft /> Kembali
              </Button>
              {finished ? (
                <Button onClick={() => void finishAndClose()}>
                  Selesai — {selectedCount} hari dimasukkan
                </Button>
              ) : (
                <Button onClick={() => void onImport()} disabled={busy || selectedCount === 0}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {busy
                    ? `Menyimpan ${savedCount}/${selectedCount}…`
                    : `Masukkan ke tabel${selectedCount > 0 ? ` (${selectedCount} hari)` : ""}`}
                </Button>
              )}
            </div>
            {(busy || finished) && (
              <div className="grid gap-1.5">
                <Progress value={importProgress} />
                <p className="text-xs text-muted-foreground">
                  {finished ? (
                    <span className="text-green-600">
                      ✓ Selesai — {savedCount} dari {selectedCount} hari berhasil dimasukkan ke
                      tabel (100%)
                    </span>
                  ) : (
                    <>
                      Menyimpan aktivitas… {savedCount} dari {selectedCount} hari ({importProgress}%)
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}

function toggleAuthor(
  author: string,
  selected: Set<string>,
  setSelected: (s: Set<string>) => void,
) {
  const next = new Set(selected);
  if (next.has(author)) next.delete(author);
  else next.add(author);
  setSelected(next);
}

function weekEndDate(startDate: string): string {
  const d = new Date(startDate + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return startDate;
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}
