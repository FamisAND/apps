(function(){
'use strict';
const modules={training:'Full Training',training_online:'Consulta',options:'Opciones',patrimonio:'Patrimonio',facturas:'Facturas'};
const status=document.getElementById('status');
function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function permissions(container,selected=[]){for(const [key,name]of Object.entries(modules)){const label=element('label');const input=element('input');input.type='checkbox';input.value=key;input.checked=selected.includes(key);label.append(input,document.createTextNode(name));container.append(label);}}
function selected(container){return [...container.querySelectorAll('input:checked')].map(input=>input.value);}
async function api(route,method='GET',value){const response=await fetch('/api/admin/'+route,{method,credentials:'same-origin',cache:'no-store',headers:value?{'Content-Type':'application/json'}:{},body:value?JSON.stringify(value):undefined});const result=await response.json();if(!response.ok)throw new Error(result.error||'Error de administracion');return result;}
async function action(button,operation){button.disabled=true;status.textContent='';try{await operation();await refresh();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}}
async function refresh(){
  const [users,sessions]=await Promise.all([api('users'),api('sessions')]);
  const target=document.getElementById('users');target.replaceChildren();
  for(const user of users.users){
    const row=element('tr'),identity=element('td');identity.append(element('strong',user.name),element('div',user.email));row.append(identity);
    const state=element('td'),role=element('select');for(const value of ['user','admin']){const option=element('option',value==='admin'?'Administrador':'Usuario');option.value=value;option.selected=user.role===value;role.append(option);}
    const active=element('input');active.type='checkbox';active.checked=user.active;const activeLabel=element('label');activeLabel.append(active,document.createTextNode('Activo'));state.append(role,activeLabel);row.append(state);
    const access=element('td'),list=element('div');list.className='permissions';permissions(list,user.role==='admin'?Object.keys(modules):user.permissions);if(user.role==='admin')list.title='El administrador tiene acceso a todos los modulos.';access.append(list);row.append(access);
    const commands=element('td'),buttons=element('div');buttons.className='row';const save=element('button','Guardar');save.type='button';save.onclick=()=>action(save,()=>api('users/'+user.id,'PATCH',{role:role.value,active:active.checked,permissions:selected(list)}));
    const revoke=element('button','Expulsar sesiones');revoke.type='button';revoke.className='danger';revoke.onclick=()=>{if(confirm('¿Expulsar todas las sesiones de '+user.name+'?'))action(revoke,()=>api('users/'+user.id+'/revoke','POST',{}));};buttons.append(save,revoke);commands.append(buttons);row.append(commands);
    if(user.id==='root-admin'){role.disabled=true;active.disabled=true;list.querySelectorAll('input').forEach(input=>input.disabled=true);save.disabled=true;revoke.disabled=true;}
    target.append(row);
    [...row.children].forEach((cell,index)=>cell.dataset.label=['Usuario','Rol y estado','Acceso','Acciones'][index]);
  }
  const sessionRows=document.getElementById('sessions');sessionRows.replaceChildren();
  document.getElementById('idleMinutes').value=sessions.policy.idleMinutes;document.getElementById('maxHours').value=sessions.policy.maxHours;
  document.getElementById('sessionCount').textContent=sessions.sessions.length+' sesiones';
  for(const session of sessions.sessions){
    const row=element('tr'),alive=!session.revoked&&session.valid_version&&session.deadline>Date.now()/1000;
    const identity=element('td');identity.append(element('strong',session.name),element('div',session.email));row.append(identity);
    for(const [label,value]of [['Inicio',new Date(session.created_at*1000).toLocaleString()],['Ultima actividad',new Date(session.last_seen*1000).toLocaleString()]]){const cell=element('td',value);cell.dataset.label=label;row.append(cell);}
    const state=element('td'),badge=element('span',alive?'Activa':session.revoked?'Revocada':'Cerrada');badge.className='badge'+(alive?' active':'');state.append(badge);row.append(state);
    const changes=element('td'),count=session.activity.reduce((sum,item)=>sum+item.saves,0),toggle=element('button');toggle.type='button';toggle.className='session-changes';toggle.setAttribute('aria-expanded','false');
    if(window.FTSession?.icon)toggle.append(window.FTSession.icon('expand'));toggle.append(document.createTextNode(count+' guardados'));changes.append(toggle);
    const modules=element('div',session.activity.map(item=>item.module+' ('+item.saves+')').join(' · '));modules.className='session-modules';changes.append(modules);row.append(changes);
    const detail=element('tr');detail.className='activity-detail';detail.hidden=true;const contents=element('td');contents.colSpan=5;detail.append(contents);
    let loaded=false;
    toggle.onclick=async()=>{detail.hidden=!detail.hidden;toggle.setAttribute('aria-expanded',String(!detail.hidden));if(loaded||detail.hidden)return;toggle.disabled=true;try{await loadChanges(session.id,contents);loaded=true;}catch(error){contents.textContent='No se pudo cargar la actividad: '+error.message;}finally{toggle.disabled=false;}};
    sessionRows.append(row,detail);
  }
  window.FTIcons?.refresh();
}
async function loadChanges(id,container,before){
  const result=await api('sessions/'+id+'/changes'+(before?'?before='+before:''));
  if(!before)container.replaceChildren();
  if(!result.changes.length){const empty=element('p','Sin cambios confirmados registrados. Las sesiones anteriores a esta actualizacion no tienen detalle por sesion.');empty.className='activity-empty';container.append(empty);return;}
  const list=element('ol');list.className='activity-list';
  for(const event of result.changes){const item=element('li');item.className='activity-event';const date=element('time',new Date(event.at).toLocaleString());date.dateTime=event.at;const detail=element('div');detail.append(element('strong',event.module));const changes=element('ul');
    for(const value of event.items){const line=element('li',value.action+' de '+value.type.toLowerCase()+(value.client?' · '+value.client:'')+(value.label&&value.label!==value.client?' · '+value.label:''));if(value.fields.length)line.append(element('small',': '+value.fields.join(', ')));changes.append(line);}if(!event.items.length)changes.append(element('li','Actualizacion de datos'));if(event.additionalRecords)changes.append(element('li','Y '+event.additionalRecords+' registros mas en este guardado'));detail.append(changes);item.append(date,detail);list.append(item);}
  container.append(list);
  if(result.nextCursor){const more=element('button','Ver mas cambios');more.onclick=async()=>{more.disabled=true;try{await loadChanges(id,container,result.nextCursor);more.remove();}catch(error){status.textContent=error.message;more.disabled=false;}};container.append(more);}
}
permissions(document.getElementById('newPermissions'));
document.getElementById('createUser').onsubmit=event=>{event.preventDefault();const button=event.submitter;action(button,async()=>{await api('users','POST',{name:document.getElementById('newName').value,email:document.getElementById('newEmail').value,permissions:selected(document.getElementById('newPermissions'))});event.target.reset();});};
document.getElementById('refresh').onclick=event=>action(event.target,async()=>{});
document.getElementById('sessionPolicy').onsubmit=async event=>{event.preventDefault();const button=event.submitter,notice=document.getElementById('policyStatus');button.disabled=true;notice.textContent='';try{await api('session-policy','PATCH',{idleMinutes:Number(document.getElementById('idleMinutes').value),maxHours:Number(document.getElementById('maxHours').value)});notice.textContent='Tiempos guardados. Se aplican tambien a las sesiones abiertas, sin ampliar su caducidad original.';notice.className='muted session-policy-saved';}catch(error){notice.textContent=error.message;}finally{button.disabled=false;}};
const ready=window.FTSession?window.FTSession.ready:Promise.reject(new Error('Este panel se utiliza desde el acceso protegido de Cloudflare.'));
ready.then(()=>refresh()).catch(error=>status.textContent=error.message);
})();
