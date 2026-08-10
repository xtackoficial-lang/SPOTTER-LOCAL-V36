import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/map")({
  beforeLoad: () => {
    throw redirect({ to: "/home" });
  },
  component: () => null,
});
