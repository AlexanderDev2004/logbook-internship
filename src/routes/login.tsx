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
import { hasAccount, getSessionUser, login, register } from "../server/auth";

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
  const [email, setEmail] = useState("");
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await login({ data: { email, password } });
      } else {
        await register({
          data: { email, password, ...reg },
        });
      }
      await navigate({ to: "/app/weeks" });
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
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password (min. 8 characters)</Label>
              <Input
                id="password"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
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
