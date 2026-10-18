import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativo: o build funciona em qualquer subcaminho (ex.: GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react()],
});
