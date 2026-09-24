import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 4000,
  },
});
