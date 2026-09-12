import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${process.env.LOCALSIMDASH_PORT || 4317}` },
    watch: { ignored: ['**/.localsimdash/**', '**/dist/**'] }
  },
  test: {
    // Only the TypeScript sources are the source of truth. Build output under
    // dist-server/ and release/ contains compiled copies of these same tests,
    // which otherwise run again against stale, already-superseded assertions.
    include: ['server/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'dist/**', 'dist-server/**', 'release*/**']
  }
});
