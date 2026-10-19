import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route for /app/weeks — renders either the weeks index (list) or the
// $weekId detail page. Kept separate so the list page is an index child and
// does not swallow the detail route.
export const Route = createFileRoute("/app/weeks")({
  component: () => <Outlet />,
});
