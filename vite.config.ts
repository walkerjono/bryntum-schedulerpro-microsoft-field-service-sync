import { defineConfig } from "vitest/config";
import { consoleForwardPlugin } from "vite-console-forward-plugin";

export default defineConfig({
  plugins: [
    consoleForwardPlugin(), // forwards browser console.* to the terminal during dev
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
  },
});