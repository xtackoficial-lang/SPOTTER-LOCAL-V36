import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
const root = process.cwd();
export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.join(root, "src") } },
  server: { port: 5199, strictPort: true },
});
