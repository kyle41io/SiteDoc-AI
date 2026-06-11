import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Resolve the "@/*" -> "src/*" alias from tsconfig natively (Vite 6+).
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Unit/component tests don't need real CSS processing; treat CSS as empty
    // so Tailwind v4 / PostCSS isn't pulled into the test runtime.
    css: false,
  },
});
