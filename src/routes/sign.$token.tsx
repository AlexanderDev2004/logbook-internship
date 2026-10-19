import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import { PdfPreview } from "@/components/PdfPreview";
import { PenLine } from "lucide-react";
import { previewWeeksPdfByToken, downloadWeeksPdfByToken } from "@/lib/typst/pdf-client";
import { getSignRequest, signWeek } from "../server/weeks";

export const Route = createFileRoute("/sign/$token")({
  loader: ({ params }) => getSignRequest({ data: { token: params.token } }),
  component: SignPage,
});

const ROLE_TITLES: Record<string, { title: string; sub: string }> = {
  field_supervisor: {
    title: "Field Supervisor signature",
    sub: "Pembimbing Lapangan",
  },
  academic_advisor: {
    title: "Academic Advisor signature",
    sub: "Dosen Pembimbing",
  },
  student: { title: "Student signature", sub: "Mahasiswa" },
};

function SignPage() {
  const { token } = Route.useParams();
  const data = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [png, setPng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data) {
    return (
      <Shell>
        <p className="text-destructive">Invalid signing link.</p>
      </Shell>
    );
  }

  const role = data.role;
  const meta = ROLE_TITLES[role] ?? { title: role, sub: "" };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signWeek({ data: { token, signerName: name, signaturePng: png! } });
      await router.invalidate();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const week = data.week;
  const setting = data.setting;

  return (
    <Shell>
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {meta.title} — week {week?.label}
              </CardTitle>
              <CardDescription>{meta.sub}</CardDescription>
            </div>
            {data.status === "signed" ? (
              <Badge variant="success">signed</Badge>
            ) : (
              <Badge variant="warning">pending</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {data.week && (
            <PdfPreview
              label="PDF"
              buildPdf={(layout) => previewWeeksPdfByToken(token, layout)}
              downloadPdf={(layout) => downloadWeeksPdfByToken(token, layout)}
            />
          )}
          {setting && week && (
            <div className="rounded-md border p-3 text-sm">
              <p>
                <span className="font-medium">{setting.studentName}</span> ({setting.studentNim}) —{" "}
                {setting.studyProgram}
              </p>
              <p className="text-muted-foreground">Mitra: {setting.partnerName}</p>
              <ul className="mt-2 list-disc pl-5">
                {data.entries.map((e) => (
                  <li key={e.id}>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {e.entryDate} {e.clockIn}–{e.clockOut}:
                    </span>{" "}
                    {e.activity}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.status === "signed" ? (
            <p className="text-sm text-emerald-700">
              Already signed by {data.signatures[role]?.signerName}. Thank you!
            </p>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="sn2">Full name</Label>
                <Input
                  id="sn2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Draw your signature</Label>
                <SignatureCanvas value={png} onChange={setPng} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={submit} disabled={busy || !png || !name.trim()}>
                <PenLine /> Sign
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      {children}
    </div>
  );
}
