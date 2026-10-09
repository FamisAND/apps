(function(){
'use strict';
const central='https://full-training-private.sergiofamisr.workers.dev';
if(location.origin===central||window.FTSession?.dataMode==='records')return;
if(location.protocol!=='file:'&&location.hostname!=='famisand.github.io')return;
const message='Este acceso antiguo es de solo lectura. Abre Full Training privado para guardar.';
const denied=()=>{throw new Error(message);};
const get=Storage.prototype.getItem;
for(const method of ['setItem','removeItem','clear']){
  const original=Storage.prototype[method];
  Storage.prototype[method]=function(...args){if(this===localStorage)return denied();return original.apply(this,args);};
}
const transaction=IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction=function(stores,mode,...args){
  if(mode&&mode!=='readonly')return denied();
  return transaction.call(this,stores,mode,...args);
};
IDBFactory.prototype.deleteDatabase=denied;
const open=IDBFactory.prototype.open;
IDBFactory.prototype.open=function(...args){
  const request=open.apply(this,args);
  request.addEventListener('upgradeneeded',()=>request.transaction.abort(),{once:true});
  return request;
};
const keys=['ft_v4','ft_theme','ft_lang','tob_online_v2','tob_online_v1','tob_online_v2_before_import','tob_menus','tob_menus_sync_dirty','tob_ai_cfg','__dashboard_config','pat_v5','pat_dismissed','ot_hist','ot_snaps','ot_activas','ot_cfg','fac_v1'];
function exportLocal(){
  const values={};
  for(const key of keys){const value=get.call(localStorage,key);if(value!==null)values[key]=value;}
  const copy={format:'ft-legacy-local-archive-v1',origin:location.origin,path:location.pathname,createdAt:new Date().toISOString(),values,centralConfirmation:false};
  const url=URL.createObjectURL(new Blob([JSON.stringify(copy,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='full-training-archivo-local-'+new Date().toISOString().slice(0,10)+'.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
const noChange=async()=>{throw new Error(message);};
const sync=Object.freeze({
  ready:Promise.resolve(false),isLoggedIn:()=>false,hasToken:()=>false,hasPendingChanges:()=>false,
  getRepo:()=>'',getBranch:()=>'',getCachedSecurity:()=>null,
  attach:()=>{},enableAutoPush:()=>{},setStatusElement:()=>{},suspend:()=>{},
  bootstrapAutoSync:async()=>false,manualResync:async()=>false,
  setupCredentials:noChange,clearCredentials:noChange,pullAndApplyAll:noChange,flush:noChange,
  updateSection:noChange,updateSecuritySection:noChange,fetchSection:noChange,
  fetchFullData:noChange,fetchSecuritySection:noChange,preserve:noChange,
  archiveLegacyStorage:noChange,restoreLegacyStorage:noChange,reconcileCatalog:noChange,
  exportSafetyCopy:exportLocal,openRecoveryArchive:exportLocal,readLegacyArchive:async()=>[]
});
window.FTLegacyReadOnly=Object.freeze({central,exportLocal,sync});
function show(){
  if(document.getElementById('ftLegacyArchive'))return;
  const main=document.createElement('main');main.id='ftLegacyArchive';
  main.style.cssText='position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#f4f6f5;color:#19221f;font:15px/1.6 system-ui,sans-serif;padding:48px 24px;box-sizing:border-box';
  const inner=document.createElement('div');inner.style.cssText='max-width:640px;margin:8vh auto';
  const heading=document.createElement('h1');heading.textContent='Full Training';heading.style.cssText='font-size:26px;margin:0 0 12px';
  const status=document.createElement('p');status.textContent='Acceso antiguo en solo lectura. Tus datos locales se conservan.';
  const file=location.pathname.split('/').pop(),allowed=['index.html','full_training.html','consulta.html','options.html','patrimonio.html','facturas.html'];
  const link=document.createElement('a');link.href=central+'/'+(allowed.includes(file)?file:'index.html');link.textContent='Abrir Full Training privado';
  link.style.cssText='display:inline-block;background:#19664e;color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none;margin:8px 12px 8px 0';
  const button=document.createElement('button');button.type='button';button.textContent='Exportar copia local';button.onclick=exportLocal;
  button.style.cssText='font:inherit;padding:9px 15px;border:1px solid #aab9b1;border-radius:4px;background:#fff;color:#19221f;cursor:pointer';
  inner.append(heading,status,link,button);main.append(inner);document.body.append(main);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show,{once:true});else show();
})();
