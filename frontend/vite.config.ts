import { defineConfig, loadEnv } from "vite";

// Em desenvolvimento, as chamadas /api vão para o servidor Node (porta 3000).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  return {
    base: mode === "github" ? "/escola-notifica-o/" : "/",
    define: {
      "import.meta.env.VITE_DEMO_MODE": JSON.stringify(
        mode === "demo" || mode === "github" ? "true" : "false",
      ),
    },
    server: {
      port: 5173,
      proxy: { "/api": env.VITE_API_PROXY_TARGET || "http://localhost:3000" },
    },
    build: { outDir: "dist" },
  };
});
