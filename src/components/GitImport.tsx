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
import { GitBranch, Loader2 } from "lucide-react";
import {
  groupCommitsByDate,
  parseGitLogExport,
  parseReflog,
  type GitCommit,
  type GitDayGroup,
} from "@/lib/git-log";
import { saveEntry } from "@/server/weeks";

const MAX_ACTIVITY_LENGTH = 2000;

interface GitImportProps {
  weekId: string;
  /** Week start date (YYYY-MM-DD); days inside the 7-day window are pre-selected. */
  startDate: string;
  onImported: () => Promise<void> | void;
}

export function GitImport({ weekId, startDate, onImported }: GitImportProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [groups, setGroups] = useState<GitDayGroup[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);

  const weekEnd = weekEndDate(startDate);

  const loadGroups = (commits: GitCommit[]) => {
    if (commits.length === 0) {
      setError("No commits found in this source.");
      setGroups(null);
      return;
    }
    const g = groupCommitsByDate(commits);
    setGroups(g);
    setSelected(
      new Set(
        g.filter((d) => d.date >= startDate && d.date <= weekEnd).map((d) => d.date),
      ),
    );
    setError(null);
  };

  const onPickFolder = async (files: FileList) => {
    setError(null);
    // The directory input exposes every file under the picked folder; find the
    // git reflog without reading anything else.
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
      return;
    }
    loadGroups(parseReflog(await reflog.text()));
  };

  const onImport = async () => {
    if (!groups) return;
    setBusy(true);
    setError(null);
    try {
      for (const day of groups) {
        if (!selected.has(day.date)) continue;
        const activity = day.messages.join("\n").slice(0, MAX_ACTIVITY_LENGTH);
        await saveEntry({
          data: {
            weekId,
            entryDate: day.date,
            clockIn: day.clockIn,
            clockOut: day.clockOut,
            activity,
          },
        });
      }
      setOpen(false);
      setGroups(null);
      setPasted("");
      await onImported();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const selectedCount = groups?.filter((d) => selected.has(d.date)).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <GitBranch /> Import dari Git
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import aktivitas dari Git</DialogTitle>
          <DialogDescription>
            Commit dikelompokkan per hari: commit pertama jadi jam masuk,
            terakhir jadi jam keluar, pesan commit jadi aktivitas.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="folder">
          <TabsList>
            <TabsTrigger value="folder">Pilih folder project</TabsTrigger>
            <TabsTrigger value="paste">Tempel git log</TabsTrigger>
          </TabsList>

          <TabsContent value="folder" className="grid gap-2">
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
            <p className="text-xs text-muted-foreground">
              Diparse langsung dari <code>.git/logs/HEAD</code> di browser — tidak ada file yang diunggah ke server.
            </p>
          </TabsContent>

          <TabsContent value="paste" className="grid gap-2">
            <Textarea
              rows={5}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={`git log --pretty=format:"%ad|%s" --date=format:"%Y-%m-%d %H:%M"\n\n2026-10-13 09:14|feat: menambahkan halaman login\n2026-10-13 16:42|fix: perbaikan validasi form`}
            />
            <Button
              variant="outline"
              onClick={() => loadGroups(parseGitLogExport(pasted))}
              disabled={!pasted.trim()}
            >
              Parse
            </Button>
          </TabsContent>
        </Tabs>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {groups && groups.length > 0 && (
          <div className="max-h-72 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Jam</TableHead>
                  <TableHead>Commit</TableHead>
                  <TableHead>Aktivitas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((day) => {
                  const inWeek = day.date >= startDate && day.date <= weekEnd;
                  return (
                    <TableRow key={day.date}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={selected.has(day.date)}
                          onChange={() => toggleDate(day.date, selected, setSelected)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {day.date}
                        {!inWeek && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (di luar minggu)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {day.clockIn}–{day.clockOut}
                      </TableCell>
                      <TableCell>{day.messages.length}</TableCell>
                      <TableCell className="max-w-64 truncate text-sm">
                        {day.messages.join(" • ")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => void onImport()} disabled={busy || selectedCount === 0}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Import {selectedCount > 0 ? `${selectedCount} hari` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toggleDate(
  date: string,
  selected: Set<string>,
  setSelected: (s: Set<string>) => void,
) {
  const next = new Set(selected);
  if (next.has(date)) next.delete(date);
  else next.add(date);
  setSelected(next);
}

function weekEndDate(startDate: string): string {
  const d = new Date(startDate + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return startDate;
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}
