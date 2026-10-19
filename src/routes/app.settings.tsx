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
import {
  getSettings,
  listAiModels,
  saveAiConfig,
  saveStudentSignature,
  testAiConnection,
  updateSettings,
} from "../server/settings-fns";

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
  const [sigBusy, setSigBusy] = useState(false);
  const [sigSaved, setSigSaved] = useState(false);
  const stampInput = useRef<HTMLInputElement | null>(null);

  const pickStamp = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => set("companyStampPng", String(reader.result));
    reader.readAsDataURL(file);
  };

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
        setSigSaved(true);
      }
      setSaved(true);
      await router.invalidate();
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const saveSignature = async () => {
    setSigBusy(true);
    setSigSaved(false);
    try {
      await saveStudentSignature({ data: { signaturePng: sigPng } });
      setSigSaved(true);
      await router.invalidate();
    } catch (e) {
      alert(String((e as Error).message));
    } finally {
      setSigBusy(false);
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
                <Label>Stempel perusahaan (opsional)</Label>
                <p className="text-xs text-muted-foreground">
                  PNG stempel perusahaan mitra — muncul di samping tanda tangan
                  Pembimbing Lapangan pada PDF. Kosongkan jika tidak dipakai.
                </p>
                <div className="flex items-center gap-3">
                  {form.companyStampPng && (
                    <img
                      src={form.companyStampPng}
                      alt="stempel"
                      className="h-20 rounded border bg-white object-contain p-1"
                    />
                  )}
                  <input
                    ref={stampInput}
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && pickStamp(e.target.files[0])}
                  />
                  <Button variant="outline" size="sm" onClick={() => stampInput.current?.click()}>
                    Upload stempel…
                  </Button>
                  {form.companyStampPng && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => set("companyStampPng", null)}
                    >
                      Hapus
                    </Button>
                  )}
                </div>
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
                individually from the week page. Draw it, then press{" "}
                <strong>Save signature</strong> — it is only stored when you do.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <SignatureCanvas value={sigPng} onChange={(png) => { setSigPng(png); setSigSaved(false); }} />
              <div className="flex items-center justify-end gap-3">
                {sigSaved && (
                  <span className="text-sm text-muted-foreground">
                    Signature saved ✓
                  </span>
                )}
                <Button onClick={() => void saveSignature()} disabled={sigBusy}>
                  <Save /> {sigBusy ? "Saving…" : "Save signature"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="pt-4">
          <AiSettings
            initialBaseUrl={form.aiBaseUrl ?? ""}
            initialModel={form.aiModel ?? ""}
            hasKey={form.hasAiKey ?? false}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const AI_PRESETS: Array<{ label: string; baseUrl: string; hint: string }> = [
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", hint: "ratusan model, satu key" },
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", hint: "gpt-4o-mini, dst." },
  { label: "Anthropic (Claude)", baseUrl: "https://api.anthropic.com/v1", hint: "endpoint kompatibel [OI]" },
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", hint: "cepat & murah" },
  { label: "OpenCode Zen", baseUrl: "https://opencode.ai/zen/v1", hint: "gateway OpenCode" },
  { label: "Custom", baseUrl: "", hint: "endpoint apa pun yang kompatibel [OI]" },
];

function AiSettings({
  initialBaseUrl,
  initialModel,
  hasKey,
}: {
  initialBaseUrl: string;
  initialModel: string;
  hasKey: boolean;
}) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [model, setModel] = useState(initialModel);
  const [apiKey, setApiKey] = useState("");
  const [keyDirty, setKeyDirty] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "save" | "test" | "models">("");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const activePreset = AI_PRESETS.find((p) => p.baseUrl !== "" && p.baseUrl === baseUrl);
  const keySet = hasKey || (keyDirty && apiKey.length > 0);

  const save = async () => {
    setBusy("save");
    setStatus(null);
    try {
      await saveAiConfig({
        data: { baseUrl, model, apiKey: keyDirty ? apiKey : "" },
      });
      setApiKey("");
      setKeyDirty(false);
      setStatus({ kind: "ok", text: "AI configuration saved." });
    } catch (e) {
      setStatus({ kind: "err", text: String((e as Error).message ?? e) });
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setBusy("test");
    setStatus(null);
    try {
      const r = await testAiConnection();
      setStatus({ kind: "ok", text: `Connected — model ${r.model} replied: “${r.sample}”` });
    } catch (e) {
      setStatus({ kind: "err", text: String((e as Error).message ?? e) });
    } finally {
      setBusy("");
    }
  };

  const loadModels = async () => {
    setBusy("models");
    setStatus(null);
    try {
      const r = await listAiModels();
      setModels(r.models);
      setStatus({ kind: "ok", text: `${r.models.length} models available.` });
    } catch (e) {
      setStatus({ kind: "err", text: String((e as Error).message ?? e) });
    } finally {
      setBusy("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI text refinement</CardTitle>
        <CardDescription>
          Bring your own key — OpenRouter, OpenAI, Claude, Groq, OpenCode Zen, or any
          [OI]-compatible endpoint. The key is stored server-side and never sent to
          the browser again.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-1.5">
          {AI_PRESETS.map((p) => (
            <Button
              key={p.label}
              type="button"
              size="sm"
              variant={activePreset?.label === p.label ? "default" : "outline"}
              title={p.hint}
              onClick={() => {
                setBaseUrl(p.baseUrl);
                if (p.baseUrl === "") setBaseUrl(initialBaseUrl || "https://");
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="aiBaseUrl">Base URL</Label>
          <Input
            id="aiBaseUrl"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://openrouter.ai/api/v1"
          />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="aiModel">Model</Label>
            <Button type="button" size="sm" variant="ghost" onClick={loadModels} disabled={busy !== "" || !baseUrl || !keySet}>
              {busy === "models" ? "Loading…" : "Load model list"}
            </Button>
          </div>
          <Input
            id="aiModel"
            list="ai-model-options"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="anthropic/claude-haiku-4.5"
          />
          <datalist id="ai-model-options">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">
            Type a model id, or load the list your provider offers (needs a saved key).
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="aiKey">API key {keySet && <span className="text-xs text-muted-foreground">(saved)</span>}</Label>
          <Input
            id="aiKey"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setKeyDirty(true);
            }}
            placeholder={hasKey ? "•••••••• (saved — type to replace)" : "sk-..."}
            autoComplete="off"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={save} disabled={busy !== "" || !baseUrl || !model}>
            Save AI config
          </Button>
          <Button variant="outline" onClick={test} disabled={busy !== "" || !baseUrl || !model}>
            {busy === "test" ? "Testing…" : "Test connection"}
          </Button>
        </div>

        {status && (
          <p className={status.kind === "ok" ? "text-sm text-green-600" : "text-sm text-destructive"}>
            {status.text}
          </p>
        )}

        <Separator className="my-1" />
        <p className="text-sm text-muted-foreground">
          After saving, use “Refine with AI” on a week page to polish every activity
          description into concise, professional Indonesian — keeping all technical
          terms.
        </p>
      </CardContent>
    </Card>
  );
}
