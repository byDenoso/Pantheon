import { defineConfig } from 'vite';

export default defineConfig({
  build:{
    outDir:'dist',
    emptyOutDir:true,
    sourcemap:true,
    target:'es2022',
    cssCodeSplit:true
  },
  server:{
    host:'0.0.0.0',
    port:4173,
    proxy:{
      '/api':{
        target:'https://nexo-atlas-control-tower.vercel.app',
        changeOrigin:true,
        secure:true
      }
    }
  }
});
