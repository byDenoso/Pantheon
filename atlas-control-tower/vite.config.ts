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
      cssCodeSplit:true,
      chunkSizeWarningLimit:1200,
      rollupOptions:{
        input:{
          index:'index.html',
          atlasV3:'atlas-v3/index.html'
        },
        output:{
          manualChunks(id){
            if(id.includes('@react-three')||id.includes('/three/'))return 'three-stack';
            if(id.includes('react-dom')||id.includes('/react/'))return 'react-stack';
            if(id.includes('gsap'))return 'motion-stack';
          }
        }
      }
    },
    server:{
      host:'0.0.0.0',
      port:4173,
      proxy:apiBase?{
        '/api':{target:apiBase,changeOrigin:true,secure:true}
      }:undefined
    }
  };
});
