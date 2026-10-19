import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import alchemy from "alchemy/cloudflare/tanstack-start";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  server: { port: 3000 },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    react(),
    alchemy(),
    // "cloudflare:workers" is a real module only inside the workerd runtime.
    // The SSR/worker build must keep it external (alchemy deploys with
    // noBundle: true), but the client build must never ship it: server-fn
    // modules keep their module-level "./env" import after handler stripping,
    // so the browser would otherwise try to fetch "cloudflare:workers" as a
    // script (404 + CORS on the deployed site).
    {
      name: "cloudflare-workers-client-shim",
      configEnvironment(name) {
        if (name === "client") return {};
        return {
          build: {
            rollupOptions: {
              external: [/^cloudflare:/],
            },
          },
        };
      },
      resolveId(source) {
        if (this.environment?.name === "client" && source === "cloudflare:workers") {
          return path.resolve(process.cwd(), "src/shims/cloudflare-workers.ts");
        }
        return null;
      },
    },
  ],
});
