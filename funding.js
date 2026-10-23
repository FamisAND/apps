(function(){
  'use strict';
  const M=window.FundingModel,$=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STATES={evaluation:'En evaluacion',failed:'Evaluacion fallida',funded:'Fondeada activa',closed:'Fondeada cerrada',not_started:'Sin iniciar'};
  const icons=name=>`<span data-ft-icon="${name}" aria-hidden="true"></span>`;
  const id=()=>crypto.randomUUID();
  let db=M.empty(),adapter,tab='dashboard',editor=null,dirty=false,busy=false,unsavedBook=false,canEdit=false,chart,monthly,bankroll,detailId=null;
  const sorts={accounts:{key:'start',direction:-1},movements:{key:'date',direction:-1}};
  const hiddenSeries=new Set();
  const format=(value,currency=db.baseCurrency)=>value==null?'\u2014':new Intl.NumberFormat('es-ES',{style:'currency',currency,maximumFractionDigits:2}).format(value/100);
  const number=(value,suffix='')=>value==null?'\u2014':new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(value)+suffix;
  const date=value=>value?value.split('-').reverse().join('/'):'\u2014';
  function notice(message,error=false){$('notice').hidden=!message;$('notice').textContent=message;$('notice').style.borderColor=error?'#a85e50':'';}
  function activeAccounts(){return db.accounts.filter(a=>!a.deletedAt);}
  function option(value,label,selected){return `<option value="${esc(value)}" ${String(value)===String(selected)?'selected':''}>${esc(label)}</option>`;}
  function action(name,label,icon='plus',attrs='',secondary=true){return `<button type="button" class="${secondary?'secondary':''}" data-action="${name}" ${attrs}>${icons(icon)}${esc(label)}</button>`;}
  function input(name,label,value='',type='text',attributes='',full=false){return `<label class="${full?'full':''}">${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${attributes}></label>`;}
  function select(name,label,options,full=false){return `<label class="${full?'full':''}">${esc(label)}<select name="${name}">${options}</select></label>`;}
  function textArea(value){return `<label class="full">Notas opcionales<textarea name="notes" maxlength="2000">${esc(value||'')}</textarea></label>`;}
  function iconButton(actionName,title,icon,attrs=''){return `<button type="button" class="icon-button" data-action="${actionName}" title="${esc(title)}" aria-label="${esc(title)}" ${attrs}>${icons(icon)}</button>`;}
  function refreshIcons(){window.FTIcons?.refresh();document.querySelectorAll('button[data-action]').forEach(b=>b.disabled=!canEdit&&b.dataset.action!=='detail');}
  function filters(){
    const mode=$('periodFilter').value,end=mode==='custom'?$('toDate').value:M.today();let start='';
    if(mode==='custom')start=$('fromDate').value;
    else if(mode!=='all'){
      const [y,m,d]=end.split('-').map(Number),target=new Date(Date.UTC(y,m-1-Number(mode),1));
      const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
      start=`${target.getUTCFullYear()}-${String(target.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;
    }else{
      const first=db.events.filter(M.LIVE).map(e=>e.date).sort()[0];
      start=first?new Date((M.day(first)-1)*86400000).toISOString().slice(0,10):end;
    }
    return {start,end,company:$('companyFilter').value,size:$('sizeFilter').value};
  }
  function updateFilterOptions(){
    for(const [target,values,label]of [['companyFilter',activeAccounts().map(a=>a.company),'Todas las empresas'],['sizeFilter',activeAccounts().map(a=>a.name),'Todos los tipos']]){
      const selected=$(target).value;$(target).innerHTML=option('',label,selected)+[...new Set(values)].sort().map(v=>option(v,v,selected)).join('');
    }
  }
  function chooseTab(name){tab=name;document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);if(b.dataset.tab===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});for(const key of ['dashboard','accounts','movements','statistics'])$(key+'View').hidden=key!==name;render();}
  function kpi(label,value,foot='',color=''){return `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value ${color}">${esc(value)}</div><span class="kpi-foot">${esc(foot)}</span></div>`;}
  function sorted(rows,kind){const s=sorts[kind];return [...rows].sort((a,b)=>{const x=a[s.key]??'',y=b[s.key]??'';return (typeof x==='number'?x-y:String(x).localeCompare(String(y),'es',{numeric:true}))*s.direction;});}
  function head(label,key,kind,numeric=false){return `<th class="${numeric?'numeric':''}">${key?`<button data-sort="${kind}:${key}">${esc(label)}${sorts[kind].key===key?(sorts[kind].direction>0?' +':' -'):''}</button>`:esc(label)}</th>`;}
  function empty(kind){return `<div class="empty-state"><span class="empty-icon">${icons('funding')}</span><strong>${kind==='accounts'?'No hay cuentas para estos filtros':'Todavia no hay movimientos'}</strong>${action(kind==='accounts'?'new-account':'new-event',kind==='accounts'?'Nueva evaluacion':'Registrar movimiento')}</div>`;}
  function accountRows(metrics){
    const f=filters(),search=$('accountSearch').value.toLowerCase(),status=$('stateFilter').value;
    return db.accounts.filter(a=>(!a.deletedAt||$('showDeletedAccounts').checked)&&(!f.company||a.company===f.company)&&(!f.size||a.name===f.size)&&(`${a.company} ${a.name} ${a.id}`).toLowerCase().includes(search)).map(a=>{
      const s=M.state(db,a.id,f.end),result=M.summary(s.events);return {account:a,id:a.id,company:a.company,name:a.name,status:s.status,start:s.attempts[0]?.startDate||'',approved:s.approvedDate,net:result.net};
    }).filter(a=>a.status!=='not_started'&&(!status||a.status===status));
  }
  function renderAccounts(metrics){
    const rows=sorted(accountRows(metrics),'accounts');
    $('accountsTable').innerHTML=rows.length?`<table><thead><tr>${head('Empresa','company','accounts')}${head('Cuenta','name','accounts')}${head('Inicio','start','accounts')}${head('Estado','status','accounts')}${head('Aprobacion','approved','accounts')}${head('Resultado acumulado','net','accounts',true)}<th></th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.account.deletedAt?'struck':''}"><td>${esc(r.company)}<small>${esc(r.id.slice(0,8))}</small></td><td><button class="text-button" data-action="detail" data-id="${esc(r.id)}">${esc(r.name)}</button></td><td>${date(r.start)}</td><td><span class="status-pill status-${r.status}">${STATES[r.status]}</span></td><td>${date(r.approved)}</td><td class="numeric ${r.net<0?'negative':'positive'}">${format(r.net)}</td><td class="row-actions">${iconButton('detail','Ver ficha','outgoing',`data-id="${esc(r.id)}"`)}</td></tr>`).join('')}</tbody></table>`:empty('accounts');
  }
  function renderMovements(target,events,compact=false){
    if(!events.length){$(target).innerHTML=empty('events');return;}
    const rows=compact?[...events].sort(M.order).reverse().slice(0,6):sorted(events.map(e=>({...e,total:e.money?.baseMinor||0})),'movements');
    $(target).innerHTML=`<table><thead><tr>${head('Fecha',compact?null:'date','movements')}${head('Cuenta',null,'movements')}${head('Evento',compact?null:'type','movements')}${head('Importe original',null,'movements',true)}${head(db.baseCurrency,compact?null:'total','movements',true)}${compact?'':'<th></th>'}</tr></thead><tbody>${rows.map(e=>{
      const a=db.accounts.find(a=>a.id===e.accountId),amount=e.money?format(e.money.minor,e.money.currency):'\u2014',color=M.COSTS.has(e.type)?'negative':['received','refund'].includes(e.type)?'positive':'';
      const resolved=e.type==='requested'&&db.events.some(r=>M.LIVE(r)&&r.requestId===e.id&&r.date<=filters().end);
      return `<tr class="${!M.LIVE(e)?'struck':''}"><td>${date(e.date)}</td><td>${a?`<button class="text-button" data-action="detail" data-id="${esc(a.id)}">${esc(a.company)} / ${esc(a.name)}</button>`:'Negocio'}</td><td>${esc(M.TYPES[e.type])}${!M.LIVE(e)?'<small>Anulado / eliminado</small>':''}${e.type==='requested'?`<small>${resolved?'Resuelta':'Pendiente'}; no es ingreso</small>`:''}</td><td class="numeric">${amount}</td><td class="numeric ${color}">${e.money?format(e.money.baseMinor):'\u2014'}${e.money&&e.money.currency!==db.baseCurrency?`<small>1 ${e.money.currency} = ${esc(e.money.rate)} ${db.baseCurrency}</small>`:''}</td>${compact?'':`<td><div class="row-actions">${iconButton('edit-event','Editar evento','edit',`data-id="${esc(e.id)}"`)}${M.LIVE(e)?iconButton('void-event','Anular evento','archive',`data-id="${esc(e.id)}"`)+iconButton('delete-event','Eliminar del calculo','delete',`data-id="${esc(e.id)}"`):iconButton('restore-event','Restaurar evento','restore',`data-id="${esc(e.id)}"`)}</div></td>`}</tr>`;
    }).join('')}</tbody></table>`;
  }
  function chartOptions(currency=db.baseCurrency){return {responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{color:'#c5d0d8',boxWidth:10,boxHeight:10,padding:19}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${format(c.parsed.y*100,currency)}`}}},scales:{x:{grid:{display:false},ticks:{color:'#99a8b3',maxTicksLimit:9,maxRotation:0}},y:{beginAtZero:true,grid:{color:'#2a3339'},ticks:{color:'#99a8b3',callback:value=>new Intl.NumberFormat('es-ES',{notation:'compact',maximumFractionDigits:1}).format(value)}}}};}
  function renderMainChart(m){
    if(chart)chart.destroy();$('chartError').hidden=!!window.Chart;$('chartEmpty').hidden=m.lifetime.grossExpenses!==0||m.lifetime.received!==0||m.lifetime.refunds!==0;
    if(!window.Chart)return;
    const options=chartOptions();options.plugins.legend.onClick=(_event,item,c)=>{const index=item.datasetIndex;c.chart.setDatasetVisibility(index,!c.chart.isDatasetVisible(index));if(c.chart.isDatasetVisible(index))hiddenSeries.delete(index);else hiddenSeries.add(index);c.chart.update();};
    options.plugins.tooltip.callbacks.title=items=>date(m.points[items[0].dataIndex].date);
    options.scales.x.type='linear';options.scales.x.ticks.callback=value=>date(new Date(Math.round(value)*86400000).toISOString().slice(0,10)).slice(0,5);
    chart=new Chart($('mainChart'),{type:'line',data:{datasets:[['expenses','Gastos efectivos','#f28b7e'],['received','Retiradas cobradas','#65d7a5'],['net','Beneficio neto','#70b3ff']].map(([key,label,color],i)=>({label,data:m.points.map(p=>({x:M.day(p.date),y:p[key]/100})),borderColor:color,backgroundColor:color+'13',borderWidth:key==='net'?2.8:2,fill:key==='net',tension:0,stepped:'before',hidden:hiddenSeries.has(i),pointRadius:m.points.map(p=>$('eventMarkers').checked&&p.events?3:0),pointHoverRadius:5}))},options});
  }
  function stat(label,value,foot=''){return `<div class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(foot)}</small></div>`;}
  function statsMarkup(m){return stat('Tasa de fondeo',number(m.fundingRate,'%'),`${m.approvals} aprobaciones / ${m.finalized} intentos finalizados`)+stat('Tasa de retiro',number(m.payoutRate,'%'),`${m.paidAccounts} con cobro / ${m.payoutKnown} con resultado conocido; ${m.payoutPending} pendientes`)+stat('Coste por aprobacion',format(m.costPerFunded),'Compras y resets, netos de reembolsos')+stat('Coste por cuenta que cobra',format(m.costPerPaid),'Gastos efectivos / cuentas con cobro')+stat('Hasta aprobar: media',number(m.averageApprovalDays,' dias'),`Mediana: ${number(m.medianApprovalDays,' dias')}`)+stat('Hasta el primer cobro: media',number(m.averagePayoutDays,' dias'),`Mediana: ${number(m.medianPayoutDays,' dias')}`)+stat('Drawdown economico maximo',format(m.maxDrawdown),'Desde el inicio hasta el final del periodo')+stat('Bankroll global disponible',format(m.bankroll),'Todas las empresas; incluye capital aportado');}
  function renderStats(m){
    $('statisticsKpis').innerHTML=statsMarkup(m);
    for(const [key,target]of [['company','companyStats'],['name','sizeStats']]){
      const values=[...new Set(activeAccounts().map(a=>a[key]))].sort();
      $(target).innerHTML=`<table><thead><tr><th>${key==='company'?'Empresa':'Tipo'}</th><th class="numeric">Gastos</th><th class="numeric">Cobros</th><th class="numeric">Neto</th><th>Fondeo</th><th>Retiro</th><th class="numeric">Coste / aprobada</th><th class="numeric">Coste / con cobro</th><th>Aprobar: media / mediana</th><th>Cobrar: media / mediana</th></tr></thead><tbody>${values.map(value=>{
        const f=filters();if(key==='company'&&f.company&&f.company!==value||key==='name'&&f.size&&f.size!==value)return '';
        const x=M.metrics(db,{...f,[key==='company'?'company':'size']:value});return `<tr><td>${esc(value)}</td><td class="numeric">${format(x.expenses)}</td><td class="numeric positive">${format(x.received)}</td><td class="numeric ${x.net<0?'negative':'positive'}">${format(x.net)}</td><td>${number(x.fundingRate,'%')}<small>${x.approvals}/${x.finalized}</small></td><td>${number(x.payoutRate,'%')}<small>${x.paidAccounts}/${x.payoutKnown}; ${x.payoutPending} pendientes</small></td><td class="numeric">${format(x.costPerFunded)}</td><td class="numeric">${format(x.costPerPaid)}</td><td>${number(x.averageApprovalDays)} / ${number(x.medianApprovalDays)} dias</td><td>${number(x.averagePayoutDays)} / ${number(x.medianPayoutDays)} dias</td></tr>`;
      }).join('')}</tbody></table>`;
    }
    monthly?.destroy();bankroll?.destroy();if(!window.Chart)return;
    monthly=new Chart($('monthlyChart'),{type:'bar',data:{labels:m.monthly.map(p=>p.month),datasets:[{label:'Beneficio neto',data:m.monthly.map(p=>p.net/100),backgroundColor:m.monthly.map(p=>p.net<0?'#ed9284':'#65d7a5'),borderRadius:2}]},options:chartOptions()});
    const bankOptions=chartOptions();bankOptions.scales.x.type='linear';bankOptions.scales.x.ticks.callback=value=>date(new Date(Math.round(value)*86400000).toISOString().slice(0,10)).slice(0,5);bankOptions.plugins.tooltip.callbacks.title=items=>date(m.points[items[0].dataIndex].date);
    bankroll=new Chart($('bankrollChart'),{type:'line',data:{datasets:[{label:filters().company||filters().size?'Capital del segmento + cobros - gastos':'Bankroll',data:m.points.map(p=>({x:M.day(p.date),y:p.bankroll/100})),borderColor:'#d1b27a',pointRadius:0,stepped:'before'}]},options:bankOptions});
  }
  function render(){
    try{
      const m=M.metrics(db,filters());$('bookCurrency').textContent=db.baseCurrency;
      $('mainKpis').innerHTML=kpi('Beneficio neto real',format(m.net),'Resultado del periodo',m.net<0?'negative':'positive')+kpi('Retiradas cobradas',format(m.received),'Solo dinero recibido','positive')+kpi('Gastos efectivos',format(m.expenses),`${format(m.grossExpenses)} desembolsados; ${format(m.refunds)} reembolsados`,'negative')+kpi('ROI economico',number(m.roi,'%'),'Sobre gastos efectivos','blue')+kpi('Bankroll global',format(m.bankroll),'Capital aportado + resultado acumulado');
      const counters=[['Evaluaciones compradas',m.purchases],['Aprobaciones',m.approvals],['En evaluacion',m.evaluation],['Fondeadas activas',m.fundedActive],['Cerradas / fallidas',m.closed],['Resets / nuevos intentos',m.resets]];
      $('operationsKpis').innerHTML=counters.map(([label,value])=>`<div class="operation-stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
      const f=filters();$('chartPeriod').textContent=`${date(f.start)} - ${date(f.end)} | ${db.baseCurrency} | Acumulados desde el inicio`;
      if(tab==='dashboard'){$('efficiencyKpis').innerHTML=statsMarkup(m);renderMainChart(m);renderMovements('recentMovements',m.period,true);}
      if(tab==='accounts')renderAccounts(m);
      if(tab==='movements'){
        const ids=new Set(m.states.map(s=>s.account.id)),show=$('showVoided').checked;
        renderMovements('movementsTable',db.events.filter(e=>(show||M.LIVE(e))&&e.date>=f.start&&e.date<=f.end&&(!e.accountId?(!f.company&&!f.size):ids.has(e.accountId))&&(!$('movementType').value||e.type===$('movementType').value)));
      }
      if(tab==='statistics')renderStats(m);refreshIcons();
    }catch(error){notice(error.message,true);}
  }
  async function commit(next){if(!canEdit)throw new Error('Este acceso esta en solo lectura.');M.validate(next);unsavedBook=true;if(editor){editor.waiting=true;for(const field of $('formFields').querySelectorAll('input,select,textarea'))field.disabled=true;}db=next;updateFilterOptions();render();await adapter.save(next);unsavedBook=false;notice('');if(detailId&&$('accountDetail').open)showDetail(detailId);}
  async function mutate(operation){if(busy)return;if(unsavedBook){notice('Hay un guardado pendiente. Confirma o recupera esa copia antes de registrar otro cambio.',true);return;}busy=true;try{const next=M.clone(db);operation(next);await commit(next);}catch(error){notice('No confirmado: '+error.message,true);}finally{busy=false;}}
  function revise(row,changes){const {revisions,...previous}=row;return {...row,...changes,updatedAt:new Date().toISOString(),revisions:[...(revisions||[]),{at:new Date().toISOString(),previous}]};}
  function moneyFields(existing,account){
    const currency=existing?.money?.currency||account?.currency||db.baseCurrency;
    return input('amount',editor?.type==='received'?'Importe NETO efectivamente recibido':'Importe',existing?.money?existing.money.minor/100:'','text','inputmode="decimal" required')+select('currency','Divisa',['USD','EUR','GBP','CAD','AUD','CHF'].map(c=>option(c,c,currency)).join(''))+input('rate',`Cambio: 1 divisa = X ${db.baseCurrency}`,existing?.money?.rate||(currency===db.baseCurrency?'1':''),'text','inputmode="decimal"',true)+`<small class="full">El cambio queda guardado con este movimiento. No se usan cotizaciones actuales para reescribir el historico.</small>`;
  }
  function showEditor(spec){
    if(!canEdit){notice('Este acceso esta en solo lectura.',true);return;}
    if(unsavedBook){notice('Hay un guardado pendiente. Reintenta el mismo guardado antes de crear otro evento.',true);return;}
    if(editor&&dirty&&!confirm('Hay un formulario sin guardar. Descartar ese formulario?'))return;
    editor=spec;dirty=false;$('formError').textContent='';$('saveEvent').innerHTML=icons('check')+'Guardar evento';const current=db.events.find(e=>e.id===spec.eventId),account=db.accounts.find(a=>a.id===(spec.accountId||current?.accountId));
    if(spec.kind==='account'){
      const first=!db.accounts.length;
      $('editorTitle').textContent='Nueva evaluacion';
      $('formFields').innerHTML=input('company','Empresa',first?'Earn2Trade':'','text','required maxlength="100" list="companies"')+`<datalist id="companies">${[...new Set(activeAccounts().map(a=>a.company))].map(v=>option(v,v)).join('')}</datalist>`+input('name','Tipo / nombre de cuenta',first?'TCP25':'','text','required maxlength="100"')+input('date','Fecha de compra',first?'2026-10-19':M.today(),'date','required')+input('amount','Coste de compra',first?'75':'','text','inputmode="decimal" required')+select('currency','Divisa',['USD','EUR','GBP','CAD','AUD','CHF'].map(c=>option(c,c,'USD')).join(''))+(db.events.length?'':select('baseCurrency','Divisa del libro',['USD','EUR'].map(c=>option(c,c,db.baseCurrency)).join('')))+input('rate',`Cambio a ${db.baseCurrency} por unidad`,'1','text','inputmode="decimal"',true)+textArea('');
    }else if(spec.kind==='editAccount'){
      $('editorTitle').textContent='Editar cuenta';$('formFields').innerHTML=input('company','Empresa',account.company,'text','required maxlength="100"')+input('name','Tipo / nombre',account.name,'text','required maxlength="100"')+textArea(account.notes);
    }else{
      const type=current?.type||spec.type;editor.type=type;$('editorTitle').textContent=current?'Editar: '+M.TYPES[type]:M.TYPES[type];
      const accountOptions=option('','Gasto general / negocio',account?.id)+activeAccounts().map(a=>option(a.id,a.company+' / '+a.name,account?.id)).join('');
      let html=(account||current?`<div class="full account-sub">${esc(account?account.company+' / '+account.name:'Negocio')}</div><input type="hidden" name="accountId" value="${esc(account?.id||'')}">`:select('accountId','Cuenta',accountOptions,true))+input('date','Fecha',current?.date||M.today(),'date','required',true);
      if(M.CASH.has(type))html+=moneyFields(current,account);
      if(type==='received')html+=input('fee','Comision ya incluida en ese neto (opcional)',current?.feeDeductedMinor==null?'':current.feeDeductedMinor/100,'text','inputmode="decimal"',true)+'<small class="full">No se vuelve a restar. El split de la firma tampoco se descuenta del neto cobrado. Gastos pagados aparte se registran una sola vez como gasto.</small>';
      if(['received','rejected','cancelled'].includes(type)){
        const resolved=new Set(db.events.filter(e=>M.LIVE(e)&&e.id!==current?.id&&e.requestId).map(e=>e.requestId));
        html+=select('requestId','Solicitud',option('',type==='received'?'Cobro sin solicitud registrada':'Seleccionar solicitud',current?.requestId||spec.requestId)+db.events.filter(e=>M.LIVE(e)&&e.type==='requested'&&!resolved.has(e.id)&&(!account||e.accountId===account.id)).map(e=>option(e.id,date(e.date)+' / '+format(e.money.minor,e.money.currency),current?.requestId||spec.requestId)).join(''),true);
      }
      if(type==='refund')html+=select('expenseId','Gasto que se devuelve',option('','Seleccionar gasto',current?.expenseId||spec.expenseId)+db.events.filter(e=>M.LIVE(e)&&M.COSTS.has(e.type)&&(!account||e.accountId===account.id)).map(e=>option(e.id,date(e.date)+' / '+M.TYPES[e.type]+' / '+format(e.money.minor,e.money.currency),current?.expenseId||spec.expenseId)).join(''),true);
      html+=textArea(current?.notes);$('formFields').innerHTML=html;
    }
    updateFxField();$('editor').showModal();refreshIcons();
  }
  function updateFxField(){const form=$('eventForm'),currency=form.elements.currency?.value,base=form.elements.baseCurrency?.value||db.baseCurrency,rate=form.elements.rate;if(rate){if(rate.dataset.currency&&rate.dataset.currency!==currency||rate.dataset.base&&rate.dataset.base!==base)rate.value=currency===base?'1':'';rate.dataset.currency=currency;rate.dataset.base=base;rate.required=currency!==base;rate.readOnly=currency===base;rate.parentElement.firstChild.textContent=`Cambio: 1 ${currency} = X ${base}`;if(currency===base)rate.value='1';}}
  function newEvent(accountId,type){
    if(type){showEditor({kind:'event',type,accountId});return;}
    $('infoTitle').textContent='Nuevo movimiento';$('infoContent').innerHTML=`<div class="account-actions">${['renewal','reset','activation','expense','requested','received','refund','capital'].map(t=>action('event-type',M.TYPES[t],'plus',`data-type="${t}" ${accountId?`data-id="${esc(accountId)}"`:''}`)).join('')}</div>`;$('infoDialog').showModal();refreshIcons();
  }
  function closeEditor(){if(dirty&&!confirm('Descartar el formulario sin guardar?'))return;$('editor').close();editor=null;dirty=false;}
  async function submit(event){
    event.preventDefault();if(busy)return;busy=true;$('saveEvent').disabled=true;$('formError').textContent='';
    try{
      if(editor?.waiting&&unsavedBook){await (adapter.retry?adapter.retry():adapter.save(db));unsavedBook=false;dirty=false;$('editor').close();editor=null;notice('');render();if(detailId&&$('accountDetail').open)showDetail(detailId);return;}
      const form=new FormData($('eventForm')),value=Object.fromEntries(form),next=M.clone(db),at=new Date().toISOString();
      if(editor.kind==='editAccount'){
        const index=next.accounts.findIndex(a=>a.id===editor.accountId);next.accounts[index]=revise(next.accounts[index],{company:value.company.trim(),name:value.name.trim(),notes:value.notes});
      }else{
        if(!db.events.length&&value.baseCurrency)next.baseCurrency=value.baseCurrency;
        let accountId=value.accountId||editor.accountId||null;
        if(editor.kind==='account'){
          const duplicate=db.accounts.some(a=>!a.deletedAt&&a.company.toLowerCase()===value.company.trim().toLowerCase()&&a.name.toLowerCase()===value.name.trim().toLowerCase()&&M.state(db,a.id).attempts[0]?.startDate===value.date);
          if(duplicate&&!confirm('Ya existe una cuenta de esa empresa y tipo con la misma fecha de compra. Crear otra cuenta distinta?'))return;
          accountId=id();next.accounts.push({id:accountId,company:value.company.trim(),name:value.name.trim(),currency:value.currency,notes:value.notes,createdAt:at});
        }
        const original=next.events.find(e=>e.id===editor.eventId),type=editor.kind==='account'?'purchase':original?.type||editor.type;
        if(type==='capital')accountId=null;
        const changes={type,accountId,date:value.date,notes:value.notes||''};
        if(M.CASH.has(type))changes.money=M.money(value.amount,value.currency,value.rate,next.baseCurrency);
        if(['received','rejected','cancelled'].includes(type))changes.requestId=value.requestId||null;
        if(type==='refund')changes.expenseId=value.expenseId;
        if(type==='received')changes.feeDeductedMinor=value.fee?M.minor(value.fee):null;
        const row=original?revise(original,changes):{...changes,id:id(),createdAt:at,order:Math.max(0,...next.events.map(e=>e.order))+1};
        if(original)next.events[next.events.findIndex(e=>e.id===original.id)]=row;else{
          if(next.events.some(e=>M.LIVE(e)&&e.type===row.type&&e.accountId===row.accountId&&e.date===row.date&&JSON.stringify(e.money)===JSON.stringify(row.money))&&!confirm('Hay un evento similar en esta cuenta, fecha e importe. Registrar otro evento distinto?'))return;
          next.events.push(row);
        }
      }
      await commit(next);dirty=false;$('editor').close();editor=null;
    }catch(error){$('formError').textContent=error.message+' No cierres si hay cambios pendientes; conserva o exporta la copia.';if(editor?.waiting)$('saveEvent').innerHTML=icons('retry')+'Reintentar guardado';}
    finally{busy=false;$('saveEvent').disabled=false;refreshIcons();}
  }
  function showDetail(accountId){
    detailId=accountId;const a=db.accounts.find(a=>a.id===accountId);if(!a)return;
    const s=M.state(db,a.id),total=M.summary(s.events),pending=db.events.filter(e=>e.accountId===a.id&&M.LIVE(e)&&e.type==='requested'&&!db.events.some(r=>M.LIVE(r)&&r.requestId===e.id));
    $('accountDetailContent').innerHTML=`<div class="dialog-heading"><div><h2>${esc(a.company)} / ${esc(a.name)}</h2></div><button class="icon-button" data-close="accountDetail" title="Cerrar" aria-label="Cerrar">${icons('close')}</button></div><p class="account-sub">${esc(a.id)} | <span class="status-pill status-${s.status}">${STATES[s.status]}</span></p><div class="account-actions">${!a.deletedAt?(s.status==='evaluation'?action('approve','Marcar aprobada','check')+action('fail','Marcar fallida','close'):'')+(['evaluation','failed'].includes(s.status)?action('reset','Registrar reset','retry'):'')+(s.status==='funded'?action('request','Solicitar retirada','outgoing')+action('close-account','Cerrar cuenta','archive'):'')+action('account-expense','Anadir gasto','plus')+action('edit-account','Editar cuenta','edit')+action('delete-account','Retirar cuenta','delete'):action('restore-account','Restaurar cuenta','restore')}</div><div class="account-totals"><div><span>Resultado real acumulado</span><strong class="${total.net<0?'negative':'positive'}">${format(total.net)}</strong></div><div><span>Gastos efectivos</span><strong>${format(total.expenses)}</strong></div><div><span>Cobros efectivos</span><strong class="positive">${format(total.received)}</strong></div></div>${a.notes?`<p class="account-sub">${esc(a.notes)}</p>`:''}${pending.length?`<h3>Solicitudes pendientes</h3>${pending.map(e=>`<div class="section-heading"><span>${date(e.date)} / ${format(e.money.minor,e.money.currency)}</span><div class="row-actions">${action('receive-request','Confirmar cobro','check',`data-request="${esc(e.id)}"`)}${action('reject-request','Rechazar','close',`data-request="${esc(e.id)}"`)}${action('cancel-request','Cancelar','archive',`data-request="${esc(e.id)}"`)}</div></div>`).join('')}`:''}<h3>Historial completo</h3><ol class="timeline">${db.events.filter(e=>e.accountId===a.id).sort(M.order).reverse().map(e=>`<li class="${!M.LIVE(e)?'struck':''}"><time>${date(e.date)}</time><div class="event-heading"><strong>${esc(M.TYPES[e.type])}</strong><span>${e.money?format(e.money.minor,e.money.currency):''}</span>${iconButton('edit-event','Editar evento','edit',`data-id="${esc(e.id)}"`)}</div>${e.type==='received'&&e.feeDeductedMinor?`<p>${format(e.feeDeductedMinor,e.money.currency)} ya descontados, solo informativo</p>`:''}${e.notes?`<p>${esc(e.notes)}</p>`:''}${e.revisions?.length?`<details><summary>${e.revisions.length} revisiones anteriores</summary>${e.revisions.map(r=>`<p>${esc(new Date(r.at).toLocaleString('es-ES'))}: ${date(r.previous.date)} / ${r.previous.money?format(r.previous.money.minor,r.previous.money.currency):M.TYPES[r.previous.type]}<br>${esc(r.previous.notes||'')}</p>`).join('')}</details>`:''}</li>`).join('')}</ol>`;
    if(!$('accountDetail').open)$('accountDetail').showModal();refreshIcons();
  }
  async function toggleEvent(eventId,kind){const e=db.events.find(e=>e.id===eventId);if(!e)return;const restore=kind==='restore';if(!confirm(restore?'Restaurar este evento y recalcular?':'Retirar este evento de los calculos? Se conserva en el historial y la copia JSON. Las transiciones con dependencias no se pueden retirar solas.'))return;await mutate(next=>{const i=next.events.findIndex(e=>e.id===eventId);next.events[i]=revise(next.events[i],{voidedAt:kind==='void'?new Date().toISOString():null,deletedAt:kind==='delete'?new Date().toISOString():null});});}
  function definitions(){
    $('infoTitle').textContent='Criterios de calculo';$('infoContent').innerHTML=[
      '<h3>Dinero real</h3><p>Neto = cobros recibidos - gastos efectivos. Los reembolsos reducen el gasto original. Solicitudes y aportaciones no son ganancias. Se registra el neto recibido tras el split y las comisiones ya descontadas; esas comisiones son informativas y no se restan otra vez. Un gasto pagado aparte se registra una sola vez como gasto.</p>',
      '<h3>Tasas y periodos</h3><p>Fondeo: intentos aprobados / intentos finalizados en el periodo. Cada reset abre otro intento; una renovacion no. Retiro: cuentas con cobro / cuentas con resultado conocido de las aprobadas en el periodo. Las fondeadas sin cobrar quedan pendientes mientras esten activas o tengan una solicitud sin resolver, incluso despues del cierre. Todo se evalua hasta la fecha final elegida.</p>',
      '<h3>Costes y tiempos</h3><p>Coste por aprobacion: compras y resets del periodo, netos de reembolsos, / aprobaciones. Coste por cuenta que cobra: gastos efectivos del periodo / cuentas de la cohorte con cobro. Los periodos pueden contener gastos y resultados de cohortes distintas. Los dias hasta aprobar parten del intento; hasta cobrar, de la aprobacion.</p>',
      '<h3>Historico y bankroll</h3><p>La grafica y el drawdown acumulan desde el inicio hasta el final del periodo. La ventana temporal conserva su saldo de apertura. Como las fechas no incluyen horas, el drawdown usa cierres diarios de caja, no un orden intradia supuesto. El bankroll principal es global: capital aportado + cobros - gastos efectivos. En estadisticas la linea filtrada solo refleja el capital y flujo del segmento; las aportaciones generales no se asignan a empresas.</p>',
      '<h3>Divisas y recuperacion</h3><p>El cambio manual de cada movimiento es divisa base por una unidad original. Se conserva y no se actualiza retroactivamente. El libro se fija al registrar el primer evento. Anular o eliminar retira un registro del calculo, pero conserva su historial. JSON incluye todos los eventos, anulaciones y revisiones; la importacion combina IDs identicos sin duplicar y se detiene ante diferencias.</p>'
    ].join('');$('infoDialog').showModal();refreshIcons();
  }
  function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function checksum(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');}
  async function exportJson(){const data=M.clone(db),out={format:'full-training-funding',version:1,exportedAt:new Date().toISOString(),sha256:await checksum(data),data};download(JSON.stringify(out,null,2),'fondeo-'+M.today()+'.json','application/json');}
  async function importJson(file){
    if(!canEdit)throw new Error('Este acceso esta en solo lectura.');
    if(busy||unsavedBook)throw new Error('Hay un guardado pendiente. No se importa encima de otra operacion.');
    busy=true;
    try{
    if(!file)return;if(file.size>10*1024*1024)throw new Error('El archivo supera 10 MB. Requiere una importacion controlada.');
    const incoming=JSON.parse(await file.text());if(incoming.format!=='full-training-funding'||incoming.version!==1||await checksum(incoming.data)!==incoming.sha256)throw new Error('El archivo no tiene el formato o la integridad esperados. No se ha importado.');
    let current=db;if(!db.accounts.length&&!db.events.length)current=M.empty(incoming.data.baseCurrency);
    const merged=M.merge(current,incoming.data);if(!merged.added){notice('Archivo ya presente: '+merged.duplicates+' registros identicos. Sin duplicados nuevos.');return;}
    if(!confirm(`Importar ${merged.added} registros nuevos y omitir ${merged.duplicates} identicos? No se sustituiran datos diferentes. Se conserva la version anterior.`))return;
    await exportJson();await commit(merged.value);notice('Importacion confirmada. '+merged.added+' registros incorporados.');
    }finally{busy=false;}
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.tab)return chooseTab(button.dataset.tab);
    if(button.dataset.goto)return chooseTab(button.dataset.goto);
    if(button.dataset.close){if(button.dataset.close==='editor')closeEditor();else{$(button.dataset.close).close();if(button.dataset.close==='accountDetail')detailId=null;}return;}
    if(button.dataset.sort){const [kind,key]=button.dataset.sort.split(':');sorts[kind]={key,direction:sorts[kind].key===key?-sorts[kind].direction:1};render();return;}
    const name=button.dataset.action,key=button.dataset.id;
    try{
      if(name==='new-account')showEditor({kind:'account'});
      if(name==='csv-accounts'||name==='csv-events'){const rows=M.exportRows(db),kind=name==='csv-accounts'?'accounts':'events';download(M.csv(rows[kind]),name==='csv-accounts'?'fondeo-cuentas.csv':'fondeo-movimientos.csv','text/csv;charset=utf-8');$('infoDialog').close();}
      if(name==='new-event')newEvent();
      if(name==='event-type'){$('infoDialog').close();showEditor({kind:'event',type:button.dataset.type,accountId:key});}
      if(name==='detail')showDetail(key);
      if(name==='edit-event')showEditor({kind:'event',eventId:key});
      if(['void-event','delete-event','restore-event'].includes(name))await toggleEvent(key,name.split('-')[0]);
      const types={approve:'approved',fail:'failed',reset:'reset',request:'requested','close-account':'closed'};
      if(types[name])showEditor({kind:'event',type:types[name],accountId:detailId});
      if(name==='account-expense')newEvent(detailId);
      if(name==='edit-account')showEditor({kind:'editAccount',accountId:detailId});
      if(['receive-request','reject-request','cancel-request'].includes(name))showEditor({kind:'event',accountId:detailId,type:{'receive-request':'received','reject-request':'rejected','cancel-request':'cancelled'}[name],requestId:button.dataset.request});
      if(name==='delete-account'||name==='restore-account'){
        const account=db.accounts.find(a=>a.id===detailId),count=db.events.filter(e=>e.accountId===detailId).length;
        if(confirm(name==='delete-account'?`Retirar ${account.company} / ${account.name} y sus ${count} eventos de todos los calculos? Se conserva el historial y puede restaurarse.`:'Restaurar la cuenta con todos sus movimientos?'))await mutate(next=>{const i=next.accounts.findIndex(a=>a.id===detailId);next.accounts[i]=revise(next.accounts[i],{deletedAt:name==='delete-account'?new Date().toISOString():null});});
      }
    }catch(error){notice(error.message,true);}
  });
  for(const target of ['companyFilter','sizeFilter','periodFilter','fromDate','toDate','eventMarkers','stateFilter','showDeletedAccounts','movementType','showVoided'])$(target).addEventListener('change',()=>{document.querySelectorAll('.custom-period').forEach(el=>el.hidden=$('periodFilter').value!=='custom');render();});
  $('accountSearch').oninput=()=>render();$('newAccount').onclick=()=>showEditor({kind:'account'});$('newMovement').onclick=()=>newEvent();$('definitions').onclick=definitions;
  $('eventForm').oninput=()=>{dirty=true;updateFxField();};$('eventForm').onchange=()=>{dirty=true;updateFxField();};$('eventForm').onsubmit=submit;
  $('editor').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
  $('exportJson').onclick=()=>exportJson().catch(error=>notice(error.message,true));$('exportCsv').onclick=()=>{$('infoTitle').textContent='Exportar CSV';$('infoContent').innerHTML=`<div class="account-actions">${action('csv-accounts','Cuentas','download')}${action('csv-events','Movimientos','download')}</div>`;$('infoDialog').showModal();refreshIcons();};
  $('importJson').onclick=()=>$('importFile').click();$('importFile').onchange=event=>importJson(event.target.files[0]).catch(error=>notice(error.message,true)).finally(()=>event.target.value='');
  $('movementType').innerHTML+=Object.entries(M.TYPES).map(([value,label])=>option(value,label)).join('');$('fromDate').value=M.today();$('toDate').value=M.today();
  window.ghHasUnsavedChanges=()=>dirty||unsavedBook;window.ghEditorSnapshot=()=>({funding:M.clone(db),form:editor?Object.fromEntries(new FormData($('eventForm'))):null});
  window.addEventListener('beforeunload',event=>{if(dirty||busy||unsavedBook){event.preventDefault();event.returnValue='Hay cambios pendientes';}});
  setInterval(()=>{if(unsavedBook&&window.FTRecords?.states.get('funding')?.state==='confirmed'&&JSON.stringify(FTRecords.values.get('funding')?.funding_tracker_v1)===JSON.stringify(db)){unsavedBook=false;if(editor?.waiting){dirty=false;$('editor').close();editor=null;}notice('');render();if(detailId&&$('accountDetail').open)showDetail(detailId);}},1000);
  async function previewAdapter(){
    const storage=await new Promise((resolve,reject)=>{const request=indexedDB.open('full-training-funding-preview-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('book');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const get=()=>new Promise((resolve,reject)=>{const request=storage.transaction('book','readonly').objectStore('book').get('preview');request.onsuccess=()=>resolve(request.result||M.empty());request.onerror=()=>reject(request.error);});
    return {load:get,save:async value=>{await new Promise((resolve,reject)=>{const tx=storage.transaction('book','readwrite');tx.objectStore('book').put(M.clone(value),'preview');tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('No se pudo guardar la copia local de prueba.'));});if(JSON.stringify(await get())!==JSON.stringify(value))throw new Error('Copia local no verificada.');}};
  }
  async function boot(){
    try{
      const preview=new URLSearchParams(location.search).get('preview')==='1'&&['127.0.0.1','localhost'].includes(location.hostname);
      if(preview){$('previewNotice').hidden=false;adapter=await previewAdapter();canEdit=true;}
      else{
        if(!window.FTSession||!window.FTRecords)throw new Error('Abre esta herramienta desde tu panel privado de Cloudflare. No se guardara en los HTML antiguos.');
        await FTSession.requireSection('funding');
        canEdit=FTSession.writesEnabled;
        adapter={load:async()=>{const section=await FTRecords.open('funding');return section.funding_tracker_v1||M.empty();},save:async value=>{await FTRecords.setDraft('funding',{funding_tracker_v1:value});await FTRecords.save('funding');},retry:async()=>{if(FTRecords.errors.has('funding'))await FTRecords.persistDraft('funding');if(FTRecords.client.pending.has('funding'))await FTRecords.retry('funding');else{if(JSON.stringify(FTRecords.values.get('funding')?.funding_tracker_v1)!==JSON.stringify(db))await FTRecords.setDraft('funding',{funding_tracker_v1:db});await FTRecords.save('funding');}}};
      }
      db=M.validate(await adapter.load());$('exportJson').disabled=false;$('newAccount').disabled=!canEdit;$('newMovement').disabled=!canEdit;$('importJson').disabled=!canEdit;if(!canEdit)notice('Copia central de solo lectura.');updateFilterOptions();render();window.FundingApp={ready:true,getData:()=>M.clone(db),importFile:importJson,showEditor};
    }catch(error){notice(error.message,true);$('newAccount').disabled=true;$('newMovement').disabled=true;}
  }
  boot();
})();
