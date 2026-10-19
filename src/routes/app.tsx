import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BookOpenText, LogOut, Settings } from "lucide-react";
import { getSessionUser, logout } from "../server/auth";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return { user };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link to="/app/weeks" className="flex items-center gap-2 font-semibold">
            <BookOpenText className="size-5" />
            Log Book Magang
          </Link>
          <nav className="ml-4 flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/app/weeks">Weeks</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/app/settings">
                <Settings /> Settings
              </Link>
            </Button>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout();
                await navigate({ to: "/login" });
              }}
            >
              <LogOut /> Log out
            </Button>
          </div>
        </div>
        <Separator />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
