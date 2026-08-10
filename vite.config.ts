import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// mode "store" e usado pelo scripts/store-build.mjs, que ja retirou
// fisicamente src/routes/admin.tsx e src/lib/admin-storage.ts antes
// deste config correr.
export default defineConfig(({ mode }) => ({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "src/routes",
      generatedRouteTree: "src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  build: {
    outDir: mode === "store" ? "dist-store" : "dist",
    // APK menor e mais rápido
    target: "es2015",
    minify: true,
    cssMinify: true,
    // Dividir em chunks para carregamento mais rápido
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("/react/")) {
              return "vendor-react";
            }
            if (id.includes("@tanstack/react-router")) {
              return "vendor-router";
            }
            if (id.includes("@supabase/supabase-js")) {
              return "vendor-supabase";
            }
            if (
              id.includes("@radix-ui/react-dialog") ||
              id.includes("@radix-ui/react-select") ||
              id.includes("@radix-ui/react-tabs")
            ) {
              return "vendor-ui";
            }
          }
        },
        // Nomes de chunk legíveis
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  // Otimizações de dev
  server: {
    port: 3000,
    host: true,
  },
  // Resolve @ alias
  resolve: {
    alias: {
      "@": "/src",
    },
  },
}));
