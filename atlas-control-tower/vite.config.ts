import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir=fileURLToPath(new URL('.',import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions:{
      input:{
        main:resolve(rootDir,'index.html'),
        atlasV3:resolve(rootDir,'atlas-v3/index.html')
      },
      output: {
        manualChunks(id) {
          if (id.includes('@react-three') || id.includes('/three/')) return 'three-stack';
          if (id.includes('react-dom') || id.includes('/react/')) return 'react-stack';
          if (id.includes('gsap')) return 'motion-stack';
        }
      }
    }
  }
});
