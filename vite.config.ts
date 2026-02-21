import { defineConfig } from "vite";
import { consoleForwardPlugin } from "vite-console-forward-plugin";

export default defineConfig({
  plugins: [
    consoleForwardPlugin(), // forwards browser console.* to the terminal during dev
  ],
});