import { compilePdf } from "./compile";
import { generateLogBookTyp, type TypstSettings, type TypstWeek } from "./generate";
import { getPdfData } from "../../server/weeks";

export interface PdfWeek {
  label: string;
  entries: Array<{
    entryDate: string;
    clockIn: string;
    clockOut: string;
    activity: string;
  }>;
  signatures: Record<
    string,
    { signerName?: string | null; signaturePng?: string | null; status: string }
  >;
}

export async function downloadWeeksPdf(weekIds: string[]): Promise<void> {
  const data = await getPdfData({ data: { weekIds } });
  const settings: TypstSettings = data.settings;
  const weeks: TypstWeek[] = data.weeks.map((w) => ({
    entries: w.entries,
    signatures: w.signatures as TypstWeek["signatures"],
  }));

  const { source, files } = await generateLogBookTyp(settings, weeks);
  const bytes = await compilePdf(source, files);

  const blob = new Blob([bytes as unknown as BlobPart], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    weekIds.length === 1
      ? `LogBook_${data.weeks[0]?.label ?? "week"}.pdf`
      : `LogBook_All.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
