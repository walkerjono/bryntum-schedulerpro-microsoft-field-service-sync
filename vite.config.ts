import { defineConfig } from 'vitest/config';
import { consoleForwardPlugin } from 'vite-console-forward-plugin';

export default defineConfig({
    plugins : [
        consoleForwardPlugin() // forwards browser console.* to the terminal during dev
    ],
    build : {
        rollupOptions : {
            output : {
                manualChunks(id) {
                    if (!id.includes('node_modules')) {
                        return undefined;
                    }

                    if (id.includes('@bryntum/')) {
                        return 'bryntum';
                    }

                    if (id.includes('@azure/msal-browser')) {
                        return 'msal';
                    }

                    return 'vendor';
                }
            }
        }
    },
    test : {
        environment : 'jsdom',
        globals     : true,
        setupFiles  : ['./src/test/setup.ts']
    }
});