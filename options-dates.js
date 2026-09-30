/* Date-only arithmetic. A date is never parsed as a local/UTC instant. */
const DAY_MS = 86400000;
function localISODate(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function marketISODate(date=new Date(),zone='America/New_York'){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
}
function calendarDayIndex(value){
  if(value instanceof Date) value=marketISODate(value);
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
  if(!m)return null;
  const [y,mo,d]=m.slice(1).map(Number),date=new Date(0);
  date.setUTCFullYear(y,mo-1,d);date.setUTCHours(0,0,0,0);
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)return null;
  return date.getTime()/DAY_MS;
}
function calendarDaysBetween(start,end){
  const a=calendarDayIndex(start),b=calendarDayIndex(end);
  return a===null||b===null?null:b-a;
}
// This is an explicit calendar convention, not an undocumented broker session rule.
let optionsValuationDate=marketISODate();
function optionDTE(expiration,valuation=optionsValuationDate){return calendarDaysBetween(valuation,expiration);}
function setOptionsValuationDate(value){
  if(calendarDayIndex(value)===null)throw new Error('Fecha de valoración no válida');
  optionsValuationDate=value;
  if(typeof renderActivas==='function')renderActivas();
  const input=document.getElementById('optionsValuationDate');if(input)input.value=value;
}
document.addEventListener('DOMContentLoaded',()=>{
  const nav=document.querySelector('.nav');
  for(const id of ['ghChangePinBtn','ghHomeBtn']){
    const button=document.getElementById(id);
    if(nav&&button){button.style.position='static';button.style.flexShrink='0';nav.prepend(button);}
  }
  const select=document.getElementById('actSortBy');if(!select)return;
  select.parentElement.style.flexWrap='wrap';select.parentElement.style.maxWidth='100%';
  select.parentElement.parentElement.style.flexWrap='wrap';select.parentElement.parentElement.style.gap='12px';
  const box=document.createElement('div');box.style.cssText='display:flex;flex-wrap:wrap;flex-basis:100%;gap:8px;align-items:center;font-size:12px;padding:8px 0';
  box.innerHTML='<label for="optionsValuationDate">Fecha de valoración DTE</label><input id="optionsValuationDate" type="date"><button type="button" id="optionsValuationToday">Hoy (Nueva York)</button><span id="optionsValuationNotice">Fecha fija hasta actualizarla; vencimiento = 0 días.</span>';
  select.parentElement.insertAdjacentElement('afterend',box);
  document.getElementById('optionsValuationToday').style.cssText='background:#101b28;border:1px solid #4a9eff;color:#c9d1d9;padding:6px 10px;border-radius:4px;cursor:pointer';
  const input=document.getElementById('optionsValuationDate');input.value=optionsValuationDate;
  input.addEventListener('change',()=>{try{setOptionsValuationDate(input.value);}catch(e){input.value=optionsValuationDate;}});
  document.getElementById('optionsValuationToday').addEventListener('click',()=>setOptionsValuationDate(marketISODate()));
  const notice=()=>{document.getElementById('optionsValuationNotice').textContent=marketISODate()!==optionsValuationDate?'La fecha de mercado ha cambiado. Actualiza la valoración si corresponde.':'Fecha fija hasta actualizarla; vencimiento = 0 días.';};
  setInterval(notice,30000);document.addEventListener('visibilitychange',notice);
});
