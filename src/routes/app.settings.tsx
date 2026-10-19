import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import { Save } from "lucide-react";
import { getSettings, saveStudentSignature, updateSettings } from "../server/settings-fns";

export const Route = createFileRoute("/app/settings")({
  loader: () => getSettings(),
  component: SettingsPage,
});

type Settings = NonNullable<Awaited<ReturnType<typeof getSettings>>>;

function SettingsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [form, setForm] = useState<Settings | null>(data);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const logoInput = useRef<HTMLInputElement | null>(null);
  const [sigPng, setSigPng] = useState<string | null>(
    data?.studentSignaturePng ?? null,
  );

  if (!form) {
    return <p className="text-muted-foreground">Settings not found.</p>;
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm({ ...form, [key]: value });

  const listField = (
    label: string,
    key: "institutionLines" | "subLines" | "titleLines",
    hint: string,
  ) => (
    <div className="grid gap-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Textarea
        id={key}
        rows={4}
        value={form[key].join("\n")}
        onChange={(e) => set(key, e.target.value.split("\n").filter((l) => l !== ""))}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  const pickLogo = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => set("logoPng", String(reader.result));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      await updateSettings({ data: { ...form, studentSignaturePng: null } });
      if (sigPng !== (data?.studentSignaturePng ?? null)) {
        await saveStudentSignature({ data: { signaturePng: sigPng } });
      }
      setSaved(true);
      await router.invalidate();
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
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Everything here can be customized; the PDF is generated from these values.
          </p>
        </div>
        <Button onClick={save} disabled={busy}>
          <Save /> {busy ? "Saving…" : saved ? "Saved" : "Save changes"}
        </Button>
      </div>

      <Tabs defaultValue="identity">
        <TabsList>
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="document">Document</TabsTrigger>
          <TabsTrigger value="signature">Signature</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Student &amp; partners</CardTitle>
              <CardDescription>Shown in the info table of every page.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sn">Nama</Label>
                <Input id="sn" value={form.studentName} onChange={(e) => set("studentName", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nim">NIM</Label>
                <Input id="nim" value={form.studentNim} onChange={(e) => set("studentNim", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sp">Program Studi</Label>
                <Input id="sp" value={form.studyProgram} onChange={(e) => set("studyProgram", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pn">Nama Mitra</Label>
                <Input id="pn" value={form.partnerName} onChange={(e) => set("partnerName", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fs">Pembimbing Lapangan (field supervisor)</Label>
                <Input id="fs" value={form.fieldSupervisorName} onChange={(e) => set("fieldSupervisorName", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="aa">Dosen Pembimbing (academic advisor)</Label>
                <Input id="aa" value={form.academicAdvisorName} onChange={(e) => set("academicAdvisorName", e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="document" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Letterhead &amp; layout</CardTitle>
              <CardDescription>
                One line per row. Line 1–2 render at 14pt, line 3 normal, line 4 bold.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label>Header logo</Label>
                <div className="flex items-center gap-3">
                  {form.logoPng && (
                    <img src={form.logoPng} alt="logo" className="h-16 rounded border bg-white p-1" />
                  )}
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && pickLogo(e.target.files[0])}
                  />
                  <Button variant="outline" size="sm" onClick={() => logoInput.current?.click()}>
                    Upload PNG…
                  </Button>
                </div>
              </div>
              {listField("Institution lines", "institutionLines", "e.g. ministry, university, faculty")}
              {listField("Address lines", "subLines", "Small print under the header")}
              {listField("Title lines", "titleLines", "Bold, centered below the rule")}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="fh">Heading font</Label>
                  <select
                    id="fh"
                    className="h-9 rounded-md border bg-transparent px-3 text-sm"
                    value={form.fontHeading}
                    onChange={(e) => set("fontHeading", e.target.value as Settings["fontHeading"])}
                  >
                    <option>Times New Roman</option>
                    <option>Calibri</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="fb">Body font</Label>
                  <select
                    id="fb"
                    className="h-9 rounded-md border bg-transparent px-3 text-sm"
                    value={form.fontBody}
                    onChange={(e) => set("fontBody", e.target.value as Settings["fontBody"])}
                  >
                    <option>Times New Roman</option>
                    <option>Calibri</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Bundled as metric-compatible Liberation Serif and Carlito.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signature" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Your signature</CardTitle>
              <CardDescription>
                Optional: reuse this signature on every week, or sign each week
                individually from the week page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignatureCanvas value={sigPng} onChange={setSigPng} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>AI text refinement</CardTitle>
              <CardDescription>
                The API key is configured server-side as a secret, never exposed to
                the browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p>
                Set these three secrets / variables on the server (Alchemy or
                <code> .dev.vars </code> locally):
              </p>
              <ul className="list-disc pl-5">
                <li>
                  <code>AI_API_KEY</code> — your API key
                </li>
                <li>
                  <code>AI_BASE_URL</code> — default{" "}
                  <code>https://api.openai.com/v1</code> (any [OI]-compatible
                  endpoint works: OpenRouter, Groq, …)
                </li>
                <li>
                  <code>AI_MODEL</code> — default <code>gpt-4o-mini</code>
                </li>
              </ul>
              <Separator className="my-2" />
              <p className="text-muted-foreground">
                After saving your activities, use “Refine with AI” on a week page to
                polish every activity description into concise, professional
                Indonesian — keeping all technical terms.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
