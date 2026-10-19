// Verifies the generated Typst source compiles to a valid PDF using the same
// WASM compiler the browser uses. Run: node --experimental-strip-types scripts/compile-check.mjs
import fs from "node:fs";
import { createTypstCompiler } from "@myriaddreamin/typst.ts/compiler";
import { loadFonts } from "@myriaddreamin/typst.ts/options.init";
import { generateLogBookTyp } from "../src/lib/typst/generate.ts";

const fontBuf = (p) => new Uint8Array(fs.readFileSync(p));
const dataUrl = (p) =>
  "data:image/png;base64," + fs.readFileSync(p).toString("base64");

const settings = {
  studentName: "Alexander Agung Raya",
  studentNim: "2341720040",
  studyProgram: "Sarjana Terapan Teknik Informatika",
  partnerName: "PT. Studio Karya Semesta",
  logoPng: dataUrl("public/img/polinema-header-logo.png"),
  institutionLines: [
    "KEMENTERIAN PENDIDIKAN TINGGI, SAINS,",
    "DAN TEKNOLOGI",
    "POLITEKNIK NEGERI MALANG",
    "JURUSAN TEKNOLOGI INFORMASI",
  ],
  subLines: [
    "Jalan Soekarno Hatta Nomor 9 Jatimulyo, Lowokwaru, Malang 65141",
    "Telepon (0341) 404424, 404425, Faksimile (0341) 404420",
    "Laman www.polinema.ac.id",
  ],
  titleLines: ["LOG BOOK KEGIATAN", "PROGRAM MAGANG KAMPUS MERDEKA"],
  fontHeading: "Times New Roman",
  fontBody: "Calibri",
  fieldSupervisorName: "Muhammad Ali Zulfikar",
  academicAdvisorName: "Rokhimatul Wakhidah, S.Pd., M.T.",
  studentSignaturePng: null,
};

// Real entries from LogBook_26_07_w2.typ
const weeks = [
  {
    entries: [
      { entryDate: "2026-07-06", clockIn: "09:00", clockOut: "17:00", activity: "menambahkan sistem stage Pawn Duo" },
      { entryDate: "2026-07-07", clockIn: "09:00", clockOut: "17:00", activity: "memperbaiki trigger victory Duo Pawn serta menambahkan konfigurasi level dan integrasi DuoStageManager" },
      { entryDate: "2026-07-08", clockIn: "09:00", clockOut: "17:00", activity: "me-refactor sistem duo pawn menjadi duo piece" },
      { entryDate: "2026-07-09", clockIn: "09:00", clockOut: "17:00", activity: "memperbaiki validasi scene loading, pengaturan build android, serta menambah dan mendesain ulang level puzzle board 3-2 sampai 3-6" },
      { entryDate: "2026-07-10", clockIn: "09:00", clockOut: "17:00", activity: "memperbaiki layout main menu dan selection canvas" },
      { entryDate: "2026-07-11", clockIn: "09:00", clockOut: "17:00", activity: "menambahkan LevelSelectionCanvas dan WorldSelectionCanvas serta memperbaiki responsive layout dan crash transisi level" },
    ],
    signatures: {},
  },
  {
    entries: [
      { entryDate: "2026-07-13", clockIn: "08:30", clockOut: "16:30", activity: "setting CI/CD pipeline #2 [test]" },
    ],
    signatures: {
      student: { signerName: "Alexander Agung Raya", signaturePng: dataUrl("public/img/polinema-header-logo.png") },
    },
  },
];

const { source, files } = await generateLogBookTyp(settings, weeks);
fs.mkdirSync(".amp/in/artifacts", { recursive: true });
fs.writeFileSync(".amp/in/artifacts/check-main.typ", source);
console.log(`Generated main.typ (${source.length} bytes), ${Object.keys(files).length} images`);

const compiler = createTypstCompiler();
await compiler.init({
  getModule: () =>
    fs.readFileSync(
      "node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm",
    ),
  beforeBuild: [
    loadFonts([
      fontBuf("public/fonts/LiberationSerif-Regular.ttf"),
      fontBuf("public/fonts/LiberationSerif-Bold.ttf"),
      fontBuf("public/fonts/Carlito-Regular.ttf"),
      fontBuf("public/fonts/Carlito-Bold.ttf"),
    ]),
  ],
});

for (const [path, bytes] of Object.entries(files)) compiler.mapShadow(path, bytes);
compiler.addSource("/main.typ", source);

const res = await compiler.compile({
  mainFilePath: "/main.typ",
  format: 1, // CompileFormatEnum.pdf
  diagnostics: "unix",
});

if (!res.result) {
  console.error("COMPILE FAILED:\n" + (res.diagnostics ?? ""));
  process.exit(1);
}

fs.writeFileSync(".amp/in/artifacts/check-output.pdf", res.result);
const header = Buffer.from(res.result.slice(0, 5)).toString();
const pages = (Buffer.from(res.result).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
console.log(`OK: ${header}, ${res.result.length} bytes, ~${pages} pages -> .amp/in/artifacts/check-output.pdf`);
