import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Standalone dev: proxy /api → MERN server :4000.
// mode=embed: static build into Pink frontend/public/org-embed (same origin → shared localStorage with Pink admin).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const embed = mode === 'embed';

  return {
    plugins: [react()],
    // Prefer .ts/.tsx over .js so stray compiled/stale .js files never shadow sources.
    resolve: {
      extensions: ['.ts', '.tsx', '.jsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json'],
    },
    base: embed ? '/org-embed/' : '/',
    build: embed
      ? {
          outDir: path.resolve(__dirname, '../../frontend/public/org-embed'),
          emptyOutDir: true,
        }
      : undefined,
    // Use dedicated globals so the Pink embed branch is not folded to false when
    // import.meta.env.* injection order conflicts with define (dead code then drops
    // accessToken + /api/v1/org/* and requests hit Vite → HTML → JSON parse errors).
    define: {
      __PINK_ORG_EMBED__: JSON.stringify(embed),
      __PINK_API_BASE__: JSON.stringify(
        embed ? env.VITE_API_BASE_URL || '' : '',
      ),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:4000',
          changeOrigin: true,
        },
      },
    },
    envDir: __dirname,
  };
});
