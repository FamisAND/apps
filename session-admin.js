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
  }
  const sessionRows=document.getElementById('sessions');sessionRows.replaceChildren();
  for(const session of sessions.sessions){const row=element('tr');const alive=!session.revoked&&session.valid_version&&session.expires_at>Date.now()/1000&&session.last_seen>Date.now()/1000-1800;for(const value of [session.name+' · '+session.email,new Date(session.created_at*1000).toLocaleString(),new Date(session.last_seen*1000).toLocaleString(),alive?'Activa':'Cerrada / revocada'])row.append(element('td',value));sessionRows.append(row);}
}
permissions(document.getElementById('newPermissions'));
document.getElementById('createUser').onsubmit=event=>{event.preventDefault();const button=event.submitter;action(button,async()=>{await api('users','POST',{name:document.getElementById('newName').value,email:document.getElementById('newEmail').value,permissions:selected(document.getElementById('newPermissions'))});event.target.reset();});};
document.getElementById('refresh').onclick=event=>action(event.target,async()=>{});
const ready=window.FTSession?window.FTSession.ready:Promise.reject(new Error('Este panel se utiliza desde el acceso protegido de Cloudflare.'));
ready.then(()=>refresh()).catch(error=>status.textContent=error.message);
})();
