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
import { Eye, Loader2, Printer, RotateCcw } from "lucide-react";
import {
  DEFAULT_SIGNATURE_LAYOUT,
  type SignatureLayout,
} from "@/lib/typst/generate";

const LAYOUT_KEY = "logbook:signatureLayout:v3";

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

// Page-canvas editor geometry: a miniature A4 page with the PDF's real page
// setup (1in margins, 12pt body text), so box positions read WYSIWYG.
const PAGE_W = 420;
const PAGE_H = Math.round(PAGE_W * (297 / 210)); // ≈ 594
const PAGE_MARGIN = Math.round(PAGE_W * (25.4 / 210)); // 1in ≈ 51px
// Pixels per Typst em: 12pt = 4.233mm on a 210mm-wide page.
const PX_PER_EM = PAGE_W * (4.2333 / 210); // ≈ 8.47
// Drag range clamps (em).
const X_MIN = -4, X_MAX = 16, Y_MIN = -8, Y_MAX = 12;
// Scale / rotation clamps.
const SCALE_MIN = 0.3, SCALE_MAX = 3;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number, step: number) => Number((Math.round(v / step) * step).toFixed(6));

// Signature image aspect (w/h ≈ 2.5, approximating a real signature); the
// company stamp is square.
const SIG_ASPECT = 110 / 44;

