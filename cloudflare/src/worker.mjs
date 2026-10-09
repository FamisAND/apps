import {verifyIdentity} from './access.mjs';
import {MODULES,SECTION_MODULE,FILE_MODULE,COMMON_FILES,canAccess,publicUser,filterData,validateSection} from './policy.mjs';
import {readData,writeSection} from './github.mjs';
import {listRecords,recordHistory,commitRecords} from './records.mjs';
import {isPhotoNamespace} from './media-format.mjs';
import {loadPrivateSettings,publicAiConfig,saveAiSettings,AI_PROVIDERS} from './private-settings.mjs';
import {aiText} from './ai-proxy.mjs';
const COOKIE='__Host-ft_session';
const now=()=>Math.floor(Date.now()/1000);
const securityHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'};
function json(value,status=200,extra={}){return new Response(JSON.stringify(value),{status,headers:{...securityHeaders,'Content-Type':'application/json',...extra}});}
function fail(status,message){const e=new Error(message);e.status=status;throw e;}
function csrf(request){if(request.headers.get('Origin')!==new URL(request.url).origin)fail(403,'Origen no autorizado');}
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
// Access returns from another site; safe top-level navigation must carry the session.
function cookie(token,maxAge=28800){return `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;}
function nextPage(url){const next=url.searchParams.get('next')||'/index.html';return /^\/[a-z_\-]+\.html$/.test(next)?next:'/index.html';}
function sessionUnavailable(url){
  const retry='/auth/start?next='+encodeURIComponent(nextPage(url));
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sesion no disponible</title></head><body style="margin:0;background:#15191e;color:#fff;font:15px sans-serif"><main style="max-width:560px;margin:15vh auto;padding:24px"><h1 style="font-size:22px">No se ha podido abrir la sesion</h1><p>El navegador no ha enviado una sesion valida. No se han cargado ni modificado tus datos.</p><a href="${retry}" style="color:#8dcef1">Reintentar acceso</a></main></body></html>`,{status:401,headers:{...securityHeaders,'Content-Type':'text/html;charset=utf-8'}});
}
function tokenFrom(request){return (request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);}
async function body(request){
  const limit=15*1024*1024;
  if(Number(request.headers.get('Content-Length'))>limit)fail(413,'Peticion demasiado grande');
  if(!request.body)fail(400,'JSON invalido');
  const reader=request.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail(413,'Peticion demasiado grande');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch(_e){fail(400,'JSON invalido');}
}
async function audit(env,actor,action,target){await env.AUTH_DB.prepare('INSERT INTO audit VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,target,now()).run();}
async function getSession(request,env,identity){
  const token=tokenFrom(request);if(!token||! /^[a-f0-9]{64}$/.test(token))fail(401,'Inicia sesion');
  const row=await env.AUTH_DB.prepare('SELECT s.id AS session_id,s.session_version AS issued_version,s.expires_at,s.last_seen,s.revoked,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?').bind(await digest(token)).first();
  if(!row||row.revoked||!row.active||row.expires_at<=now()||row.last_seen<now()-1800||row.issued_version!==row.session_version||row.email!==identity.email)fail(401,'Sesion caducada o revocada');
  if(now()-row.last_seen>=30)await env.AUTH_DB.prepare('UPDATE sessions SET last_seen=? WHERE id=? AND revoked=0').bind(now(),row.session_id).run();
  return {...publicUser(row),sessionId:row.session_id};
}
export function createWorker(dependencies={}){
  const identify=dependencies.verifyIdentity||verifyIdentity;
  return {async fetch(request,env){
    try{
      const url=new URL(request.url),pathname=url.pathname;
      if(!env.AUTH_DB)fail(503,'Base de sesiones no configurada');
      let identity;try{identity=await identify(request,env);}catch(_e){fail(403,'Acceso central no verificado');}
      if(pathname==='/auth/start'){
        if(request.method!=='GET')fail(405,'Metodo no permitido');
        const existing=await env.AUTH_DB.prepare('SELECT * FROM users WHERE email=?').bind(identity.email).first();
        if(!existing&&identity.email===env.ADMIN_EMAIL?.toLowerCase()){
          await env.AUTH_DB.prepare("INSERT OR IGNORE INTO users (id,email,name,role,active,permissions,created_at) VALUES (?,?,?,'admin',1,'[]',?)").bind('root-admin',identity.email,'Sergio',now()).run();
        }
        const user=await env.AUTH_DB.prepare('SELECT * FROM users WHERE email=?').bind(identity.email).first();
        if(!user||!user.active)fail(403,'Usuario no autorizado');
        if(identity.iat<=user.reauth_after)fail(401,'Vuelve a identificarte en Cloudflare Access para abrir otra sesion');
        const token=[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
        const expires=Math.min(now()+28800,identity.exp);
        await env.AUTH_DB.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,0)').bind(await digest(token),user.id,user.session_version,now(),now(),expires).run();
        return new Response(null,{status:303,headers:{...securityHeaders,Location:'/auth/complete?next='+encodeURIComponent(nextPage(url)),'Set-Cookie':cookie(token,expires-now())}});
      }
      let user;
      try{user=await getSession(request,env,identity);}catch(e){
        // A rejected cookie gets an explicit error, never another automatic login.
        if(e.status===401&&pathname==='/auth/complete')return sessionUnavailable(url);
        const isPage=pathname==='/'||pathname.endsWith('.html')&&(COMMON_FILES.has(pathname.slice(1))||FILE_MODULE[pathname.slice(1)]);
        if(e.status===401 && request.method==='GET'&&isPage)return new Response(null,{status:303,headers:{...securityHeaders,Location:'/auth/start?next='+encodeURIComponent(pathname)}});
        throw e;
      }
      if(pathname==='/auth/complete'){
        if(request.method!=='GET')fail(405,'Metodo no permitido');
        return new Response(null,{status:303,headers:{...securityHeaders,Location:nextPage(url)}});
      }
      if(pathname==='/api/session')return json({user:{...user,repo:env.GITHUB_REPO},modules:MODULES,heartbeatSeconds:25,dataMode:env.RECORDS_ENABLED==='true'?'records':'legacy',writesEnabled:env.DATA_WRITES_ENABLED==='true'});
      if(pathname==='/api/logout'){
        if(request.method!=='POST')fail(405,'Metodo no permitido');csrf(request);
        await env.AUTH_DB.prepare('UPDATE sessions SET revoked=1 WHERE id=?').bind(user.sessionId).run();
        return json({ok:true},200,{'Set-Cookie':cookie('',0)});
      }
      if(pathname==='/api/settings/ai'||pathname==='/api/ai/text'){
        if(!canAccess(user,'training_online'))fail(403,'Configuracion de Consulta no autorizada');
        if(env.RECORDS_ENABLED!=='true')fail(423,'Configuracion central en preparacion');
        const dataDB=env.DATA_DB?.withSession?env.DATA_DB.withSession('first-primary'):env.DATA_DB;
        if(pathname==='/api/settings/ai'&&request.method==='GET'){
          const saved=await loadPrivateSettings(dataDB,env.ACTIVE_DATASET_ID,env.SETTINGS_ENCRYPTION_KEY);return json({version:saved.version,cfg:publicAiConfig(saved.value)});
        }
        if(request.method!=='POST')fail(405,'Metodo no permitido');csrf(request);
        if(env.DATA_WRITES_ENABLED!=='true')fail(423,'Cambios y llamadas IA desactivados hasta validar el traslado');
        if(pathname==='/api/settings/ai'){
          if(user.role!=='admin')fail(403,'Solo administracion puede cambiar claves o reglas');
          return json(await saveAiSettings(dataDB,env.ACTIVE_DATASET_ID,env.SETTINGS_ENCRYPTION_KEY,user.id,await body(request)));
        }
        const value=await body(request);
        if(!AI_PROVIDERS.includes(value.provider))fail(400,'Proveedor de IA no admitido');
        const rate=await env.AUTH_DB.prepare("INSERT INTO audit SELECT ?,?,'ai-call',?,? WHERE (SELECT count(*) FROM audit WHERE actor_id=? AND action='ai-call' AND created_at>?)<10").bind(crypto.randomUUID(),user.id,String(value.provider||''),now(),user.id,now()-60).run();
        if(!rate.meta?.changes&&!rate.changes)fail(429,'Limite temporal de IA; espera un minuto antes de reintentar');
        const saved=await loadPrivateSettings(dataDB,env.ACTIVE_DATASET_ID,env.SETTINGS_ENCRYPTION_KEY);
        return json({text:await aiText(saved.value,value,{admin:user.role==='admin',fetchImpl:dependencies.aiFetch||globalThis.fetch})});
      }
      if(pathname.startsWith('/api/records/')){
        const match=pathname.match(/^\/api\/records\/([\w]+)(\/(commit|history))?$/);
        if(!match)fail(404,'Ruta de registros inexistente');
        const namespace=match[1],module=SECTION_MODULE[namespace]||(isPhotoNamespace(namespace)?'training_online':null);
        if(!module||!canAccess(user,module))fail(403,'Registros no autorizados');
        if(env.RECORDS_ENABLED!=='true')fail(423,'Almacenamiento por registros en preparacion');
        const dataDB=env.DATA_DB?.withSession?env.DATA_DB.withSession('first-primary'):env.DATA_DB;
        if(!match[3]&&request.method==='GET')return json(await listRecords(dataDB,env.ACTIVE_DATASET_ID,namespace,url.searchParams.get('cursor')||'',url.searchParams.has('generation')?Number(url.searchParams.get('generation')):null));
        if(match[3]==='history'&&request.method==='GET')return json(await recordHistory(dataDB,env.ACTIVE_DATASET_ID,namespace,url.searchParams.get('key'),url.searchParams.has('before')?Number(url.searchParams.get('before')):Number.MAX_SAFE_INTEGER));
        if(match[3]==='commit'&&request.method==='POST'){
          csrf(request);
          if(env.DATA_WRITES_ENABLED!=='true')fail(423,'Escrituras reales desactivadas hasta validar el traslado');
          return json(await commitRecords(dataDB,env.ACTIVE_DATASET_ID,namespace,user.id,await body(request)));
        }
        fail(405,'Metodo de registros no permitido');
      }
      if(pathname.startsWith('/api/admin/')){
        if(user.role!=='admin')fail(403,'Solo administracion');
        if(pathname==='/api/admin/users'&&request.method==='GET'){
          const result=await env.AUTH_DB.prepare('SELECT * FROM users ORDER BY created_at,email').all();return json({users:result.results.map(publicUser)});
        }
        if(pathname==='/api/admin/sessions'&&request.method==='GET'){
          const result=await env.AUTH_DB.prepare('SELECT s.id,u.name,u.email,s.created_at,s.last_seen,s.expires_at,s.revoked,(s.session_version=u.session_version AND u.active=1) AS valid_version FROM sessions s JOIN users u ON u.id=s.user_id ORDER BY s.last_seen DESC LIMIT 200').all();return json({sessions:result.results});
        }
        if(pathname==='/api/admin/audit'&&request.method==='GET')return json(await env.AUTH_DB.prepare('SELECT * FROM audit ORDER BY created_at DESC LIMIT 100').all());
        csrf(request);
        if(pathname==='/api/admin/users'&&request.method==='POST'){
          const value=await body(request),email=String(value.email||'').trim().toLowerCase(),name=String(value.name||'').trim();
          if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<1||name.length>100||email===env.ADMIN_EMAIL?.toLowerCase())fail(400,'Usuario invalido');
          const permissions=value.permissions||[];if(!Array.isArray(permissions)||permissions.some(p=>!MODULES[p]))fail(400,'Permisos invalidos');
          if(await env.AUTH_DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first())fail(409,'Ya existe un usuario con ese correo');
          const id=crypto.randomUUID();
          await env.AUTH_DB.prepare("INSERT INTO users (id,email,name,role,permissions,created_at) VALUES (?,?,?,'user',?,?)").bind(id,email,name,JSON.stringify([...new Set(permissions)]),now()).run();await audit(env,user.id,'create-user',id);return json({id},201);
        }
        const match=pathname.match(/^\/api\/admin\/users\/([\w-]+)(\/revoke)?$/);
        if(match&&['PATCH','POST'].includes(request.method)){
          if(request.method!==(match[2]?'POST':'PATCH'))fail(405,'Metodo no permitido');
          const target=await env.AUTH_DB.prepare('SELECT * FROM users WHERE id=?').bind(match[1]).first();if(!target)fail(404,'Usuario inexistente');
          if(target.id===user.id||target.id==='root-admin')fail(400,'El administrador principal no se puede desactivar ni expulsar desde aqui');
          if(match[2]){
            await env.AUTH_DB.prepare('UPDATE users SET session_version=session_version+1,reauth_after=? WHERE id=?').bind(now(),target.id).run();await audit(env,user.id,'revoke-sessions',target.id);return json({ok:true});
          }
          const value=await body(request);const permissions=value.permissions??JSON.parse(target.permissions);
          if(!Array.isArray(permissions)||permissions.some(p=>!MODULES[p])||!['user','admin'].includes(value.role??target.role)||typeof(value.active??!!target.active)!=='boolean')fail(400,'Permisos invalidos');
          await env.AUTH_DB.prepare('UPDATE users SET role=?,active=?,permissions=?,session_version=session_version+1,reauth_after=? WHERE id=?').bind(value.role??target.role,value.active===undefined?target.active:Number(value.active),JSON.stringify([...new Set(permissions)]),now(),target.id).run();await audit(env,user.id,'update-user',target.id);return json({ok:true});
        }
        fail(404,'Operacion administrativa no disponible');
      }
      if(pathname==='/api/data'&&request.method==='GET'){
        if(env.RECORDS_ENABLED==='true')fail(410,'El cliente antiguo no puede cargar datos del sistema migrado');
        const remote=await readData(env);return json({sha:remote.sha,content:filterData(remote.content,user)});
      }
      if(pathname.startsWith('/api/data/')&&request.method==='PUT'){
        if(env.RECORDS_ENABLED==='true')fail(410,'El guardado de secciones completas queda desactivado en el sistema migrado');
        csrf(request);const section=decodeURIComponent(pathname.slice(10));
        if(!SECTION_MODULE[section]||!canAccess(user,SECTION_MODULE[section]))fail(403,'Seccion no autorizada');
        if(env.DATA_WRITES_ENABLED!=='true')fail(423,'Escrituras reales desactivadas hasta validar el despliegue');
        const value=await body(request);try{validateSection(section,value.section);}catch(_e){fail(400,'Datos de seccion invalidos');}
        const result=await writeSection(env,section,value.section,value.sha);
        if(result.conflict)return json({error:'conflict'},409);await audit(env,user.id,'write-section',section);return json(result);
      }
      if(pathname.startsWith('/api/'))fail(404,'API inexistente');
      const file=pathname==='/'?'index.html':pathname.slice(1);
      if(!COMMON_FILES.has(file)&&!FILE_MODULE[file])fail(404,'Archivo no publicado');
      if(FILE_MODULE[file]&&!canAccess(user,FILE_MODULE[file]))fail(403,'Modulo no autorizado');
      const recordPage=env.RECORDS_ENABLED==='true'&&file.endsWith('.html')&&file!=='session-admin.html';
      if(recordPage&&request.headers.get('X-FT-Prepared')!=='records-v1'){
        return new Response('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Full Training</title><script src="/app-session.js"></script></head><body style="margin:0;background:#15191e;color:#fff;font:15px sans-serif"><main style="max-width:600px;margin:15vh auto;padding:24px"><h1 style="font-size:22px">Cargando datos verificados</h1><p id="ftLoadMessage" role="status">Comprobando sesion y copias conservadas...</p><button id="ftLoadRetry" hidden onclick="location.reload()">Reintentar</button> <button id="ftLoadExport" hidden>Exportar copia conservada</button></main><script type="module" src="/record-loader.mjs"></script></body></html>',{headers:{...securityHeaders,'Content-Type':'text/html;charset=utf-8'}});
      }
      const response=await env.ASSETS.fetch(new Request(new URL('/'+file,url),request));
      const secured=new Response(response.body,response);for(const [key,value]of Object.entries(securityHeaders))secured.headers.set(key,value);
      if(file.endsWith('.html')&&!recordPage)return new HTMLRewriter().on('head',{element(element){element.prepend('<script src="/app-session.js"></script>',{html:true});}}).transform(secured);
      return secured;
    }catch(error){return json({error:error.status?error.message:'No se ha completado la operacion'},error.status||503);}
  }};
}
export default createWorker();
