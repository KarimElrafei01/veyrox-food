import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Workspace packages resolve through pnpm's symlinks and their package `exports`;
// Vite transpiles their TypeScript source directly (no build step).
export default defineConfig({
  plugins: [react()],
  server: { port: 3004 },
});
