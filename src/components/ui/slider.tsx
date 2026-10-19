import { cn } from "@/lib/utils";

// Dependency-free slider with the same value API as the shadcn/radix one:
// <Slider min={0} max={10} step={0.5} value={[4]} onValueChange={(v) => ...} />
export function Slider({
  min,
  max,
  step = 1,
  value,
  onValueChange,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  min: number;
  max: number;
  step?: number;
  value: number[];
  onValueChange: (value: number[]) => void;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value[0] ?? min}
      onChange={(e) => onValueChange([Number(e.target.value)])}
      className={cn(
        "h-2 w-full cursor-pointer appearance-none rounded-full bg-primary/20 accent-primary",
        "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
        className,
      )}
      {...props}
    />
  );
}
