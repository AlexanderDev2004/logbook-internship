import { useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Building2, Copy, Loader2 } from "lucide-react";
import { parseDermagaPasted, type DermagaRow } from "@/lib/dermaga-html";
import { saveEntry } from "@/server/weeks";

const MAX_ACTIVITY_LENGTH = 2000;

const BOOKMARKLET = `javascript:(()=>{const h=document.documentElement.outerHTML;navigator.clipboard.writeText(h).then(()=>alert('HTML DERMAGA disalin ('+h.length+' karakter). Buka Logbook lalu paste di Import DERMAGA.'));})();`;

interface DermagaImportProps {
  weekId: string;
  /** Week start date (YYYY-MM-DD); days inside the 7-day window are pre-selected. */
  startDate: string;
  onImported: () => Promise<void> | void;
}

interface ReviewRow extends DermagaRow {
  include: boolean;
}

type Step = "source" | "review";

export function DermagaImport({ weekId, startDate, onImported }: DermagaImportProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("source");
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [finished, setFinished] = useState(false);

  const weekEnd = weekEndDate(startDate);

  const reset = () => {
    setStep("source");
    setError(null);
    setPasted("");
    setRows([]);
    setCopied(false);
    setSavedCount(0);
    setFinished(false);
  };

  const parse = () => {
    const parsed = parseDermagaPasted(pasted);
    if (parsed.length === 0) {
      setError(
        "Tidak ada baris yang dikenali. Pastikan kamu menempel HTML halaman monitoring DERMAGA (atau tabelnya), bukan halaman login.",
      );
      return;
    }
    setRows(
      parsed.map((r) => ({
        ...r,
        activity: r.activity.slice(0, MAX_ACTIVITY_LENGTH),
        include: r.date >= startDate && r.date <= weekEnd,
      })),
    );
    setError(null);
    setStep("review");
  };

  const updateRow = (index: number, patch: Partial<ReviewRow>) => {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const onImport = async () => {
    setBusy(true);
    setError(null);
    setFinished(false);
    setSavedCount(0);
    try {
      let done = 0;
      const selected = rows.filter((r) => r.include);
      for (const row of selected) {
        await saveEntry({
          data: {
            weekId,
            entryDate: row.date,
            clockIn: row.clockIn || "09:00",
            clockOut: row.clockOut || "17:00",
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

  const finishAndClose = async () => {
    setOpen(false);
    reset();
    await onImported();
  };

  const selectedCount = rows.filter((r) => r.include).length;
  const importProgress =
    selectedCount > 0 ? Math.round((savedCount / selectedCount) * 100) : 0;

  const copyBookmarklet = () => {
    navigator.clipboard.writeText(BOOKMARKLET).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Building2 /> Import dari DERMAGA
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import aktivitas dari DERMAGA JTI</DialogTitle>
          <DialogDescription>
            {step === "source" &&
              "DERMAGA tidak punya API publik, jadi datanya diambil dari halamannya: salin HTML halaman monitoring (Ctrl+U, pilih semua, copy) atau pakai bookmarklet, lalu tempel di sini."}
            {step === "review" &&
              "Review dulu — tanggal, jam, dan isi aktivitas bisa diedit sebelum masuk ke tabel."}
          </DialogDescription>
        </DialogHeader>

        {step === "source" && (
          <div className="grid gap-3">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Cara paling cepat (bookmarklet)</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
                <li>Buka DERMAGA dan login seperti biasa</li>
                <li>Tekan bookmark di bawah di halaman monitoring</li>
                <li>Kembali ke sini dan tempel (Ctrl+V) di kotak bawah</li>
              </ol>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={copyBookmarklet}
              >
                <Copy /> {copied ? "Tersalin!" : "Salin bookmarklet"}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">
                Bookmarklet berjalan di browser kamu sendiri saat sudah login —
                tidak mengirim apa pun ke DERMAGA.
              </p>
            </div>

            <Textarea
              rows={6}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="Tempel HTML halaman monitoring DERMAGA di sini (Ctrl+U → Ctrl+A → Ctrl+C), atau tempel isi tabelnya langsung…"
              className="font-mono text-xs"
            />
            <div className="flex justify-end">
              <Button onClick={parse} disabled={!pasted.trim()}>
                Parse
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {rows.length} baris dikenali. Centang hari yang mau dimasukkan —
              hari di luar minggu ini tidak dicentang otomatis.
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
                  {rows.map((row, i) => {
                    const inWeek = row.date >= startDate && row.date <= weekEnd;
                    return (
                      <TableRow key={i} className={row.include ? "" : "opacity-50"}>
                        <TableCell>
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={row.include}
                            onChange={() => updateRow(i, { include: !row.include })}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{row.date}
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
                              onChange={(e) => updateRow(i, { clockIn: e.target.value })}
                            />
                            <span className="text-xs text-muted-foreground">–</span>
                            <Input
                              type="time"
                              className="h-8 w-20 px-1 text-xs"
                              value={row.clockOut}
                              onChange={(e) => updateRow(i, { clockOut: e.target.value })}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Textarea
                            rows={Math.min(4, Math.max(2, row.activity.split("\n").length))}
                            className="text-sm"
                            maxLength={MAX_ACTIVITY_LENGTH}
                            value={row.activity}
                            onChange={(e) => updateRow(i, { activity: e.target.value })}
                          />
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.activity.length}/{MAX_ACTIVITY_LENGTH}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep("source")} disabled={busy || finished}>
                <ArrowLeft /> Kembali
              </Button>
              {finished ? (
                <Button onClick={() => void finishAndClose()}>
                  Selesai — {savedCount} hari dimasukkan
                </Button>
              ) : (
                <Button onClick={() => void onImport()} disabled={busy || selectedCount === 0}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {busy
                    ? `Menyimpan ${savedCount}/${selectedCount}…`
                    : `Masukkan ke tabel (${selectedCount} hari)`}
                </Button>
              )}
            </DialogFooter>
            {(busy || finished) && (
              <div className="grid gap-1.5">
                <Progress value={importProgress} />
                <p className="text-xs text-muted-foreground">
                  {finished ? (
                    <span className="text-green-600">
                      ✓ Selesai — {savedCount} dari {selectedCount} hari berhasil dimasukkan (100%)
                    </span>
                  ) : (
                    <>Menyimpan… {savedCount} dari {selectedCount} hari ({importProgress}%)</>
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

function weekEndDate(startDate: string): string {
  const d = new Date(startDate + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return startDate;
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}
