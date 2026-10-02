/* Decision aid transcribed from the user's PCS SPX operative sheet v1.7. */
function pcsCycleMetrics(a,today,m){
  const history=a.idOp==null||String(a.idOp).trim()===''?[]:HIST.filter(h=>String(h.idOp)===String(a.idOp)&&h.activo===a.activo).map(computeEntry);
  const dates=[a.apertura,...history.map(h=>h.apertura)].filter(d=>calendarDayIndex(d)!==null).sort();
  const duration=dates.length&&a.exp?calendarDaysBetween(dates[0],a.exp):null;
  const elapsed=dates.length?calendarDaysBetween(dates[0],today):null;
  const time=duration>0&&elapsed!=null?Math.max(0,elapsed/duration*100):null;
  const realized=history.reduce((sum,h)=>sum+(h.totalNeto||0)*100,0);
  // Closed-leg P/L plus the current opening credit is the accumulated net
  // cycle credit: the debit paid to close each rolled leg is counted once.
  const currentDebit=premiumStoredToPoints(a.pDebito||0,a.contracts||1)*100*(a.contracts||1);
  const credit=realized+m.premiumTotal-currentDebit-(Number(a.comi)||0);
  const profit=m.pnlEst!=null&&credit>0?(realized+m.pnlEst-(Number(a.comi)||0))/credit*100:null;
  return {time,profit,et:profit!=null&&time!=null?profit-time:null,checkpoint:time==null?null:time>=75?75:time>=50?50:time>=25?25:0};
}
function pcsRecommendation(a,today,m){
  const cycle=pcsCycleMetrics(a,today,m);
  if(m.dteLeft!=null&&m.dteLeft<=0)return {action:'Gestionar vencimiento',situation:'No esperar a expiración',tone:'bad',comment:'Revisar el último día de negociación del contrato.'};
  if(cycle.checkpoint==null)return {action:'Revisar fechas del ciclo',situation:'Faltan datos',tone:'warn',comment:'Se necesita la primera apertura y el vencimiento actual.'};
  const decision=pcsDecision({checkpoint:cycle.checkpoint,profit:cycle.profit,et:cycle.et,viable:'unknown',emergency:!!a.emergencyReview});
  return {...decision,situation:`${cycle.checkpoint?'CP'+cycle.checkpoint:'Fresh'} · ciclo ${cycle.profit==null?'sin precio':cycle.profit.toFixed(1)+'%'}`,comment:decision.detail};
}
function pcsDecision({checkpoint,profit,viable,emergency,et}){
  if(Number.isFinite(et)&&et>=20)return {action:'Revisar cierre del ciclo',detail:'ET ≥ +20: señal extraordinaria. Usa el P/L y el tiempo acumulados de todo el ciclo, incluidos los FIX.',tone:'good'};
  if(emergency && Number(checkpoint)<50)return {action:'Emergency FIX Review',detail:'Comparar mantener y defender. No es un FIX automático ni se activa solo porque el P/L sea rojo.',tone:'warn'};
  if(!Number.isFinite(profit))return {action:'Introduce el profit del ciclo',detail:'No uses el profit de la pata actual después de un roll.',tone:'idle'};
  if(Number(checkpoint)>=75){
    if(profit>0)return {action:'Cerrar el ciclo',detail:'CP75 con beneficio: cerrar. Hay que actuar siempre.',tone:'good'};
    if(profit<0)return {action:'Evaluar FIX defensivo',detail:'CP75 con pérdida: FIX, sujeto a defensa real y al Risk Budget.',tone:'bad'};
    return {action:'Decidir ahora',detail:'CP75 a cero: la hoja exige actuar, pero no especifica una regla para el empate. Revisar la estructura.',tone:'warn'};
  }
  if(Number(checkpoint)>=50){
    if(profit>=50)return {action:'Cerrar el ciclo',detail:'CP50 con profit ≥ 50%. Después, revisar cartera.',tone:'good'};
    if(viable==='yes')return {action:'Mantener',detail:'CP50 por debajo del objetivo, con estructura viable.',tone:'idle'};
    if(viable==='no')return {action:'Evaluar FIX defensivo',detail:'CP50 con estructura comprometida. Comparar la defensa obtenida con el riesgo añadido.',tone:'bad'};
    return {action:'Revisar viabilidad',detail:'Si sigue viable: mantener. Si está comprometida: FIX. El profit por sí solo no decide.',tone:'warn'};
  }
  if(Number(checkpoint)>=25)return profit>=25?{action:'Cerrar el ciclo',detail:'CP25 con profit ≥ 25%. Después, revisar cartera.',tone:'good'}:{action:'Mantener · sin FIX normal',detail:'CP25 por debajo del objetivo: mantener. Solo una señal extraordinaria abre Emergency Review.',tone:'idle'};
  return {action:'Mantener bajo seguimiento',detail:'Antes de CP25: Fresh Risk. Sin señal ET ni deterioro brusco, no hay FIX normal.',tone:'idle'};
}
function renderRoadmapGuide(){
  const el=document.getElementById('roadmapGuide');if(!el)return;
  el.innerHTML=`<div class="pcs-order"><b>1 · Gestiona el ciclo</b><b>2 · Revisa cartera y Fresh Risk</b><b>3 · Decide entre 0 y 4 entradas</b></div>
  <section class="pcs-quick"><h3>Qué toca hacer ahora</h3><p>Los checkpoints son momentos de revisión. El resultado debe ser el del ciclo completo, incluidos rolls y comisiones.</p>
  <div class="pcs-controls">
    <label>Momento<select id="pcsCp" onchange="renderPcsAnswer()"><option value="0">Antes de CP25</option><option value="25">CP25</option><option value="50">CP50</option><option value="75">CP75</option></select></label>
    <label>Profit del ciclo (%)<input id="pcsProfit" type="number" step="any" placeholder="Ej. 18" oninput="renderPcsAnswer()"></label>
    <label>ET del ciclo (opcional)<input id="pcsEt" type="number" step="any" placeholder="Ej. +22" oninput="renderPcsAnswer()"></label>
    <label>¿Estructura viable?<select id="pcsViable" onchange="renderPcsAnswer()"><option value="unknown">Pendiente de revisar</option><option value="yes">Sí</option><option value="no">No; comprometida</option></select></label>
  </div><label class="pcs-emergency"><input type="checkbox" id="pcsEmergency" onchange="renderPcsAnswer()"> Deterioro brusco: short Delta ~50+, short perforado, caída fuerte o shock IV/Vega</label>
  <div id="pcsAnswer" role="status"></div></section>
  <div class="pcs-checkpoints">
    <section><h3>CP25</h3><b>≥ 25% → cerrar</b><p>Por debajo → mantener.<br><strong>Sin FIX normal.</strong></p></section>
    <section><h3>CP50</h3><b>≥ 50% → cerrar</b><p>Por debajo: viable → mantener.<br>Comprometida → FIX.</p></section>
    <section><h3>CP75</h3><b>Beneficio → cerrar</b><p>Pérdida → FIX.<br><strong>Actuar siempre.</strong></p></section>
  </div>
  <section class="pcs-quick"><h3>Después: ¿cuántas entradas nuevas?</h3><div class="pcs-entry-grid">
    <div><b>2–4 · Normal, poca exposición</b><p>Solo con pocos Fresh y riesgo controlado.</p></div>
    <div><b>1–2 · Normal, exposición media</b><p>Evitar concentrar entradas recientes.</p></div>
    <div><b>0–1 · Defensa</b><p>Una cohorte con FIX o posible defensa: reservar margen.</p></div>
    <div class="pcs-stop"><b>0 · Recovery Mode</b><p>2+ FIX en una cohorte o varias cohortes en defensa.</p></div>
  </div><p><strong>Fresh</strong> = aún no ha alcanzado CP25. Más Fresh implica menos entradas. El 50% de capital base es un techo, nunca un objetivo. Si hay duda, reservar margen.</p></section>
  <details class="pcs-detail"><summary>Entrada y calidad del FIX</summary>
    <p><b>Entrada:</b> 45 DTE · short Put Delta 15–30 · width 25 · 1 contrato base. Crédito mínimo 13% del nominal ($325). 13–18% es habitual, sin máximo duro. Prioriza el Delta más bajo que alcance el mínimo.</p>
    <p><b>ET:</b> profit acumulado del ciclo menos porcentaje de tiempo consumido del ciclo. No se reinicia con un FIX. ET ≥ +20 es señal extraordinaria de cierre.</p>
    <p><b>FIX base:</b> cerrar/rolar, volver aproximadamente a 45 DTE, añadir 1 contrato defensivo, mantener width 25 y bajar short. Un plazo mayor puede justificarse por una defensa mejor.</p>
    <p><b>Referencias provisionales:</b> +20–30 DTE y/o short ~1,5–2% más bajo, junto con mejora de Delta/breakeven. Preferir crédito; con contrato extra, crédito/riesgo incremental orientativo ≥ 8–10%. Un débito exige defensa excepcional y Risk Budget suficiente.</p>
    <p><b>Comparar:</b> P/L acumulado, Δ Max Loss, crédito neto, crédito/riesgo añadido, DTE añadidos, crédito/día, alivio de strike, Delta, breakeven, distancia al short y riesgo agregado. Crédito no equivale a beneficio. Un FIX se rechaza si rompe el Risk Budget.</p>
  </details>`;
  renderPcsAnswer();
}
function renderPcsAnswer(){
  const num=id=>{const v=document.getElementById(id).value.trim();return v===''?null:Number(v);};
  const r=pcsDecision({checkpoint:document.getElementById('pcsCp').value,profit:num('pcsProfit'),et:num('pcsEt'),viable:document.getElementById('pcsViable').value,emergency:document.getElementById('pcsEmergency').checked});
  const el=document.getElementById('pcsAnswer');el.className='pcs-answer '+r.tone;el.innerHTML=`<strong>${r.action}</strong><p>${r.detail}</p><small>Después de gestionar: revisar riesgo agregado, Fresh y FIX antes de nuevas entradas.</small>`;
}
