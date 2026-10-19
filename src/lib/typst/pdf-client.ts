import { compilePdf } from "./compile";
import {
  generateLogBookTyp,
  DEFAULT_SIGNATURE_LAYOUT,
  type SignatureLayout,
  type TypstSettings,
  type TypstWeek,
} from "./generate";
import { getPdfData, getPdfDataByToken } from "../../server/weeks";

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

export interface PdfPayload {
  settings: TypstSettings;
  weeks: TypstWeek[];
  label?: string;
}

async function payloadToBlob(payload: PdfPayload, layout?: SignatureLayout): Promise<Blob> {
  const { source, files } = await generateLogBookTyp(
    payload.settings,
    payload.weeks,
    layout ?? DEFAULT_SIGNATURE_LAYOUT,
  );
  const bytes = await compilePdf(source, files);
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

/** Compile the current data to a PDF and return a blob URL for in-app preview. */
export async function previewWeeksPdf(
  weekIds: string[],
  layout?: SignatureLayout,
): Promise<string> {
  const data = await getPdfData({ data: { weekIds } });
  const blob = await payloadToBlob({ settings: data.settings, weeks: data.weeks }, layout);
  return URL.createObjectURL(blob);
}

export async function downloadWeeksPdf(
  weekIds: string[],
  layout?: SignatureLayout,
): Promise<void> {
  const data = await getPdfData({ data: { weekIds } });
  const blob = await payloadToBlob({ settings: data.settings, weeks: data.weeks }, layout);
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

/** Token-authed preview for signers (advisor / field supervisor). */
export async function previewWeeksPdfByToken(
  token: string,
  layout?: SignatureLayout,
): Promise<string> {
  const data = await getPdfDataByToken({ data: { token } });
  const blob = await payloadToBlob(data, layout);
  return URL.createObjectURL(blob);
}

/** Token-authed download for signers. */
export async function downloadWeeksPdfByToken(
  token: string,
  layout?: SignatureLayout,
): Promise<void> {
  const data = await getPdfDataByToken({ data: { token } });
  const blob = await payloadToBlob(data, layout);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `LogBook_${data.weeks[0]?.label ?? "week"}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