const ELEMENTS: Array<{
  role: string;
  label: string;
  keyX: keyof SignatureLayout;
  keyY: keyof SignatureLayout;
  keyScale: keyof SignatureLayout;
  keyRot: keyof SignatureLayout;
  imageKey?: keyof SignatureImages;
}> = [
  { role: "student", label: "Mahasiswa", keyX: "studentOffsetXEm", keyY: "studentOffsetYEm", keyScale: "studentScale", keyRot: "studentRot", imageKey: "student" },
  { role: "field", label: "Pembimbing Lapangan", keyX: "fieldOffsetXEm", keyY: "fieldOffsetYEm", keyScale: "fieldScale", keyRot: "fieldRot", imageKey: "field_supervisor" },
  { role: "stamp", label: "Stempel", keyX: "stampOffsetXEm", keyY: "stampOffsetYEm", keyScale: "stampScale", keyRot: "stampRot", imageKey: "stamp" },
  { role: "advisor", label: "Dosen Pembimbing", keyX: "advisorOffsetXEm", keyY: "advisorOffsetYEm", keyScale: "advisorScale", keyRot: "advisorRot", imageKey: "academic_advisor" },
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
            Tarik kotak untuk memindah, titik biru untuk resize, titik hijau untuk
            memutar (Shift = snap 15°). Unduh saat sudah pas — pengaturan tersimpan
            otomatis.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 gap-4">
          <PageCanvas
            layout={layout}
            images={images}
            onLayoutChange={(next) => {
              setLayout(next);
              persistSignatureLayout(next);
            }}
          />
          <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Eye className="size-3.5 text-muted-foreground" />
                Hasil PDF
              </Label>
              <div className="relative h-56 rounded-md border bg-muted">
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
            </div>
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
 * Page-canvas editor: a miniature A4 page mirroring the PDF's real page setup
 * (1in margins, 12pt text, 3fr/4fr/3fr signature grid). Each signature and the
 * stamp sit at their true natural position; dragging updates the em offsets
 * that the Typst generator applies as box insets.
 */
function PageCanvas({
  layout,
  images,
  onLayoutChange,
}: {
  layout: SignatureLayout;
  images: SignatureImages | null;
  onLayoutChange: (layout: SignatureLayout) => void;
}) {
  const sigH = layout.sigHeightEm * PX_PER_EM;
  const nameLine = <div className="mx-auto h-1.5 w-3/4 rounded bg-neutral-300" />;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-start justify-center overflow-auto rounded-md border bg-muted p-3">
      <div className="relative shrink-0 bg-white shadow-md" style={{ width: PAGE_W, height: PAGE_H }}>
        <div className="absolute inset-0 flex flex-col" style={{ padding: PAGE_MARGIN }}>
          {/* header skeleton: logo + institution lines */}
          <div className="flex items-start gap-2">
            <div className="size-10 shrink-0 rounded-sm border border-neutral-300 bg-neutral-100" />
            <div className="flex-1 space-y-1 pt-1">
              <div className="mx-auto h-1.5 w-3/4 rounded bg-neutral-300" />
              <div className="mx-auto h-1 w-1/2 rounded bg-neutral-200" />
              <div className="mx-auto h-1 w-2/3 rounded bg-neutral-200" />
            </div>
          </div>
          {/* title */}
          <div className="mx-auto mt-3 h-2 w-1/2 rounded bg-neutral-300" />
          {/* activities table skeleton */}
          <div className="mt-3 border border-neutral-300">
            <div className="grid grid-cols-4 divide-x divide-neutral-300 border-b border-neutral-300 bg-neutral-100">
              <div className="h-3" /><div className="h-3" /><div className="h-3" /><div className="h-3" />
            </div>
            {[0, 1, 2].map((r) => (
              <div key={r} className="grid grid-cols-4 divide-x divide-neutral-300 border-b border-neutral-200 last:border-b-0">
                <div className="h-6" /><div className="h-6" /><div className="h-6" /><div className="h-6" />
              </div>
            ))}
          </div>
          {/* signature block follows the table, like the real PDF */}
          <div className="mt-3 grid" style={{ gridTemplateColumns: "3fr 4fr 3fr" }}>
            {/* row 1: student (right column) */}
            <div /><div />
            <div>
              <div className="text-[7px] leading-tight text-neutral-600">Mahasiswa,</div>
              <div className="relative" style={{ height: sigH }}>
                <DragBox element={ELEMENTS[0]!} layout={layout} images={images} onLayoutChange={onLayoutChange} />
              </div>
              {nameLine}
            </div>
            {/* row 2: Mengetahui (left), field supervisor + stamp (right) */}
            <div className="text-[7px] leading-tight text-neutral-600">Mengetahui,</div>
            <div />
            <div>
              <div className="text-[7px] leading-tight text-neutral-600">Pembimbing Lapangan,</div>
              <div className="relative" style={{ height: sigH }}>
                <DragBox element={ELEMENTS[1]!} layout={layout} images={images} onLayoutChange={onLayoutChange} />
              </div>
              {/* stamp flows after the signature image, shifted by its insets */}
              <div className="relative size-0">
                <DragBox element={ELEMENTS[2]!} layout={layout} images={images} onLayoutChange={onLayoutChange} />
              </div>
              {nameLine}
            </div>
            {/* row 3: academic advisor (middle column) */}
            <div />
            <div>
              <div className="text-[7px] leading-tight text-neutral-600">Dosen Pembimbing,</div>
              <div className="relative" style={{ height: sigH }}>
                <DragBox element={ELEMENTS[3]!} layout={layout} images={images} onLayoutChange={onLayoutChange} />
              </div>
              {nameLine}
            </div>
            <div />
          </div>
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
  // Session state for the active pointer gesture (PeakU pattern):
  // one transform model — offset for drag, radial distance for resize,
  // atan2 for rotate.
  const session = useRef<{
    mode: "drag" | "resize" | "rotate";
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    baseScale: number;
    baseRot: number;
    center: { cx: number; cy: number };
    startDist: number;
    startAngle: number;
  } | null>(null);

  const x = layout[element.keyX] as number;
  const y = layout[element.keyY] as number;
  const scale = layout[element.keyScale] as number;
  const rot = layout[element.keyRot] as number;
  const src = element.imageKey ? (images?.[element.imageKey] ?? null) : null;
  // WYSIWYG box size: the same em height the Typst generator renders.
  const em = element.role === "stamp" ? layout.stampHeightEm : layout.sigHeightEm;
  const h = em * scale * PX_PER_EM;
  const w = element.role === "stamp" ? h : h * SIG_ASPECT;

  const set = (nx: number, ny: number, nscale: number, nrot: number) => {
    onLayoutChange({
      ...layout,
      [element.keyX]: round(clamp(nx, X_MIN, X_MAX), 0.25),
      [element.keyY]: round(clamp(ny, Y_MIN, Y_MAX), 0.25),
      [element.keyScale]: round(clamp(nscale, SCALE_MIN, SCALE_MAX), 0.05),
      [element.keyRot]: round(clamp(nrot, -180, 180), 1),
    });
  };

  const boxRef = useRef<HTMLDivElement>(null);

  const begin = (e: React.PointerEvent, mode: "drag" | "resize" | "rotate") => {
    e.preventDefault();
    e.stopPropagation();
    // Capture only works for a real active pointer; synthetic events (tests)
    // have none, and losing capture just means move events must stay on the
    // element — acceptable degradation.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // no active pointer — ignore
    }
    // Resize/rotate pivot around the BOX center, not the handle center.
    const rect = boxRef.current!.getBoundingClientRect();
    session.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      baseX: x,
      baseY: y,
      baseScale: scale,
      baseRot: rot,
      center: { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 },
      startDist: 1,
      startAngle: 0,
    };
    if (mode === "resize") {
      session.current.startDist = Math.max(8, Math.hypot(e.clientX - session.current.center.cx, e.clientY - session.current.center.cy));
    } else if (mode === "rotate") {
      const c = session.current.center;
      session.current.startAngle = (Math.atan2(e.clientY - c.cy, e.clientX - c.cx) * 180) / Math.PI;
    }
  };

  const move = (e: React.PointerEvent) => {
    const st = session.current;
    if (!st) return;
    if (st.mode === "drag") {
      set(
        st.baseX + (e.clientX - st.startX) / PX_PER_EM,
        st.baseY + (e.clientY - st.startY) / PX_PER_EM,
        st.baseScale,
        st.baseRot,
      );
    } else if (st.mode === "resize") {
      const dist = Math.hypot(e.clientX - st.center.cx, e.clientY - st.center.cy);
      set(st.baseX, st.baseY, st.baseScale * (dist / st.startDist), st.baseRot);
    } else {
      const c = st.center;
      const ang = (Math.atan2(e.clientY - c.cy, e.clientX - c.cx) * 180) / Math.PI;
      const next = st.baseRot + (ang - st.startAngle);
      set(st.baseX, st.baseY, st.baseScale, e.shiftKey ? Math.round(next / 15) * 15 : next);
    }
  };

  const end = () => {
    session.current = null;
  };

  return (
    <div
      ref={boxRef}
      role="button"
      aria-label={`Geser ${element.label}`}
      onPointerDown={(e) => begin(e, "drag")}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className={`absolute cursor-grab touch-none select-none rounded border border-dashed border-primary/60 bg-primary/5 hover:outline hover:outline-1 hover:outline-blue-500/80 active:cursor-grabbing ${
        element.role === "stamp" ? "z-10 border-solid border-primary" : ""
      }`}
      style={{ left: x * PX_PER_EM, top: y * PX_PER_EM, width: w, height: h }}
    >
      {/* content rotates/scales with the layout; handles stay axis-aligned */}
      <div
        className="pointer-events-none flex size-full items-center justify-center"
        style={{ transform: `rotate(${rot}deg)` }}
      >
        {src ? (
          <img src={src} alt={element.label} className="size-full object-contain opacity-80" />
        ) : (
          <span className="px-1 text-[10px] leading-tight text-muted-foreground">
            {element.label}
          </span>
        )}
      </div>
      {/* resize handle: bottom-right */}
      <div
        aria-label={`Resize ${element.label}`}
        onPointerDown={(e) => begin(e, "resize")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-nwse-resize touch-none rounded-full border-[1.5px] border-blue-500 bg-white shadow-sm before:absolute before:bottom-0.5 before:right-0.5 before:size-1.5 before:bg-blue-500"
      />
      {/* rotate handle: above, with a stem */}
      <div className="pointer-events-none absolute left-1/2 top-[-22px] h-5 w-px -translate-x-1/2 bg-emerald-500/60" />
      <div
        aria-label={`Rotate ${element.label}`}
        onPointerDown={(e) => begin(e, "rotate")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="absolute -top-7 left-1/2 size-4 -translate-x-1/2 cursor-grab touch-none rounded-full border-[1.5px] border-emerald-500 bg-white shadow-sm before:absolute before:inset-1 before:rounded-full before:bg-emerald-500 active:cursor-grabbing"
      />
    </div>
  );
}
