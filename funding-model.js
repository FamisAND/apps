(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FundingModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TYPES={fundedFailed:'Suspensión de fondeada',started:'Inicio de evaluación',payoutApproved:'Retirada aprobada',purchase:'Compra de evaluacion',renewal:'Renovacion',reset:'Reset',activation:'Activacion',expense:'Otro gasto',approved:'Evaluacion aprobada',failed:'Evaluacion fallida',closed:'Cuenta cerrada',requested:'Retirada solicitada',received:'Retirada cobrada',rejected:'Retirada rechazada',cancelled:'Retirada cancelada',refund:'Reembolso',capital:'Aportacion al bankroll'};
  const COSTS=new Set(['purchase','renewal','reset','activation','expense']);
  const CASH=new Set([...COSTS,'received','refund','capital','requested']);
  const LIVE=e=>!e.voidedAt&&!e.deletedAt;
  const clone=value=>structuredClone(value);
  const fail=message=>{throw new Error(message);};
  function day(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('Introduce una fecha completa valida.');
    const [y,m,d]=value.split('-').map(Number),t=new Date(Date.UTC(y,m-1,d));
    if(y<1900||y>2200||t.getUTCFullYear()!==y||t.getUTCMonth()!==m-1||t.getUTCDate()!==d)fail('La fecha no existe.');
    return Math.floor(t.getTime()/86400000);
  }
  function today(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
  function minor(value){
    const text=String(value??'').trim().replace(',','.');
    if(!/^\d+(?:\.\d{1,2})?$/.test(text))fail('Importe: utiliza un numero no negativo con hasta dos decimales.');
    const [whole,fraction='']=text.split('.'),number=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
    if(number>100000000000000n)fail('Importe fuera de rango.');return Number(number);
  }
  function rateValue(value){
    const text=String(value??'').trim().replace(',','.');
    if(!/^\d+(?:\.\d{1,8})?$/.test(text))fail('Introduce el cambio con hasta ocho decimales.');
    const [whole,fraction='']=text.split('.'),scaled=BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));
    if(scaled<=0n||scaled>100000000000000n)fail('El cambio debe ser positivo y estar dentro de rango.');return scaled;
  }
  function convert(amount,rate){return Number((BigInt(amount)*rateValue(rate)+50000000n)/100000000n);}
  function money(amount,currency,rate,baseCurrency){
    if(!/^[A-Z]{3}$/.test(currency))fail('Divisa no valida.');
    const value=minor(amount),fx=currency===baseCurrency?'1':String(rate??'').trim().replace(',','.');
    const converted=convert(value,fx);if(!Number.isSafeInteger(converted)||converted>100000000000000)fail('Conversion fuera de rango.');
    return {minor:value,currency,rate:fx,baseMinor:converted};
  }
  function empty(baseCurrency='USD'){return {schemaVersion:1,baseCurrency,accounts:[],events:[]};}
  function order(a,b){return a.date.localeCompare(b.date)||(a.order||0)-(b.order||0)||a.id.localeCompare(b.id);}
  function eventsFor(db,accountId,end='2200-12-31'){return db.events.filter(e=>e.accountId===accountId&&LIVE(e)&&e.date<=end).sort(order);}
  function attemptInfo(db,account,attemptId){
    const attempts=state(db,account.id).attempts,active=attempts.at(-1)?.id;
    if(!attempts.some(a=>a.id===attemptId))fail('El intento no existe en esta cuenta.');
    if(attemptId===active)return {externalId:account.externalIds?.evaluation||account.externalIds?.funded||'',analytics:account.analytics||null,identifierHistory:account.identifierHistory||[]};
    return account.attemptProfiles?.[attemptId]||{externalId:'',analytics:null,identifierHistory:[]};
  }
  function setAttemptIdentifier(db,accountId,attemptId,value,at=new Date().toISOString()){
    const account=db.accounts.find(a=>a.id===accountId),externalId=String(value??'').trim();
    if(!account)fail('Cuenta inexistente.');
    if(!externalId||externalId.length>150)fail('Escribe el identificador nuevo de la cuenta (máximo 150 caracteres).');
    const attempts=state(db,accountId).attempts,active=attempts.at(-1)?.id;
    if(!attempts.some(a=>a.id===attemptId))fail('El intento no existe en esta cuenta.');
    if(attempts.some(a=>a.id!==attemptId&&attemptInfo(db,account,a.id).externalId.toLowerCase()===externalId.toLowerCase()))fail('Este identificador ya corresponde a otro intento de la cuenta.');
    if(attemptId===active){
      const previous=account.externalIds?.evaluation||account.externalIds?.funded||'';
      if(previous===externalId)return;
      account.identifierHistory||=[];if(previous)account.identifierHistory.push({at,previous});
      account.externalIds={...account.externalIds,evaluation:externalId,funded:account.externalIds?.funded||''};
      if(account.nameFromIdentifier)account.name=externalId;
    }else{
      account.attemptProfiles||={};const profile=account.attemptProfiles[attemptId]||{externalId:'',analytics:null,identifierHistory:[]};
      if(profile.externalId===externalId)return;
      profile.identifierHistory||=[];if(profile.externalId)profile.identifierHistory.push({at,previous:profile.externalId});
      profile.externalId=externalId;account.attemptProfiles[attemptId]=profile;
    }
  }
  function beginReset(db,accountId,newAttemptId,externalId,at=new Date().toISOString()){
    const account=db.accounts.find(a=>a.id===accountId);if(!account)fail('Cuenta inexistente.');
    const attempts=state(db,accountId).attempts,active=attempts.at(-1)?.id;
    if(!active)fail('El reset necesita una evaluación anterior.');
    const nextId=String(externalId??'').trim();
    if(!nextId||nextId.length>150)fail('Escribe el nuevo identificador que te ha dado la firma.');
    if(attempts.some(a=>attemptInfo(db,account,a.id).externalId.toLowerCase()===nextId.toLowerCase()))fail('El nuevo identificador debe ser distinto al de los intentos anteriores.');
    account.attemptProfiles||={};
    account.attemptProfiles[active]={externalId:account.externalIds?.evaluation||account.externalIds?.funded||'',analytics:account.analytics||null,identifierHistory:account.identifierHistory||[]};
    delete account.analytics;account.identifierHistory=[];
    account.externalIds={...account.externalIds,evaluation:nextId,funded:account.externalIds?.funded||''};
    account.activeAttemptId=newAttemptId;account.updatedAt=at;
    if(account.nameFromIdentifier)account.name=nextId;
  }
  function attemptEvents(db,accountId){
    const groups=new Map(),assigned=new Map();let current=null;
    for(const event of eventsFor(db,accountId)){
      if(['purchase','reset'].includes(event.type))current=event.id;
      const target=event.type==='refund'&&assigned.has(event.expenseId)?assigned.get(event.expenseId):current;
      if(!groups.has(target))groups.set(target,[]);groups.get(target).push(event);assigned.set(event.id,target);
    }
    return groups;
  }
  function state(db,accountId,end='2200-12-31'){
    const events=eventsFor(db,accountId,end),attempts=[];let current=null,status='not_started',approvedDate=null,closeDate=null;
    for(const e of events){
      if(e.type==='purchase'){
        if(current)fail('Una cuenta solo puede tener una compra inicial. Usa Reset para otro intento.');
        current={id:e.id,startDate:e.date,status:'pending'};attempts.push(current);status='evaluation';
      }else if(e.type==='reset'){
        if(!current||approvedDate)fail('El reset requiere una evaluacion previa sin aprobar.');
        if(current.status==='pending'){current.status='failed';current.endDate=e.date;current.resetEnded=true;}
        current={id:e.id,startDate:e.date,status:'pending'};attempts.push(current);status='evaluation';closeDate=null;
      }else if(e.type==='approved'){
        if(!current||current.status!=='pending'||approvedDate)fail('Solo se puede aprobar el intento que esta en evaluacion.');
        current.status='approved';current.approvedDate=e.date;current.endDate=e.date;approvedDate=e.date;status='funded';
      }else if(e.type==='failed'){
        if(!current||current.status!=='pending'||approvedDate)fail('Solo se puede marcar como fallida una evaluacion abierta.');
        current.status='failed';current.endDate=e.date;status='failed';closeDate=e.date;
      }else if(['closed','fundedFailed'].includes(e.type)){
        if(status!=='funded')fail('Solo se puede cerrar una cuenta fondeada activa.');
        status='closed';closeDate=e.date;
      }else if(['requested','payoutApproved','received','rejected','cancelled'].includes(e.type)){
        if(!approvedDate)fail('Las retiradas requieren una evaluacion aprobada en esa fecha.');
        if(e.type==='requested'&&status!=='funded')fail('La solicitud debe ser anterior al cierre de la cuenta.');
      }
      if(e.type!=='purchase'&&!current)fail('El evento debe ser posterior a la compra de la cuenta.');
    }
    return {status,attempts,approvedDate,closeDate,events,firstReceived:events.filter(e=>e.type==='received')[0]||null};
  }
  function validate(db){
    if(!db||db.schemaVersion!==1||!['USD','EUR'].includes(db.baseCurrency)||!Array.isArray(db.accounts)||!Array.isArray(db.events))fail('Formato de Tracker de Fondeo incompatible.');
    if(db.accounts.length>10000||db.events.length>50000)fail('El archivo es demasiado grande para una importacion normal.');
    if(db.analysis){if(db.analysis.version!==1||!Array.isArray(db.analysis.templates)||!Array.isArray(db.analysis.saved))fail('Extensión del analizador incompatible.');if(db.analysis.labV4){const lab=db.analysis.labV4;if(typeof lab!=='object'||Array.isArray(lab)||Object.keys(lab).some(k=>!['TCP25','TCP50'].includes(k))||Object.values(lab).some(plan=>!plan||typeof plan!=='object'||Array.isArray(plan)||Object.keys(plan).length>40||Object.values(plan).some(v=>typeof v!=='string'||v.length>150)))fail('Configuración FondeoLab no válida.');}const extensionIds=new Set();for(const item of [...db.analysis.templates,...db.analysis.saved]){if(!item||typeof item.id!=='string'||!item.id||extensionIds.has(item.id)||typeof item.name!=='string'||!item.config||item.config.version!==1)fail('Configuración o análisis no válido.');extensionIds.add(item.id);}}
    const ids=new Set(),accounts=new Map();
    for(const a of db.accounts){
      if(typeof a.id!=='string'||!a.id||ids.has(a.id)||typeof a.company!=='string'||!a.company.trim()||typeof a.name!=='string'||!a.name.trim())fail('Cuenta incompleta o ID duplicado.');
      if(a.externalIds&&(!['evaluation','funded'].every(k=>typeof a.externalIds[k]==='string'&&a.externalIds[k].length<=150)))fail('Identificador externo no válido.');
      if(a.attemptProfiles&&(typeof a.attemptProfiles!=='object'||Array.isArray(a.attemptProfiles)))fail('Historial de intentos incompatible.');
      for(const profile of Object.values(a.attemptProfiles||{}))if(!profile||typeof profile!=='object'||typeof profile.externalId!=='string'||profile.externalId.length>150||!Array.isArray(profile.identifierHistory||[]))fail('Identificador de intento no válido.');
      if(a.identifierHistory&&!Array.isArray(a.identifierHistory))fail('Historial de identificadores no válido.');
      for(const t of [a.analytics,...Object.values(a.attemptProfiles||{}).map(profile=>profile.analytics)].filter(Boolean)){if(t.version!==1||!Array.isArray(t.rows)||!Array.isArray(t.imports)||!t.settings||typeof t.settings.timeZone!=='string'||!Number.isInteger(t.settings.dayStart)||t.settings.dayStart<0||t.settings.dayStart>23)fail('Analytics incompatible.');
        try{if(t.settings.timeZone)new Intl.DateTimeFormat('en',{timeZone:t.settings.timeZone});}catch{fail('Zona de Analytics inválida.');}
        const rowIds=new Set(),imports=new Set();for(const f of t.imports){if(typeof f.id!=='string'||imports.has(f.id)||typeof f.hash!=='string'||typeof f.base64!=='string')fail('Historial CSV no válido.');imports.add(f.id);}if(t.activeImportId&&!imports.has(t.activeImportId))fail('Archivo activo de Analytics inexistente.');
        let total=0;for(const r of t.rows){if(typeof r.id!=='string'||!r.id||rowIds.has(r.id)||!imports.has(r.importId)||!Number.isSafeInteger(r.net)||!['gross','fees'].every(k=>r[k]==null||Number.isSafeInteger(r[k]))||r.gross!=null&&r.fees!=null&&r.gross-r.fees!==r.net||!Number.isFinite(r.closed)||r.opened!=null&&(!Number.isFinite(r.opened)||r.opened>r.closed)||!Number.isFinite(r.quantity)||r.quantity<=0||!['long','short'].includes(r.side)||typeof r.symbol!=='string'||!/^[A-Z]{3}$/.test(r.currency)||r.currency!==t.settings.currency)fail('Operación de Analytics no válida.');total+=Math.abs(r.net)+Math.abs(r.gross||0)+Math.abs(r.fees||0);if(!Number.isSafeInteger(total))fail('Analytics supera el rango monetario seguro.');rowIds.add(r.id);}
      }
      ids.add(a.id);accounts.set(a.id,a);
    }
    const eventIds=new Set(),dispositions=new Set();let totalAmount=0;
    for(const e of db.events){
      if(typeof e.id!=='string'||!e.id||eventIds.has(e.id)||ids.has(e.id)||!TYPES[e.type])fail('Evento no valido o ID duplicado.');
      eventIds.add(e.id);day(e.date);
      if(!Number.isSafeInteger(e.order)||e.order<0)fail('Orden de evento no valido.');
      if(e.accountId&&!accounts.has(e.accountId))fail('Hay un movimiento vinculado a una cuenta inexistente.');
      if(!e.accountId&&!['capital','expense','refund'].includes(e.type))fail('Este evento necesita una cuenta.');
      if(e.type==='capital'&&e.accountId)fail('Las aportaciones son del negocio, no de una cuenta.');
      if(CASH.has(e.type)){
        const m=e.money;
        if(!m||!Number.isSafeInteger(m.minor)||m.minor<0||m.minor>100000000000000||!/^[A-Z]{3}$/.test(m.currency)||!Number.isSafeInteger(m.baseMinor)||m.baseMinor!==convert(m.minor,m.rate)||m.currency===db.baseCurrency&&rateValue(m.rate)!==100000000n)fail('Importe o conversion incoherente. No se ha importado.');
        if(['requested','received','capital'].includes(e.type)&&m.minor===0)fail('Las aportaciones, solicitudes y cobros deben ser mayores que cero.');
        totalAmount+=m.baseMinor;if(!Number.isSafeInteger(totalAmount))fail('El total supera el rango monetario seguro.');
      }else if(e.money)fail('Una transicion no debe tener importe economico.');
      if(e.feeDeductedMinor!=null&&(!Number.isSafeInteger(e.feeDeductedMinor)||e.feeDeductedMinor<0||e.type!=='received'))fail('Comision informativa no valida.');
    }
    for(const e of db.events.filter(LIVE)){
      if(e.requestId){
        const request=db.events.find(r=>r.id===e.requestId&&LIVE(r));
        if(!request||request.type!=='requested'||request.accountId!==e.accountId||order(request,e)>0||!['received','payoutApproved','rejected','cancelled'].includes(e.type))fail('La resolucion no corresponde a una solicitud valida anterior.');
        if(e.type!=='payoutApproved'&&dispositions.has(e.requestId))fail('Esta solicitud ya tiene una resolucion. No se puede cobrar dos veces.');if(e.type!=='payoutApproved')dispositions.add(e.requestId);
      }
      if(['payoutApproved','rejected','cancelled'].includes(e.type)&&!e.requestId)fail('Selecciona la solicitud que vas a resolver.');
      if(e.type==='refund'){
        const original=db.events.find(r=>r.id===e.expenseId&&LIVE(r));
        if(!original||!COSTS.has(original.type)||original.accountId!==e.accountId||original.money.currency!==e.money.currency||order(original,e)>0)fail('El reembolso debe vincularse al gasto original, en su misma divisa.');
        const total=db.events.filter(r=>r.type==='refund'&&r.expenseId===original.id&&LIVE(r)).reduce((sum,r)=>sum+r.money.minor,0);
        if(total>original.money.minor)fail('Los reembolsos superan el gasto original.');
      }
    }
    for(const a of db.accounts){const s=state(db,a.id);if(!s.attempts.length&&!a.deletedAt)fail('Cada cuenta necesita su compra inicial.');const current=s.attempts.at(-1)?.id,valid=new Set(s.attempts.map(x=>x.id));if(a.activeAttemptId&&a.activeAttemptId!==current)fail('El reset activo no coincide con el historial de intentos.');if(Object.keys(a.attemptProfiles||{}).some(k=>!valid.has(k)||k===current))fail('Un intento anterior ha quedado sin su reset; restáuralo antes de guardar.');}
    return db;
  }
  function amount(e){return e.money?.baseMinor||0;}
  function effect(e){if(COSTS.has(e.type))return -amount(e);if(e.type==='received'||e.type==='refund')return amount(e);return 0;}
  function summary(events){
    const total=type=>events.filter(e=>e.type===type).reduce((sum,e)=>sum+amount(e),0);
    const gross=events.filter(e=>COSTS.has(e.type)).reduce((sum,e)=>sum+amount(e),0),refunds=total('refund'),received=total('received'),expenses=gross-refunds;
    return {grossExpenses:gross,refunds,expenses,received,capital:total('capital'),net:received-expenses,roi:expenses>0?(received-expenses)/expenses*100:null};
  }
  const average=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  function median(values){if(!values.length)return null;const a=[...values].sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;}
  function matches(account,filters){return (!filters.company||account?.company===filters.company)&&(!filters.size||account?.name===filters.size);}
  function metrics(db,filters={}){
    const start=filters.start||'1900-01-01',end=filters.end||today();day(start);day(end);if(start>end)fail('El inicio del periodo debe ser anterior al final.');
    const accounts=db.accounts.filter(a=>!a.deletedAt&&matches(a,filters)),ids=new Set(accounts.map(a=>a.id));
    const relevant=e=>LIVE(e)&&(e.accountId?ids.has(e.accountId):!filters.company&&!filters.size);
    const all=db.events.filter(e=>relevant(e)&&e.date<=end).sort(order),period=all.filter(e=>e.date>=start),cash=summary(period),lifetime=summary(all);
    const states=accounts.map(a=>({account:a,...state(db,a.id,end)})).filter(s=>s.attempts.length);
    const attempts=states.flatMap(s=>s.attempts),cohort=attempts.filter(a=>a.startDate>=start&&a.startDate<=end);
    const completed=attempts.filter(a=>a.status!=='pending'&&a.endDate>=start&&a.endDate<=end),passed=completed.filter(a=>a.status==='approved');
    const funded=states.filter(s=>s.approvedDate&&s.approvedDate>=start&&s.approvedDate<=end),paid=funded.filter(s=>s.firstReceived);
    const pendingClaim=s=>s.events.some(e=>e.type==='requested'&&!s.events.some(r=>r.type!=='payoutApproved'&&r.requestId===e.id));
    const known=funded.filter(s=>s.firstReceived||s.status==='closed'&&!pendingClaim(s));
    const approvalDays=passed.map(a=>day(a.approvedDate)-day(a.startDate)),payoutDays=paid.map(s=>day(s.firstReceived.date)-day(s.approvedDate));
    const evalCosts=period.filter(e=>['purchase','reset'].includes(e.type)).reduce((sum,e)=>sum+amount(e),0)-period.filter(e=>e.type==='refund'&&['purchase','reset'].includes(db.events.find(x=>x.id===e.expenseId)?.type)).reduce((sum,e)=>sum+amount(e),0);
    let running=0,peak=0,maxDrawdown=0,spent=0,received=0,bankroll=0;
    const groups=new Map();
    for(const e of all){running+=effect(e);spent+=COSTS.has(e.type)?amount(e):e.type==='refund'?-amount(e):0;received+=e.type==='received'?amount(e):0;bankroll+=effect(e)+(e.type==='capital'?amount(e):0);groups.set(e.date,{date:e.date,expenses:spent,received,net:running,bankroll,events:(groups.get(e.date)?.events||0)+Number(!['renewal','expense'].includes(e.type))});}
    // Dates have no intraday timestamps: measure daily cash closes, never input order.
    for(const point of groups.values()){peak=Math.max(peak,point.net);maxDrawdown=Math.max(maxDrawdown,peak-point.net);}
    const opening=[...groups.values()].filter(p=>p.date<start).at(-1)||{expenses:0,received:0,net:0,bankroll:0,events:0};
    const points=[{...opening,date:start},...[...groups.values()].filter(p=>p.date>=start)];
    if(points.at(-1).date!==end)points.push({...points.at(-1),date:end,events:0});
    const monthMap=new Map();
    const firstMonth=(filters.start||all[0]?.date||end).slice(0,7);let month=firstMonth;
    while(month<=end.slice(0,7)){monthMap.set(month,0);const [y,m]=month.split('-').map(Number);month=`${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}`;}
    for(const e of period){const month=e.date.slice(0,7);monthMap.set(month,(monthMap.get(month)||0)+effect(e));}
    const global=summary(db.events.filter(e=>LIVE(e)&&e.date<=end&&(!e.accountId||db.accounts.some(a=>a.id===e.accountId&&!a.deletedAt))));
    return {...cash,lifetime,states,period,points,monthly:[...monthMap].map(([month,net])=>({month,net})),bankroll:global.capital+global.net,maxDrawdown,
      purchases:period.filter(e=>e.type==='purchase').length,resets:period.filter(e=>e.type==='reset').length,attempts:cohort.length,approvals:passed.length,finalized:completed.length,
      fundingRate:completed.length?passed.length/completed.length*100:null,payoutRate:known.length?paid.length/known.length*100:null,paidAccounts:paid.length,payoutKnown:known.length,payoutPending:funded.filter(s=>!s.firstReceived&&(s.status==='funded'||pendingClaim(s))).length,
      evaluation:states.filter(s=>s.status==='evaluation').length,fundedActive:states.filter(s=>s.status==='funded').length,closed:states.filter(s=>['failed','closed'].includes(s.status)).length,
      costPerFunded:passed.length?evalCosts/passed.length:null,costPerPaid:paid.length?cash.expenses/paid.length:null,
      averageApprovalDays:average(approvalDays),medianApprovalDays:median(approvalDays),averagePayoutDays:average(payoutDays),medianPayoutDays:median(payoutDays)};
  }
  function merge(current,incoming){
    validate(incoming);if(current.baseCurrency!==incoming.baseCurrency)fail('La divisa base del archivo no coincide. No se han convertido ni sustituido datos.');
    const next=clone(current);let added=0,duplicates=0;
    const stable=value=>{if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;};
    for(const key of ['accounts','events'])for(const item of incoming[key]){
      const existing=next[key].find(v=>v.id===item.id);
      if(!existing){next[key].push(clone(item));added++;}
      else if(JSON.stringify(stable(existing))===JSON.stringify(stable(item)))duplicates++;
      else fail('Conflicto con un ID existente. No se ha importado nada; conserva ambos archivos y revisa las diferencias.');
    }
    if(incoming.analysis){if(incoming.analysis.version!==1)fail('Analizador incompatible.');next.analysis ||= {version:1,templates:[],saved:[]};for(const key of ['templates','saved'])for(const item of incoming.analysis[key]||[]){const old=next.analysis[key].find(x=>x.id===item.id);if(!old){next.analysis[key].push(clone(item));added++;}else if(JSON.stringify(stable(old))!==JSON.stringify(stable(item)))fail('Conflicto en configuración o análisis guardado.');else duplicates++;}if(incoming.analysis.labV4){if(!next.analysis.labV4){next.analysis.labV4=clone(incoming.analysis.labV4);next.analysis.labV4SavedAt=incoming.analysis.labV4SavedAt||null;added++;}else if(JSON.stringify(stable(next.analysis.labV4))===JSON.stringify(stable(incoming.analysis.labV4)))duplicates++;else fail('Conflicto en la configuración de FondeoLab.');}}
    validate(next);return {value:next,added,duplicates};
  }
  function csv(rows){return '\ufeff'+rows.map(row=>row.map(v=>'"'+(typeof v==='number'?String(v):String(v??'').replace(/^[\s]*[=+@\-\t\r]/,"'$&")).replaceAll('"','""')+'"').join(';')).join('\r\n');}
  function exportRows(db){
    return {accounts:[['ID','Empresa','Cuenta','Estado','Inicio','Aprobacion','Cierre','Resultado '+db.baseCurrency,'Notas','Eliminada','Intentos e identificadores','Identificador evaluación','Identificador fondeada'],...db.accounts.map(a=>{const s=state(db,a.id);return [a.id,a.company,a.name,s.status,s.attempts[0]?.startDate,s.approvedDate,s.closeDate,summary(s.events).net/100,a.notes,!!a.deletedAt,s.attempts.map((attempt,index)=>`${index+1}: ${attemptInfo(db,a,attempt.id).externalId||'sin asignar'}`).join(' | '),a.externalIds?.evaluation,a.externalIds?.funded];})],
      events:[['ID','Cuenta ID','Empresa','Evento','Fecha','Importe original','Divisa','Cambio a '+db.baseCurrency,'Importe '+db.baseCurrency,'Solicitud ID','Gasto original ID','Comision ya descontada','Notas','Anulado','Eliminado'],...db.events.map(e=>[e.id,e.accountId,db.accounts.find(a=>a.id===e.accountId)?.company,TYPES[e.type],e.date,e.money?.minor==null?'':e.money.minor/100,e.money?.currency,e.money?.rate,e.money?.baseMinor==null?'':e.money.baseMinor/100,e.requestId,e.expenseId,e.feeDeductedMinor==null?'':e.feeDeductedMinor/100,e.notes,!!e.voidedAt,!!e.deletedAt])]};
  }
  return {TYPES,COSTS,CASH,LIVE,day,today,minor,money,empty,validate,state,attemptInfo,setAttemptIdentifier,beginReset,attemptEvents,metrics,summary,merge,csv,exportRows,order,clone};
});
