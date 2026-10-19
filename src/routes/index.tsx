import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSessionUser } from "../server/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const user = await getSessionUser();
    throw redirect({ to: user ? "/app/weeks" : "/login" });
  },
  component: () => null,
});
