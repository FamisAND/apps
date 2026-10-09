import {mkdir,readdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {FILE_MODULE,COMMON_FILES,RECORD_FILES} from './src/policy.mjs';

export async function buildAssets({root,output}){
  const files=new Set([...Object.keys(FILE_MODULE),...COMMON_FILES]);
  await mkdir(output,{recursive:true});
  const existing=await readdir(output,{withFileTypes:true});
  if(existing.some(file=>!files.has(file.name)||!file.isFile()))throw new Error('Unexpected file in generated assets; publication stopped. Preserve and inspect the directory, do not clean it automatically.');
  for(const file of files)await copyFile(path.join(RECORD_FILES.has(file)?path.join(root,'cloudflare','src'):root,file),path.join(output,file));
  return files.size;
}
