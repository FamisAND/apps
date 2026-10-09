function headers(env){if(!env.GITHUB_TOKEN)throw new Error('Server GitHub credential missing');return {Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','User-Agent':'FullTrainingGateway','X-GitHub-Api-Version':'2022-11-28'};}
function endpoint(env,path){if(!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO||''))throw new Error('Invalid repository');return 'https://api.github.com/repos/'+env.GITHUB_REPO+'/'+path;}
function decode(value){return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0)));}
function encode(value){const bytes=new TextEncoder().encode(value);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
export async function readData(env){
  const result=await fetch(endpoint(env,'contents/data.json?ref='+encodeURIComponent(env.GITHUB_BRANCH||'main')),{headers:headers(env),cache:'no-store'});
  if(!result.ok)throw new Error('Cannot read remote data');
  const metadata=await result.json();
  let base64=metadata.content;
  if(!base64){const blob=await fetch(endpoint(env,'git/blobs/'+metadata.sha),{headers:headers(env),cache:'no-store'});if(!blob.ok)throw new Error('Cannot read data blob');base64=(await blob.json()).content;}
  const content=JSON.parse(decode(base64));
  if(!content||Array.isArray(content)||typeof content!=='object')throw new Error('Invalid remote data');
  return {content,sha:metadata.sha};
}
export async function writeSection(env,section,value,expectedSha){
  const remote=await readData(env);
  if(!expectedSha||remote.sha!==expectedSha)return {conflict:true};
  const content={...remote.content,[section]:value,lastUpdate:new Date().toISOString()};
  const result=await fetch(endpoint(env,'contents/data.json'),{method:'PUT',headers:{...headers(env),'Content-Type':'application/json'},body:JSON.stringify({message:'sync: session gateway '+section,branch:env.GITHUB_BRANCH||'main',sha:expectedSha,content:encode(JSON.stringify(content,null,2))})});
  if([409,422].includes(result.status))return {conflict:true};
  if(!result.ok)throw new Error('Remote write failed');
  return {sha:(await result.json()).content.sha};
}
