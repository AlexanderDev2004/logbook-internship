import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ClipboardList, Copy, ExternalLink, Upload } from "lucide-react";
import { DERMAGA_FILLER_BOOKMARKLET } from "@/lib/dermaga-filler";

const DERMAGA_URL = "https://jti.polinema.ac.id/dermaga/mahasiswa/monitoring";

export interface DermagaExportEntry {
  date: string;
  clockIn: string;
  clockOut: string;
  activity: string;
}

interface DermagaExportProps {
  weekLabel: string;
  entries: DermagaExportEntry[];
}

/**
 * Sends the week's entries INTO DERMAGA: step 1 copies the data as JSON,
 * step 2 is a bookmarklet the student runs on the (already logged in)
 * DERMAGA monitoring page — it fills the page's own activity form once per
 * entry. No credentials ever leave the student's browser.
 */
export function DermagaExport({ weekLabel, entries }: DermagaExportProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"data" | "bookmarklet" | null>(null);

  const payload = JSON.stringify({
    app: "logbook-internship",
    week: weekLabel,
    entries,
  });

  const copy = (what: "data" | "bookmarklet") => {
    const text = what === "data" ? payload : DERMAGA_FILLER_BOOKMARKLET;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Upload /> Export ke DERMAGA
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Isi monitoring DERMAGA dari logbook</DialogTitle>
          <DialogDescription>
            {entries.length} entri dari week "{weekLabel}" akan dikirim ke
            DERMAGA lewat browser kamu sendiri — DERMAGA tidak punya API, jadi
            login dan izinnya tetap milikmu, tidak ada password yang disimpan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="font-medium">Langkah 1 — salin data minggu ini</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => copy("data")}>
              <Copy /> {copied === "data" ? "Tersalin!" : "Salin data untuk DERMAGA"}
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">
              Berisi {entries.length} entri (tanggal, jam, kegiatan) dalam bentuk JSON.
            </p>
          </div>

          <div className="rounded-md border bg-muted/40 p-3">
            <p className="font-medium">Langkah 2 — pasang bookmarklet (sekali saja)</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
              <li>Salin tombol di bawah</li>
              <li>Di browser: Bookmark Manager → Add new bookmark</li>
              <li>Nama bebas, paste ke kolom URL</li>
            </ol>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => copy("bookmarklet")}
            >
              <Copy /> {copied === "bookmarklet" ? "Tersalin!" : "Salin bookmarklet DERMAGA Filler"}
            </Button>
          </div>

          <div className="rounded-md border bg-muted/40 p-3">
            <p className="font-medium">Langkah 3 — isi DERMAGA</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
              <li>
                Buka <a className="underline" href={DERMAGA_URL} target="_blank" rel="noreferrer">monitoring DERMAGA <ExternalLink className="inline h-3 w-3" /></a> dan login seperti biasa
              </li>
              <li>Buka form tambah kegiatan (kalau bentuknya modal, klik dulu tombol tambahnya)</li>
              <li>
                Klik bookmark <b>DERMAGA Filler</b> → data otomatis terisi dari
                clipboard → <b>Muat data</b> → <b>Isi semua</b>
              </li>
            </ol>
            <p className="mt-1 text-xs text-muted-foreground">
              Panelnya menampilkan field form yang dikenali dan hasil setiap
              pengiriman — kalau ada yang tidak cocok, screenshot panelnya.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
