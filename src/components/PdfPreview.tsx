import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Eye, Loader2, Printer, RotateCcw } from "lucide-react";
import {
  DEFAULT_SIGNATURE_LAYOUT,
  type SignatureLayout,
} from "@/lib/typst/generate";

const LAYOUT_KEY = "logbook:signatureLayout";

export function readSignatureLayout(): SignatureLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) return { ...DEFAULT_SIGNATURE_LAYOUT, ...JSON.parse(raw) };
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULT_SIGNATURE_LAYOUT };
}

function persistSignatureLayout(layout: SignatureLayout) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // storage unavailable — layout just won't persist
  }
}

interface PdfPreviewProps {
  /** Compile the PDF for the current data + layout, returning a blob URL. */
  buildPdf: (layout: SignatureLayout) => Promise<string>;
  /** Download the PDF for the current data + layout (triggered by "Download" inside the dialog). */
  downloadPdf: (layout: SignatureLayout) => Promise<void>;
  label?: string;
}

/**
 * "Preview" button + dialog showing the live PDF in an iframe, with sliders
 * to nudge signature/stamp placement so it fits before downloading.
 */
export function PdfPreview({ buildPdf, downloadPdf, label }: PdfPreviewProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<SignatureLayout>(DEFAULT_SIGNATURE_LAYOUT);
  const urlRef = useRef<string | null>(null);

  const dropUrl = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  const rebuild = useCallback(async (lay: SignatureLayout) => {
    setBuilding(true);
    setError(null);
    try {
      const next = await buildPdf(lay);
      dropUrl();
      urlRef.current = next;
      setUrl(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat PDF");
    } finally {
      setBuilding(false);
    }
  }, [buildPdf]);

  // Rebuild (debounced) whenever layout knobs change while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => void rebuild(layout), 400);
    return () => clearTimeout(id);
  }, [layout, open, rebuild]);

  useEffect(() => () => dropUrl(), []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      const current = readSignatureLayout();
      setLayout(current);
      void rebuild(current);
    } else {
      dropUrl();
      setUrl(null);
    }
  };

  const update = (key: keyof SignatureLayout) => (value: number) => {
    const next = { ...layout, [key]: value };
    setLayout(next);
    persistSignatureLayout(next);
  };

  const reset = () => {
    setLayout({ ...DEFAULT_SIGNATURE_LAYOUT });
    persistSignatureLayout({ ...DEFAULT_SIGNATURE_LAYOUT });
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadPdf(layout);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Eye className="size-4" />
          Preview{label ? ` ${label}` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[90vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle>Preview PDF</DialogTitle>
          <DialogDescription>
            Geser slider untuk menyesuaikan posisi tanda tangan dan stempel, lalu unduh
            saat sudah pas. Pengaturan tersimpan otomatis.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="relative min-w-0 flex-1 rounded-md border bg-muted">
            {url ? (
              <iframe title="PDF Preview" src={url} className="size-full rounded-md" />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                {building ? "Menyusun PDF…" : "Menunggu…"}
              </div>
            )}
            {building && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Loader2 className="size-6 animate-spin" />
              </div>
            )}
          </div>
          <div className="w-64 shrink-0 space-y-5 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label className="flex justify-between">
                Tinggi tanda tangan
                <span className="font-mono text-xs">{layout.sigHeightEm}em</span>
              </Label>
              <Slider
                min={1}
                max={8}
                step={0.25}
                value={[layout.sigHeightEm]}
                onValueChange={(v) => update("sigHeightEm")(v[0]!)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex justify-between">
                Tinggi stempel
                <span className="font-mono text-xs">{layout.stampHeightEm}em</span>
              </Label>
              <Slider
                min={2}
                max={12}
                step={0.25}
                value={[layout.stampHeightEm]}
                onValueChange={(v) => update("stampHeightEm")(v[0]!)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex justify-between">
                Geser stempel horizontal
                <span className="font-mono text-xs">{layout.stampOffsetXEm}em</span>
              </Label>
              <Slider
                min={0}
                max={12}
                step={0.25}
                value={[layout.stampOffsetXEm]}
                onValueChange={(v) => update("stampOffsetXEm")(v[0]!)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex justify-between">
                Geser stempel vertikal
                <span className="font-mono text-xs">{layout.stampOffsetYEm}em</span>
              </Label>
              <Slider
                min={0}
                max={12}
                step={0.25}
                value={[layout.stampOffsetYEm]}
                onValueChange={(v) => update("stampOffsetYEm")(v[0]!)}
              />
            </div>
            <Button variant="ghost" size="sm" onClick={reset} className="w-full">
              <RotateCcw className="size-4" />
              Reset ke standar
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleDownload} disabled={downloading || building} className="w-full">
              {downloading ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
              Download PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
