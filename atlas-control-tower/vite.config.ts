import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiBase = env.NEXO_API_BASE_URL || env.VITE_NEXO_API_BASE_URL || '';
  return {
    define: { __NEXO_API_BASE_URL__: JSON.stringify(apiBase) },
    build:{
      outDir:'dist',
      emptyOutDir:true,
      sourcemap:false,
      target:'es2022',
      cssCodeSplit:true
    },
    server:{
      host:'0.0.0.0',
      port:4173,
      proxy: apiBase ? {
        '/api': { target: apiBase, changeOrigin: true, secure: true }
      } : undefined
    }
  };
});
