import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fetchYahoo } from './scripts/quotes.mjs';

// base relativo: o build funciona em qualquer subcaminho (ex.: GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      // no dev, quotes/<TICKER>.json vem direto do Yahoo (no build, o CI gera os arquivos)
      name: 'quotes-dev',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const m = (req as { url?: string }).url?.match(/\/quotes\/([A-Z0-9]+)\.json(\?|$)/);
          if (!m) return next();
          try {
            const q = await fetchYahoo(m[1]);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(q));
          } catch (e) {
            res.statusCode = 404;
            res.end(JSON.stringify({ message: (e as Error).message }));
          }
        });
      },
    },
  ],
});
