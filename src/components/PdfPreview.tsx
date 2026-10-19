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
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Eye, GripHorizontal, Loader2, Printer, RotateCcw } from "lucide-react";
import {
  DEFAULT_SIGNATURE_LAYOUT,
  type SignatureLayout,
} from "@/lib/typst/generate";

const LAYOUT_KEY = "logbook:signatureLayout:v2";

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

/** Data URLs of the signature / stamp images rendered in the box-model editor. */
export interface SignatureImages {
  student?: string | null;
  field_supervisor?: string | null;
  academic_advisor?: string | null;
  stamp?: string | null;
}

interface PdfPreviewProps {
  /** Compile the PDF for the current data + layout, returning a blob URL. */
  buildPdf: (layout: SignatureLayout) => Promise<string>;
  /** Download the PDF for the current data + layout (triggered by "Download" inside the dialog). */
  downloadPdf: (layout: SignatureLayout) => Promise<void>;
  /** Fetch signature/stamp images for the drag editor; called when the dialog opens. */
  loadImages?: () => Promise<SignatureImages>;
  label?: string;
}

// Visual scale of the box-model editor: pixels per em.
const PX_PER_EM = 11;
// Drag range clamps (em).
const X_MIN = -4, X_MAX = 16, Y_MIN = -8, Y_MAX = 12;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

interface DragTarget {
  /** Which layout offset pair this box controls. */
  keyX: keyof SignatureLayout;
  keyY: keyof SignatureLayout;
}

const ELEMENTS: Array<{
  role: string;
  label: string;
  keyX: keyof SignatureLayout;
  keyY: keyof SignatureLayout;
  imageKey?: keyof SignatureImages;
}> = [
  { role: "student", label: "Mahasiswa", keyX: "studentOffsetXEm", keyY: "studentOffsetYEm", imageKey: "student" },
  { role: "field", label: "Pembimbing Lapangan", keyX: "fieldOffsetXEm", keyY: "fieldOffsetYEm", imageKey: "field_supervisor" },
  { role: "stamp", label: "Stempel", keyX: "stampOffsetXEm", keyY: "stampOffsetYEm", imageKey: "stamp" },
  { role: "advisor", label: "Dosen Pembimbing", keyX: "advisorOffsetXEm", keyY: "advisorOffsetYEm", imageKey: "academic_advisor" },
];

/**
 * "Preview" button + dialog showing the live PDF in an iframe, with a
 * drag-and-drop box-model editor (and fine-tune sliders) to position
 * signatures and the company stamp before downloading.
 */
export function PdfPreview({ buildPdf, downloadPdf, loadImages, label }: PdfPreviewProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [images, setImages] = useState<SignatureImages | null>(null);
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
      if (loadImages) {
        loadImages()
          .then(setImages)
          .catch(() => setImages(null));
      }
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
            Tarik kotak tanda tangan / stempel untuk memindahkannya (box modeling),
            lalu unduh saat sudah pas. Pengaturan tersimpan otomatis.
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
          <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
            <BoxModelEditor layout={layout} images={images} onLayoutChange={(next) => {
              setLayout(next);
              persistSignatureLayout(next);
            }} />
            <Separator />
            <div className="space-y-4">
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

/**
 * Box-model editor: a miniature of the signature block where each element is
 * a draggable box. Dragging updates the em offsets that the Typst generator
 * applies as box insets.
 */
function BoxModelEditor({
  layout,
  images,
  onLayoutChange,
}: {
  layout: SignatureLayout;
  images: SignatureImages | null;
  onLayoutChange: (layout: SignatureLayout) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <GripHorizontal className="size-3.5 text-muted-foreground" />
        Posisi manual — tarik kotak
      </Label>
      <div className="grid grid-cols-[3fr_4fr_3fr] gap-px overflow-hidden rounded-md border bg-muted">
        {/* Left column: student */}
        <div className="relative h-44 bg-background">
          <DragBox element={ELEMENTS[0]!} layout={layout} images={images} onLayoutChange={onLayoutChange} />
          <span className="pointer-events-none absolute bottom-1 left-1 text-[10px] text-muted-foreground">Mahasiswa</span>
        </div>
        {/* Middle column: field supervisor + stamp */}
        <div className="relative h-44 bg-background">
          <DragBox element={ELEMENTS[1]!} layout={layout} images={images} onLayoutChange={onLayoutChange} />
          <DragBox element={ELEMENTS[2]!} layout={layout} images={images} onLayoutChange={onLayoutChange} />
          <span className="pointer-events-none absolute bottom-1 left-1 text-[10px] text-muted-foreground">Pembimbing Lapangan</span>
        </div>
        {/* Right column: academic advisor */}
        <div className="relative h-44 bg-background">
          <DragBox element={ELEMENTS[3]!} layout={layout} images={images} onLayoutChange={onLayoutChange} />
          <span className="pointer-events-none absolute bottom-1 left-1 text-[10px] text-muted-foreground">Dosen Pembimbing</span>
        </div>
      </div>
    </div>
  );
}

function DragBox({
  element,
  layout,
  images,
  onLayoutChange,
}: {
  element: (typeof ELEMENTS)[number];
  layout: SignatureLayout;
  images: SignatureImages | null;
  onLayoutChange: (layout: SignatureLayout) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const x = layout[element.keyX] as number;
  const y = layout[element.keyY] as number;
  const src = element.imageKey ? (images?.[element.imageKey] ?? null) : null;

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: x, baseY: y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = dragState.current;
    if (!st) return;
    const nx = clamp(Math.round((st.baseX + (e.clientX - st.startX) / PX_PER_EM) * 4) / 4, X_MIN, X_MAX);
    const ny = clamp(Math.round((st.baseY + (e.clientY - st.startY) / PX_PER_EM) * 4) / 4, Y_MIN, Y_MAX);
    if (nx !== layout[element.keyX] || ny !== layout[element.keyY]) {
      onLayoutChange({ ...layout, [element.keyX]: nx, [element.keyY]: ny });
    }
  };

  const onPointerUp = () => {
    dragState.current = null;
  };

  return (
    <div
      ref={boxRef}
      role="button"
      aria-label={`Geser ${element.label}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`absolute flex cursor-grab touch-none select-none items-center justify-center rounded border border-dashed border-primary/60 bg-primary/5 p-0.5 active:cursor-grabbing ${
        element.role === "stamp" ? "z-10 border-solid border-primary" : ""
      }`}
      style={{ left: x * PX_PER_EM, top: y * PX_PER_EM }}
    >
      {src ? (
        <img src={src} alt={element.label} className="pointer-events-none h-10 object-contain opacity-80" />
      ) : (
        <span className="pointer-events-none px-1 text-[10px] leading-tight text-muted-foreground">
          {element.label}
        </span>
      )}
    </div>
  );
}
