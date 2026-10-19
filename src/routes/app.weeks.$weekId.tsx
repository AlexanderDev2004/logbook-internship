import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Copy, FileDown, Plus, Sparkles, Trash2 } from "lucide-react";
import { downloadWeeksPdf, previewWeeksPdf } from "@/lib/typst/pdf-client";
import { GitImport } from "@/components/GitImport";
import { PdfPreview } from "@/components/PdfPreview";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import {
  deleteEntry,
  getSignatureImages,
  getWeek,
  refineWeekActivities,
  resetSignature,
  saveEntry,
  signWeek,
} from "../server/weeks";

export const Route = createFileRoute("/app/weeks/$weekId")({
  loader: ({ params }) => getWeek({ data: { id: params.weekId } }),
  component: WeekDetailPage,
});

const ROLE_LABELS: Record<string, string> = {
  student: "Mahasiswa (you)",
  field_supervisor: "Pembimbing Lapangan",
  academic_advisor: "Dosen Pembimbing",
};

function WeekDetailPage() {
  const params = Route.useParams();
  const data = Route.useLoaderData();
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [clockIn, setClockIn] = useState("09:00");
  const [clockOut, setClockOut] = useState("17:00");
  const [activity, setActivity] = useState("");
  const [signerName, setSignerName] = useState("");
  const [sigPng, setSigPng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) {
    return <p className="text-muted-foreground">Week not found.</p>;
  }

  const signedByOthers = data.signatures.some(
    (s) => s.role !== "student" && s.status === "signed",
  );

  const refresh = () => router.invalidate();

  const addEntry = async () => {
    setBusy(true);
    try {
      await saveEntry({
        data: { weekId: data.week.id, entryDate: date, clockIn, clockOut, activity },
      });
      setActivity("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const refineAll = async () => {
    setBusy(true);
    try {
      const r = await refineWeekActivities({ data: { weekId: data.week.id } });
      if (!r.ok) {
        alert(r.error);
      } else {
        await refresh();
      }
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const signAsStudent = async () => {
    const sig = data.signatures.find((s) => s.role === "student");
    if (!sig || !sigPng || !signerName) return;
    setBusy(true);
    try {
      await signWeek({ data: { token: sig.token, signerName, signaturePng: sigPng } });
      setSigPng(null);
      await refresh();
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/app/weeks" className="text-sm text-muted-foreground hover:underline">
            â† All weeks
          </Link>
          <h1 className="text-xl font-semibold">{data.week.label}</h1>
        </div>
        <div className="flex gap-2">
          <PdfPreview
            label="PDF"
            buildPdf={(layout) => previewWeeksPdf([data.week.id], layout)}
            downloadPdf={(layout) => downloadWeeksPdf([data.week.id], layout)}
            loadImages={() => getSignatureImages({ data: { weekId: data.week.id } })}
          />
          <Button
            variant="outline"
            onClick={() => downloadWeeksPdf([data.week.id]).catch((e) => alert(String(e.message ?? e)))}
          >
            <FileDown /> Download PDF
          </Button>
        </div>
      </div>

      {signedByOthers && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This week has been signed by a supervisor or advisor â€” you can still
          edit the entries, but the signatures will stay as they are until they
          are reset.
        </p>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Activities</CardTitle>
            <CardDescription>
              One row per day, exactly as they will appear in the PDF.
            </CardDescription>
          </div>
          {data.entries.length > 0 && (
            <Button variant="secondary" size="sm" onClick={refineAll} disabled={busy}>
              <Sparkles /> Refine all with AI
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{e.entryDate}</TableCell>
                  <TableCell>{e.clockIn}</TableCell>
                  <TableCell>{e.clockOut}</TableCell>
                  <TableCell>
                    {e.activity}
                    {e.aiRefined && (
                      <Badge variant="secondary" className="ml-2">
                        AI
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {(
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          await deleteEntry({ data: { id: e.id } });
                          await refresh();
                        }}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {data.entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No entries yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {(
            <>
              <Separator />
              <div className="grid gap-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="edate">Date</Label>
                    <Input
                      id="edate"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ein">Clock in</Label>
                    <Input
                      id="ein"
                      type="time"
                      value={clockIn}
                      onChange={(e) => setClockIn(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="eout">Clock out</Label>
                    <Input
                      id="eout"
                      type="time"
                      value={clockOut}
                      onChange={(e) => setClockOut(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="eactivity">Activity</Label>
                  <Textarea
                    id="eactivity"
                    value={activity}
                    placeholder="What did you work on? e.g. menambahkan sistem stage Pawn Duo"
                    onChange={(e) => setActivity(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <GitImport
                    weekId={data.week.id}
                    startDate={data.week.startDate}
                    onImported={refresh}
                  />
                  <Button onClick={addEntry} disabled={busy || !activity.trim()}>
                    <Plus /> Add entry
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signatures</CardTitle>
          <CardDescription>
            Sign the week yourself, then share the private links with your supervisors.
            Each link works once, for one signature.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-4">
            {data.signatures.map((s) => (
              <div
                key={s.role}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="grid gap-0.5">
                  <span className="font-medium">{ROLE_LABELS[s.role] ?? s.role}</span>
                  <span className="text-sm text-muted-foreground">
                    {s.status === "signed"
                      ? `Signed by ${s.signerName}`
                      : "Waiting for signature"}
                  </span>
                </div>
                <div className="flex gap-2">
                  {s.status === "pending" && s.role !== "student" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const url = `${window.location.origin}/sign/${s.token}`;
                        navigator.clipboard.writeText(url);
                        alert("Signing link copied:\n" + url);
                      }}
                    >
                      <Copy /> Copy link
                    </Button>
                  )}
                  {s.status === "signed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await resetSignature({ data: { weekId: data.week.id, role: s.role } });
                        await refresh();
                      }}
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {data.signatures.find((s) => s.role === "student")?.status !== "signed" && (
            <>
              <Separator />
              <div className="grid max-w-lg gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="sname">Sign as (full name)</Label>
                  <Input
                    id="sname"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Your name as it should appear"
                  />
                </div>
                <Label>Draw your signature</Label>
                <SignatureCanvas value={sigPng} onChange={setSigPng} />
                <Button onClick={signAsStudent} disabled={busy || !sigPng || !signerName}>
                  Sign this week
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

