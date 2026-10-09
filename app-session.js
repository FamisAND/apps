(function(){
'use strict';
let user=null,active=false,locked=false,dataMode='legacy',writesEnabled=false;
const sections={training:'full_training.html',training_online:'consulta.html',options:'options.html',patrimonio:'patrimonio.html',facturas:'facturas.html'};
function permitted(section){return active && (user.role==='admin'||user.permissions.includes(section));}
function lock(message){
  locked=true;
  active=false;
  if(window.GitHubSync?.suspend)window.GitHubSync.suspend();
  const render=()=>{
    if(document.getElementById('ftSessionLock'))return;
    const shield=document.createElement('div');shield.id='ftSessionLock';shield.style.cssText='position:fixed;inset:0;background:#121619;color:#fff;z-index:200000;display:flex;align-items:center;justify-content:center;font:15px sans-serif';
    const box=document.createElement('div');box.style.cssText='max-width:480px;padding:24px';
    const heading=document.createElement('h2');heading.textContent='Sesion no disponible';box.appendChild(heading);
    const text=document.createElement('p');text.textContent=message;box.appendChild(text);
    const copy=document.createElement('button');copy.textContent='Exportar cambios locales';copy.onclick=()=>window.FTRecords?.exportDownload?window.FTRecords.exportDownload():window.GitHubSync?.exportSafetyCopy();box.appendChild(copy);
    const login=document.createElement('a');login.href='/cdn-cgi/access/logout';login.textContent='Volver a identificarme';login.style.cssText='display:block;margin-top:20px;color:#80c5ff';box.appendChild(login);
    shield.appendChild(box);document.body.appendChild(shield);
  };
  if(document.body)render();else document.addEventListener('DOMContentLoaded',render,{once:true});
}
async function check(){
  const response=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok){
    const message=response.status===401?'La sesion ha caducado o se ha revocado.':response.status===403?'No se ha podido verificar tu acceso.':'El servicio de sesiones no esta disponible (HTTP '+response.status+').';
    throw new Error(message+' Tus datos locales se conservan.');
  }
  const result=await response.json();
  if(user&&user.id!==result.user?.id)throw new Error('La identidad ha cambiado. No se mezclaran datos de usuarios.');
  user=result.user;dataMode=result.dataMode||'legacy';writesEnabled=!!result.writesEnabled;active=!locked;return result;
}
const ready=check().then(result=>{
  const owner=localStorage.getItem('__ft_session_owner');
  if(owner && owner!==user.id)throw new Error('Este perfil de Chrome contiene datos de otro usuario. Utiliza un perfil separado; no se borrara informacion.');
  localStorage.setItem('__ft_session_owner',user.id);
  return result;
}).catch(error=>{lock(error.message);throw error;});
ready.catch(()=>{});
window.FTSession={ready,get user(){return user;},get active(){return active;},get dataMode(){return dataMode;},get writesEnabled(){return writesEnabled;},decorate,refresh:()=>check().catch(error=>{lock(error.message);throw error;}),
  async requireSection(section){await ready;if(!permitted(section)){lock('No tienes permiso para este modulo.');throw new Error('Modulo no autorizado');}},
  async logout(){
    await ready;
    if(window.GitHubSync?.hasPendingChanges()&&!confirm('Hay cambios pendientes. Se conservaran localmente. Exporta una copia antes de cerrar si necesitas recuperarlos. ¿Cerrar sesion?'))return;
    if(window.GitHubSync)await GitHubSync.preserve('before-logout','editor',window.ghEditorSnapshot?window.ghEditorSnapshot():{});
    const response=await fetch('/api/logout',{method:'POST',credentials:'same-origin'});
    if(!response.ok)throw new Error('No pude cerrar la sesion.');
    active=false;location.href='/cdn-cgi/access/logout';
  },permitted};
function decorate(){
  if(!user||document.getElementById('ftSessionBar'))return;
  document.querySelectorAll('a[href]').forEach(link=>{
    const file=link.getAttribute('href').split('?')[0].replace(/^\.\//,'');
    const section=Object.keys(sections).find(key=>sections[key]===file);
    if(section&&!permitted(section))link.hidden=true;
  });
  const bar=document.createElement('div');bar.id='ftSessionBar';bar.style.cssText='position:fixed;bottom:10px;left:12px;right:12px;z-index:100003;display:flex;flex-wrap:wrap;gap:12px;align-items:center;font:12px sans-serif;background:#15191e;color:#eee;padding:8px;border-radius:4px';
  const name=document.createElement('span');name.textContent=user.name;bar.appendChild(name);
  if(user.role==='admin'){const admin=document.createElement('a');admin.href='session-admin.html';admin.textContent='Usuarios y sesiones';admin.style.color='#8dcef1';bar.appendChild(admin);}
  const logout=document.createElement('button');logout.textContent='Cerrar sesion';logout.onclick=()=>window.FTSession.logout().catch(error=>alert(error.message));bar.appendChild(logout);document.body.appendChild(bar);
}
ready.then(()=>{
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate,{once:true});else decorate();
  setInterval(()=>check().catch(error=>lock(error.message)),25000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check().catch(error=>lock(error.message));});
}).catch(()=>{});
})();
