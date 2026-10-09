import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export function inspectRelease(files,diff){
  const forbiddenPaths=files.filter(file=>/(^|\/)(node_modules|\.wrangler|public|\.full-training-backups)(\/|$)|(^|\/)data\.json$|\.(local|private)\.json$|(^|\/)\.dev\.vars$|\.(png|jpg|pdf|xlsx|zip|sqlite)$/.test(file));
  const secretLikeValueFound=/ghp_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|"oauth_token"\s*:\s*"[^"]+"|sk-ant-[A-Za-z0-9_-]{20,}/.test(diff);
  return {stagedFiles:files.length,forbiddenPaths,secretLikeValueFound};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const files=execFileSync('git',['diff','--cached','--name-only'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  const diff=execFileSync('git',['diff','--cached'],{encoding:'utf8',maxBuffer:16*1024*1024});
  const result=inspectRelease(files,diff);console.log(JSON.stringify(result,null,2));
  if(result.forbiddenPaths.length||result.secretLikeValueFound)process.exitCode=1;
}
