import {fileURLToPath} from 'node:url';
import {buildAssets} from './asset-builder.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=fileURLToPath(new URL('./public',import.meta.url));
await buildAssets({root,output});
console.log('Static allowlist built; no Excel, backup, data.json, Git history or secret files included.');
