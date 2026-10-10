import {fileURLToPath} from 'node:url';
import {buildAssets} from './asset-builder.mjs';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=fileURLToPath(new URL('./public',import.meta.url));
await build({entryPoints:[fileURLToPath(new URL('./src/ui-icons-entry.mjs',import.meta.url))],bundle:true,minify:true,format:'iife',outfile:fileURLToPath(new URL('../session-icons.js',import.meta.url))});
await buildAssets({root,output});
console.log('Static allowlist built; no Excel, backup, data.json, Git history or secret files included.');
