import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface SignatureCanvasProps {
  value: string | null; // PNG data url
  onChange: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
}

// Draw with pointer events; export as transparent PNG trimmed to content.
export function SignatureCanvas({
  value,
  onChange,
  width = 480,
  height = 180,
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(null);
  }, [onChange]);

  // Restore an existing signature image (e.g. edit mode).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setHasInk(true);
    };
    img.src = value;
  }, [value]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  };

  const stroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const p = pos(e);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (last.current) {
      ctx.moveTo(last.current.x, last.current.y);
    } else {
      ctx.moveTo(p.x, p.y);
    }
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width,
      minY = canvas.height,
      maxX = 0,
      maxY = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] > 8) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return;
    const pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(canvas.width - 1, maxX + pad);
    maxY = Math.min(canvas.height - 1, maxY + pad);
    const out = document.createElement("canvas");
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out
      .getContext("2d")!
      .drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    onChange(out.toDataURL("image/png"));
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={width * 2}
        height={height * 2}
        style={{ width, height, touchAction: "none" }}
        className="rounded-md border bg-white cursor-crosshair"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = null;
          stroke(e);
        }}
        onPointerMove={(e) => {
          if (drawing.current) stroke(e);
        }}
        onPointerUp={() => {
          if (drawing.current) {
            drawing.current = false;
            last.current = null;
            setHasInk(true);
            exportImage();
          }
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clear}
          disabled={!hasInk}
        >
          <Eraser /> Clear
        </Button>
      </div>
    </div>
  );
}
