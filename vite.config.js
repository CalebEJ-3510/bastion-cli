import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    ssr: true,
    outDir: 'dist',
    rollupOptions: {
      input: 'src/cli.tsx',
    },
    ssrEmitAssets: false,
    commonjsOptions: {
      include: [/node_modules/],
    },
    target: 'node18',
    minify: false,
  },
});
