import {defineConfig} from 'vite';
export default defineConfig({publicDir:'public-extra',envDir:false as unknown as string,build:{target:'es2022',sourcemap:false,outDir:'dist/client'},server:{host:'127.0.0.1'}});
