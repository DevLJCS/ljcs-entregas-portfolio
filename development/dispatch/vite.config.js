import {defineConfig} from 'vite';
export default defineConfig({root:'development/dispatch',base:'./',publicDir:false,server:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'/api':'http://127.0.0.1:8787'}},build:{outDir:'../../outputs/dispatch-preview',emptyOutDir:true}});
