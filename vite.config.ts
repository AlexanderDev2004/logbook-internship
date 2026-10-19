import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import alchemy from "alchemy/cloudflare/tanstack-start";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: { port: 3000 },
  // cloudflare:workers is provided by the workerd runtime at deploy time
  // (alchemy deploys the server bundle with noBundle: true), so it must stay
  // external in the SSR build instead of being resolved at bundle time.
  build: {
    rollupOptions: {
      external: [/^cloudflare:/],
    },
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    react(),
    alchemy(),
  ],
});
