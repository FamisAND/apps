(function(root){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  function iso(y,m,d){
    if(y<1900||y>2200||m<1||m>12||d<1||d>31)return null;
    const date=new Date(Date.UTC(y,m-1,d));
    return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d
      ?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;
  }
  function fullDate(value){
    let m=String(value||'').trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if(m)return iso(+m[1],+m[2],+m[3]);
    m=String(value||'').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    return m?iso(m[3].length===2?2000+(+m[3]):+m[3],+m[2],+m[1]):null;
  }
  function shortDate(value){const date=fullDate(value);return date?date.slice(8)+'/'+date.slice(5,7):String(value||'');}
  function localToday(date=new Date()){return iso(date.getFullYear(),date.getMonth()+1,date.getDate());}
  const ordinal=value=>Date.parse(value+'T12:00:00Z')/86400000;
  // Choose a year only inside an anchored planning window; never use today's year for an old plan.
  function resolveDate(value,{existing='',start='',previous='',next='',days=180}={}){
    value=String(value||'').trim();
    if(!value)return '';
    const full=fullDate(value);if(full)return full;
    const m=value.match(/^(\d{1,2})[/.\-](\d{1,2})$/);
    if(!m)throw Error('Fecha no válida. Utiliza DD/MM o una fecha completa.');
    if(![2024,2025].some(y=>iso(y,+m[2],+m[1])))throw Error('Esta fecha no existe en el calendario.');
    const old=fullDate(existing);
    if(old&&shortDate(old)===String(+m[1]).padStart(2,'0')+'/'+String(+m[2]).padStart(2,'0'))return old;
    const before=fullDate(previous),after=fullDate(next),anchor=fullDate(start)||before||after;
    if(!anchor)throw Error('Falta el año de esta planificación. Confirma la fecha completa DD/MM/AAAA.');
    const year=+anchor.slice(0,4),low=before?ordinal(before):ordinal(anchor)-7;
    const high=after?ordinal(after):ordinal(anchor)+days;
    const candidates=[year-1,year,year+1].map(y=>iso(y,+m[2],+m[1])).filter(Boolean)
      .filter(d=>ordinal(d)>=low&&ordinal(d)<=high);
    if(candidates.length!==1)throw Error('Año o secuencia ambiguos. Confirma esta fecha con DD/MM/AAAA; las demás no cambiarán.');
    return candidates[0];
  }
  function dateContext(a,it,mn,entId){
    const days=a?.rutina?.entrenos||[],order=days.findIndex(en=>en.id===entId);
    const position=Number(mn)*days.length+order,neighbors=[];
    for(const [micro,entries]of Object.entries(it?.sesiones||{}))for(const [id,s]of Object.entries(entries)){
      const i=days.findIndex(en=>en.id===id),date=fullDate(s.fecha);
      if(date&&i>=0)neighbors.push({position:Number(micro)*days.length+i,date});
    }
    const previous=neighbors.filter(n=>n.position<position).sort((a,b)=>b.position-a.position)[0]?.date;
    const next=neighbors.filter(n=>n.position>position).sort((a,b)=>a.position-b.position)[0]?.date;
    const start=fullDate(it?.fechaInicio)||(Number(it?.numero||1)===1?fullDate(a?.fechaInicio):null);
    return {existing:it?.sesiones?.[mn]?.[entId]?.fecha,start,previous,next};
  }
  function basePlan(ej,mn){
    return ej.planByMicro?.[mn]||(ej.source?{series:0,repsTarget:[],pausa:'',label:'No programado'}:ej.planBase||{series:3,repsTarget:[10],pausa:''});
  }
  function effective(ej,mn,it,entId){
    const patch=it?.sesiones?.[mn]?.[entId]?.ejs?.[ej.id]?.prescripcion||{};
    const plan={...basePlan(ej,mn),...(patch.plan||{})};
    if(patch.plan&&['series','repsTarget'].some(k=>Object.hasOwn(patch.plan,k)))delete plan.label;
    return {...ej,...patch,plan};
  }
  function hasResults(record){return ['series','lineas'].some(k=>(record?.[k]||[]).some(row=>row?.kg!=null&&row.kg!==''||row?.reps!=null&&row.reps!==''));}
  function patchFor(ej,mn,desired,it,entId){
    const current=effective(ej,mn,it,entId),record=it?.sesiones?.[mn]?.[entId]?.ejs?.[ej.id];
    if(desired.nombre!==current.nombre&&hasResults(record))throw Error('Ya hay resultados en esta sesión. No se puede sustituir el movimiento ni reinterpretar sus marcas.');
    if(ej.tipo==='circuito'&&desired.nombre!==current.nombre)throw Error('Conserva la identidad y el orden de los componentes del circuito.');
    const old=record?.prescripcion||{},patch={...old,plan:{...(old.plan||{})}},base=basePlan(ej,mn);
    for(const key of ['nombre','subtitle','libraryId']){
      if(desired[key]===ej[key]||(desired[key]===''&&ej[key]==null))delete patch[key];
      else if(Object.hasOwn(desired,key))patch[key]=desired[key];
    }
    for(const [key,value]of Object.entries(desired.plan||{})){
      if(JSON.stringify(value)===JSON.stringify(base[key]??''))delete patch.plan[key];else patch.plan[key]=clone(value);
    }
    if(!Object.keys(patch.plan).length)delete patch.plan;
    return patch;
  }
  function resultName(ej,record){return record?.prescripcion?.nombre||ej._routineBaseName||ej.nombre;}
  const api={clone,iso,fullDate,shortDate,localToday,resolveDate,dateContext,basePlan,effective,hasResults,patchFor,resultName};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.FTRoutine=api;
})(typeof window==='undefined'?globalThis:window);
