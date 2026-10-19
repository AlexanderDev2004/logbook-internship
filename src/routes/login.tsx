import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
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
import { hasAccount, getSessionUser, login, register, resetPassword } from "../server/auth";

interface RegisterFields {
  name: string;
  studentName: string;
  studentNim: string;
  studyProgram: string;
  partnerName: string;
  fieldSupervisorName: string;
  academicAdvisorName: string;
}

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (user) throw redirect({ to: "/app/weeks" });
    return { hasAccount: await hasAccount() };
  },
  component: LoginPage,
});

function LoginPage() {
  const { hasAccount: exists } = Route.useRouteContext() as unknown as {
    hasAccount: boolean;
  };
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">(
    exists ? "login" : "register",
  );
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [reg, setReg] = useState<RegisterFields>({
    name: "",
    studentName: "",
    studentNim: "",
    studyProgram: "Sarjana Terapan Teknik Informatika",
    partnerName: "",
    fieldSupervisorName: "",
    academicAdvisorName: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await login({ data: { identifier, password } });
      } else {
        await register({
          data: { email: identifier, password, ...reg },
        });
      }
      await navigate({ to: "/app/weeks" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async () => {
    setBusy(true);
    setError(null);
    setResetMessage(null);
    try {
      const res = await resetPassword({ data: { identifier } });
      setResetMessage(
        `Password berhasil direset. Sekarang login dengan NIM ${res.nim} sebagai password.`,
      );
      setPassword("");
      setResetOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const field = (
    label: string,
    key: keyof RegisterFields,
    placeholder = "",
  ) => (
    <div className="grid gap-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={reg[key]}
        placeholder={placeholder}
        onChange={(e) => setReg({ ...reg, [key]: e.target.value })}
        required
      />
    </div>
  );

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Log Book Magang</CardTitle>
          <CardDescription>
            {mode === "login"
              ? "Sign in to manage your internship log book."
              : "Create the owner account for this instance."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            {mode === "register" && (
              <>
                {field("Your name", "name", "Alexander Agung Raya")}
                {field("Student name (on PDF)", "studentName")}
                {field("NIM", "studentNim")}
                {field("Program studi", "studyProgram")}
                {field("Nama mitra", "partnerName")}
                {field("Pembimbing Lapangan", "fieldSupervisorName")}
                {field("Dosen Pembimbing", "academicAdvisorName")}
              </>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="email">{mode === "login" ? "Email atau NIM" : "Email"}</Label>
              <Input
                id="email"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">
                {mode === "login" ? "Password" : "Password (min. 8 characters)"}
              </Label>
              <Input
                id="password"
                type="password"
                minLength={mode === "register" ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {resetMessage && <p className="text-sm text-green-600">{resetMessage}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
            {mode === "login" && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                {resetOpen ? (
                  <div className="grid gap-2">
                    <p>
                      Reset password untuk{" "}
                      <span className="font-medium">{identifier || "(isi email/NIM dulu)"}</span>?
                      Password akan diubah menjadi NIM kamu yang terdaftar.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={busy || !identifier.trim()}
                        onClick={submitReset}
                      >
                        Ya, reset password
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => setResetOpen(false)}
                      >
                        Batal
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="underline"
                    disabled={busy}
                    onClick={() => setResetOpen(true)}
                  >
                    Lupa password?
                  </button>
                )}
              </div>
            )}
            {exists && (
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setMode(mode === "login" ? "register" : "login")}
                >
                  {mode === "login" ? "Create one" : "Sign in"}
                </button>
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
