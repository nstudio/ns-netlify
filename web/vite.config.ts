import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite';

const webRoot = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [react()];
  // The mock is imported lazily so production builds never load or bundle it.
  if (command === 'serve' && process.env.MOCK === '1') {
    const { mockApi } = await import('./dev/mock-api.ts');
    plugins.push(mockApi());
  }
  return {
    root: webRoot,
    plugins,
    server: { fs: { allow: [repoRoot] } },
    build: {
      outDir: fileURLToPath(new URL('./dist', import.meta.url)),
      emptyOutDir: true,
      target: 'es2022',
      // MapLibre is a single chunk loaded only by the map views.
      chunkSizeWarningLimit: 1200,
    },
  };
});
