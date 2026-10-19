// Client-side Typst compilation to PDF via WASM.
import {
  createTypstCompiler,
  CompileFormatEnum,
  type TypstCompiler,
} from "@myriaddreamin/typst.ts/compiler";
import { loadFonts } from "@myriaddreamin/typst.ts/options.init";
// The compiler WASM is ~27 MB, which exceeds Cloudflare Workers' 25 MB
// per-file static asset limit, so it is loaded from a pinned CDN build of the
// same package version instead of being bundled with the app.
const COMPILER_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/typst_ts_web_compiler_bg.wasm";

const FONT_FILES = [
  "/fonts/LiberationSerif-Regular.ttf",
  "/fonts/LiberationSerif-Bold.ttf",
  "/fonts/Carlito-Regular.ttf",
  "/fonts/Carlito-Bold.ttf",
];

let compilerPromise: Promise<TypstCompiler> | null = null;

async function getCompiler(): Promise<TypstCompiler> {
  if (!compilerPromise) {
    compilerPromise = (async () => {
      const c = createTypstCompiler();
      await c.init({
        getModule: () => COMPILER_WASM_URL,
        beforeBuild: [loadFonts(FONT_FILES)],
      });
      return c;
    })();
  }
  return compilerPromise;
}

export async function compilePdf(
  source: string,
  files: Record<string, Uint8Array>,
): Promise<Uint8Array> {
  const c = await getCompiler();
  c.resetShadow();
  for (const [path, bytes] of Object.entries(files)) {
    c.mapShadow(path, bytes);
  }
  c.addSource("/main.typ", source);
  const res = await c.compile({
    mainFilePath: "/main.typ",
    format: CompileFormatEnum.pdf,
    diagnostics: "unix",
  });
  if (!res.result) {
    const diags = Array.isArray(res.diagnostics)
      ? res.diagnostics.join("\n")
      : String(res.diagnostics ?? "unknown error");
    throw new Error(`Typst compilation failed:\n${diags}`);
  }
  return res.result;
}
