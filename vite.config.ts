import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fetchCdi, fetchIpca, fetchYahoo } from './scripts/quotes.mjs';

// base relativo: o build funciona em qualquer subcaminho (ex.: GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      // no dev, quotes/<TICKER>.json e rates/{cdi,ipca}.json são buscados na hora (no build, o CI gera os arquivos)
      name: 'quotes-dev',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = (req as { url?: string }).url ?? '';
          const quote = url.match(/\/quotes\/([A-Z0-9]+)\.json(\?|$)/);
          const rate = url.match(/\/rates\/(cdi|ipca)\.json(\?|$)/);
          if (!quote && !rate) return next();
          try {
            const q = quote ? await fetchYahoo(quote[1]) : rate![1] === 'cdi' ? await fetchCdi() : await fetchIpca();
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
