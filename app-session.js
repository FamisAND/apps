(function(){
'use strict';
let user=null,active=false,locked=false,dataMode='legacy',writesEnabled=false,session=null,activityAt=0,lastSent=0,sending=false,verifyingExpiry=false;
const sections={training:'full_training.html',training_online:'consulta.html',options:'options.html',patrimonio:'patrimonio.html',facturas:'facturas.html'};
function permitted(section){return active&&(user.role==='admin'||user.permissions.includes(section));}
function ui(){
  if(!document.getElementById('ftSessionStyles')){const link=document.createElement('link');link.id='ftSessionStyles';link.rel='stylesheet';link.href='/session-ui.css';document.head.appendChild(link);}
  if(!document.getElementById('ftSessionIcons')){const script=document.createElement('script');script.id='ftSessionIcons';script.src='/session-icons.js';document.head.appendChild(script);}
}
function icon(name){const slot=document.createElement('span');slot.className='ft-icon';slot.dataset.ftIcon=name;slot.setAttribute('aria-hidden','true');return slot;}
function control(tag,label,name){const node=document.createElement(tag);node.className='ft-tool';node.title=label;node.setAttribute('aria-label',label);node.append(icon(name));return node;}
async function preserveEditor(){if(window.GitHubSync?.preserve&&window.ghEditorSnapshot)await window.GitHubSync.preserve('session-lock','editor',window.ghEditorSnapshot());}
function lock(message){
  if(locked)return;
  locked=true;active=false;
  if(window.GitHubSync?.suspend)window.GitHubSync.suspend();
  preserveEditor().catch(()=>{});
  const render=()=>{
    if(document.getElementById('ftSessionLock'))return;ui();
    document.getElementById('ftSessionWarning')?.remove();
    const shield=document.createElement('div');shield.id='ftSessionLock';shield.className='ft-session-lock';
    const box=document.createElement('section');box.className='ft-session-lock-box';
    const heading=document.createElement('h2');heading.textContent='Sesion cerrada';box.appendChild(heading);
    const text=document.createElement('p');text.textContent=message;box.appendChild(text);
    const actions=document.createElement('div');actions.className='ft-actions';
    const copy=document.createElement('button');copy.className='ft-button';copy.textContent='Exportar cambios locales';copy.onclick=()=>Promise.resolve(window.FTRecords?.exportDownload?window.FTRecords.exportDownload():window.GitHubSync?.exportSafetyCopy()).catch(error=>text.textContent=error.message);actions.appendChild(copy);
    const login=document.createElement('a');login.href='/auth/restart';login.className='ft-button ft-primary';login.textContent='Volver a identificarme';login.onclick=()=>{if((window.GitHubSync?.hasPendingChanges?.()||window.ghHasUnsavedChanges?.())&&!confirm('Conserva o exporta tus cambios antes de salir. El formulario se cerrara. ¿Continuar?'))return false;};actions.appendChild(login);
    box.appendChild(actions);shield.appendChild(box);document.body.appendChild(shield);
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
  user=result.user;session=result.session||null;dataMode=result.dataMode||'legacy';writesEnabled=!!result.writesEnabled;active=!locked;return result;
}
async function sendActivity(){
  if(!active||!session||locked||sending||document.hidden||activityAt<=lastSent||Date.now()-lastSent<15000)return;
  sending=true;const at=activityAt;
  try{
    const response=await fetch('/api/session/activity',{method:'POST',credentials:'same-origin'});
    if(!response.ok)throw new Error('La sesion no se puede renovar. Tus cambios locales se conservan.');
    const result=await response.json();session=result.session;lastSent=at;
  }catch(error){lock(error.message);}finally{sending=false;}
}
function tick(){
  if(!active||!session)return;
  const remaining=Math.min(session.expiresAt,session.lastActivity+session.idleMinutes*60)-Date.now()/1000;
  if(remaining<=0){
    if(!verifyingExpiry){verifyingExpiry=true;check().then(()=>{if(Math.min(session.expiresAt,session.lastActivity+session.idleMinutes*60)<=Date.now()/1000)lock('Se ha alcanzado el tiempo de sesion. Los datos centrales no se borran. Conserva o exporta cualquier formulario sin guardar antes de volver a entrar.');}).catch(error=>lock(error.message)).finally(()=>verifyingExpiry=false);}
    return;
  }
  let warning=document.getElementById('ftSessionWarning');
  if(remaining>120){warning?.remove();return;}
  if(!warning){
    warning=document.createElement('div');warning.id='ftSessionWarning';warning.className='ft-session-warning';warning.setAttribute('role','alert');
    const text=document.createElement('span');warning.appendChild(text);
    const stay=document.createElement('button');stay.className='ft-button';stay.textContent='Seguir trabajando';stay.onclick=()=>{activityAt=Date.now();lastSent=0;sendActivity();};warning.appendChild(stay);document.body.appendChild(warning);
  }
  warning.firstChild.textContent='La sesion se cerrara en '+Math.ceil(remaining)+' s.';
  warning.querySelector('button').hidden=session.expiresAt-Date.now()/1000<=120;
}
const ready=check().then(result=>{
  const owner=localStorage.getItem('__ft_session_owner');
  if(owner&&owner!==user.id)throw new Error('Este perfil de Chrome contiene datos de otro usuario. Utiliza un perfil separado; no se borrara informacion.');
  localStorage.setItem('__ft_session_owner',user.id);return result;
}).catch(error=>{lock(error.message);throw error;});
ready.catch(()=>{});
window.FTSession={ready,get user(){return user;},get active(){return active;},get dataMode(){return dataMode;},get writesEnabled(){return writesEnabled;},decorate,icon,control,
  refresh:()=>check().catch(error=>{lock(error.message);throw error;}),
  async requireSection(section){await ready;if(!permitted(section)){lock('No tienes permiso para este modulo.');throw new Error('Modulo no autorizado');}},
  async logout(){
    await ready;
    if((window.GitHubSync?.hasPendingChanges?.()||window.ghHasUnsavedChanges?.())&&!confirm('Hay cambios pendientes. Se conservaran localmente. Exporta una copia antes de cerrar si necesitas recuperarlos. ¿Cerrar sesion?'))return;
    await preserveEditor();
    const response=await fetch('/api/logout',{method:'POST',credentials:'same-origin'});if(!response.ok)throw new Error('No pude cerrar la sesion.');
    active=false;location.href='/cdn-cgi/access/logout';
  },permitted};
function decorate(){
  if(!user)return;document.documentElement.dataset.ftDataMode=dataMode;
  if(document.getElementById('ftSessionBar'))return;ui();
  document.querySelectorAll('a[href]').forEach(link=>{const file=link.getAttribute('href').split('?')[0].replace(/^\.\//,'');const section=Object.keys(sections).find(key=>sections[key]===file);if(section&&!permitted(section))link.hidden=true;});
  const bar=document.createElement('div');bar.id='ftSessionBar';bar.setAttribute('aria-label','Sesion y guardado');
  const identity=document.createElement('span');identity.className='ft-identity';identity.append(icon('user'),document.createTextNode(user.name));bar.appendChild(identity);
  const tools=document.createElement('div');tools.id='ftSessionTools';tools.className='ft-session-tools';
  if(user.role==='admin'){const admin=control('a','Usuarios y sesiones','users');admin.href='/session-admin.html';tools.appendChild(admin);}
  const menu=document.createElement('details');menu.className='ft-session-menu';
  const toggle=control('summary','Herramientas y copias','more');menu.appendChild(toggle);
  const items=document.createElement('div');items.id='ftSessionMenuItems';items.className='ft-session-menu-items';menu.appendChild(items);
  const logout=document.createElement('button');logout.className='ft-menu-command';logout.append(icon('logout'),document.createTextNode('Cerrar sesion'));logout.onclick=()=>window.FTSession.logout().catch(error=>alert(error.message));items.appendChild(logout);
  tools.appendChild(menu);bar.appendChild(tools);document.body.appendChild(bar);window.FTIcons?.refresh();
  document.addEventListener('click',event=>{if(!menu.contains(event.target))menu.open=false;});
  for(const type of ['pointerdown','keydown','input','wheel'])document.addEventListener(type,event=>{if(event.isTrusted&&!locked){activityAt=Date.now();sendActivity();}},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();check().catch(error=>lock(error.message));}});
}
ready.then(()=>{
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate,{once:true});else decorate();
  setInterval(()=>{sendActivity();check().catch(error=>lock(error.message));},25000);
  setInterval(tick,1000);
}).catch(()=>{});
})();
