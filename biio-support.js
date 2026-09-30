/* Strict result validation and source-backed BIIO helpers. */
function tobParseResult(value, field){
  if(value == null || String(value).trim()==='') return null;
  const raw=String(value).trim();
  const pattern=field==='kg' ? /^\d+(?:[.,]\d+)?$/ : /^\d+$/;
  if(!pattern.test(raw)) throw new Error(field==='kg' ? 'Kg: utiliza un número no negativo, sin unidades.' : 'Repeticiones: utiliza un entero no negativo.');
  const n=Number(raw.replace(',','.'));
  if(!Number.isFinite(n) || (field==='reps' && !Number.isSafeInteger(n))) throw new Error('Número fuera de rango.');
  return n;
}

document.addEventListener('beforeinput',event=>{
  const el=event.target;
  if(!el.dataset?.tobNumber || !event.data) return;
  const candidate=el.value.slice(0,el.selectionStart)+event.data+el.value.slice(el.selectionEnd);
  const pattern=el.dataset.tobNumber==='kg' ? /^\d*(?:[.,]\d*)?$/ : /^\d*$/;
  if(!pattern.test(candidate)){event.preventDefault(); tobToast('Solo números; escribe el texto en Comentarios.','red');}
});
document.addEventListener('paste',event=>{
  const el=event.target;
  if(!el.dataset?.tobNumber) return;
  try {tobParseResult(event.clipboardData.getData('text'),el.dataset.tobNumber);}
  catch(e){event.preventDefault();tobToast(e.message,'red');}
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(!el.dataset?.tobNumber) return;
  try{const v=tobParseResult(el.value,el.dataset.tobNumber);el.value=v??'';el.setCustomValidity('');}
  catch(e){el.setCustomValidity(e.message);el.reportValidity();}
},true);

function tobSetComment(ejId,entId,microNum,value){
  const ses=tobGetSesion(microNum,entId);if(!ses)return;
  ses.ejs[ejId] ||= {};ses.ejs[ejId].comentario=value;tobSave();
}

function tobFindUnmappedResults(a){
  const issues=[];
  for(const it of a.iteraciones||[]) for(const [micro,entries] of Object.entries(it.sesiones||{})){
    for(const [entId,ses] of Object.entries(entries)){
      const en=a.rutina.entrenos.find(e=>e.id===entId);
      for(const [ejId,result] of Object.entries(ses.ejs||{})){
        const ej=en?.ejercicios.find(e=>e.id===ejId);
        if(!ej || Number(micro)>(en.numMicro||a.rutina.numMicro)){
          issues.push({iteracion:it.id,micro,entId,ejId,reason:'Sin correspondencia segura; conservado en sesiones y copia anterior'});continue;
        }
        for(const arr of ['series','lineas']) (result[arr]||[]).forEach((row,index)=>{
          for(const field of ['kg','reps'])try{tobParseResult(row[field],field);}catch(e){issues.push({iteracion:it.id,micro,entId,ejId,arr,index,field,reason:'Valor antiguo no numérico conservado; revisar en copia anterior'});}
          if(arr==='series' && index>=tobPlanFor(ej,Number(micro)).series && (row.kg!=null||row.reps!=null)) issues.push({iteracion:it.id,micro,entId,ejId,arr,index,reason:'Serie histórica fuera del nuevo plan; conservada'});
        });
      }
    }
  }
  return issues;
}

function tobNormalizeLegacyResults(a){
  let changed=false;
  for(const it of a.iteraciones||[])for(const [micro,entries] of Object.entries(it.sesiones||{}))for(const [entId,ses] of Object.entries(entries))for(const [ejId,result] of Object.entries(ses.ejs||{})){
    for(const arr of ['series','lineas'])(result[arr]||[]).forEach((row,index)=>{
      for(const field of ['kg','reps']){
        if(row[field]==null)continue;
        try{const n=tobParseResult(row[field],field);if(n!==row[field]){row[field]=n;changed=true;}}
        catch(e){
          a._numericBackup ||= [];a._numericBackup.push({iteracion:it.id,micro,entId,ejId,arr,index,field,value:row[field]});
          result.comentario=(result.comentario?result.comentario+'\n':'')+`Registro anterior, ${arr} ${index+1}, ${field}: ${row[field]}`;
          row[field]=null;changed=true;
        }
      }
    });
  }
  return changed;
}

function tobMigrationNotice(a){
  const n=(a._migrationUnmapped?.length||0)+(a._numericBackup?.length||0);
  if(!n)return '';
  return `<div role="status" class="tob-card" style="border:1px solid #f5a623;padding:14px">${n} registros anteriores necesitan revisión. Se conservan la copia original y los datos sin correspondencia.<button type="button" class="tob-action" onclick="tobExportMigrationCopy()">Descargar copia e informe</button></div>`;
}
function tobExportMigrationCopy(){
  const a=tobAsig();if(!a)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify({original:a._planMigrationBackup,numericos:a._numericBackup,incidencias:a._migrationUnmapped,sesiones:a.iteraciones},null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='revision-migracion-rutina.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

// Adobe-compatible validation. Viewers that ignore PDF JavaScript are still
// covered by the strict, preflighted application import.
function tobPdfNumberField(doc,field,kind){
  const {PDFName,PDFHexString}=PDFLib;
  const pattern=kind==='kg'?'^\\d+(?:[.,]\\d+)?$':'^\\d+$';
  const js=`if(event.value!=='' && !(new RegExp(${JSON.stringify(pattern)})).test(event.value)){event.rc=false;app.alert('Solo números no negativos, sin unidades ni comentarios.');}else{event.value=String(event.value).replace(',','.');}`;
  const action=doc.context.obj({S:PDFName.of('JavaScript'),JS:PDFHexString.fromText(js)});
  field.acroField.dict.set(PDFName.of('AA'),doc.context.obj({V:action}));
}

async function tobBuildSourcePdf(cli,a,pl,it,preview,returnBytes=false){
  const {PDFDocument,StandardFonts,rgb}=PDFLib;
  const doc=await PDFDocument.create(),form=doc.getForm();
  const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const W=842,H=595,left=32,startX=210,colW=198;
  let page,y,title;
  function lines(value,width,size=9,f=font){
    const out=[];
    for(const paragraph of tobPdfSafe(String(value||'')).split('\n')){
      let line='';
      for(const word of paragraph.split(/\s+/)){
        if(f.widthOfTextAtSize(line+' '+word,size)>width&&line){out.push(line);line=word;}else line+=(line?' ':'')+word;
      }
      if(line)out.push(line);
    }
    return out;
  }
  function draw(value,x,yy,width,size=9,f=font,color=rgb(.1,.1,.1)){
    const rows=lines(value,width,size,f);rows.forEach((line,i)=>page.drawText(line,{x,y:yy-i*(size+3),size,font:f,color}));return rows.length*(size+3);
  }
  function nextPage(micros){
    page=doc.addPage([W,H]);y=H-32;
    y-=draw(title,left,y,W-64,12,bold)+4;
    y-=draw(`${cli?.nombre||''} · ${pl.categoria} · Iteración ${it?.numero||1}`,left,y,W-64,9)+8;
    micros.forEach((mn,i)=>draw(`Microciclo ${mn}`,startX+i*colW,y,colW-12,10,bold));y-=23;
  }
  function field(name,value,x,yy,width,height,numeric){
    const f=form.createTextField(name);if(value!=null)f.setText(tobPdfSafe(String(value)));if(height>20)f.enableMultiline();
    f.addToPage(page,{x,y:yy-height,width,height,font,borderWidth:.5,borderColor:rgb(.5,.5,.5)});f.setFontSize(9);
    if(numeric)tobPdfNumberField(doc,f,numeric);
  }
  title='FULL TRAINING · '+(pl.categoria||'BIIO');nextPage([]);
  const stats=tobCalcItStats(a,it);
  y-=draw(`Inicio: ${a.fechaInicio||'—'} · Sesiones registradas: ${stats.sesiones}`,left,y,W-64,10,bold)+14;
  for(const paragraph of String(pl.descripcion||'').split('\n')){
    for(const line of lines(paragraph,W-64,10)){
      if(y<45)nextPage([]);
      draw(line,left,y,W-64,10);y-=14;
    }y-=8;
  }
  for(const en of a.rutina.entrenos){
    const total=en.numMicro||a.rutina.numMicro;
    for(let first=1;first<=total;first+=3){
      const micros=Array.from({length:Math.min(3,total-first+1)},(_,i)=>first+i);
      title=en.nombre;nextPage(micros);
      draw('Fecha (aaaa-mm-dd)',left,y,170,9,bold);
      micros.forEach((mn,i)=>field(`fecha_${en.id}_${mn}`,it?.sesiones?.[mn]?.[en.id]?.fecha,startX+i*colW,y+8,colW-12,18));y-=28;
      const guidanceH=Math.max(0,...micros.map(mn=>lines(en.indicaciones?.[mn],colW-14,8).length*11));
      micros.forEach((mn,i)=>draw(en.indicaciones?.[mn],startX+i*colW,y,colW-14,8));y-=guidanceH+12;
      for(const ej of en.ejercicios){
        const plans=micros.map(mn=>tobPlanFor(ej,mn));
        const isCircuit=ej.tipo==='circuito';
        const counts=plans.map(p=>isCircuit?(p.recordSlots||0)*ej.circuitoLineas.length:p.series);
        const count=Math.max(...counts);
        const headerH=lines(ej.nombre,W-64,10,bold).length*13+lines(ej.subtitle,W-64,8).length*11+14;
        const planH=Math.max(...plans.map(p=>Math.max(1,lines(tobPlanLabel(p),colW-14,9,bold).length)*12))+8;
        const restH=Math.max(...plans.map(p=>Math.max(1,lines(p.pausa||'Sin indicación',colW-14,8).length)*11))+8;
        const needed=headerH+planH+count*21+restH+68;
        if(y-needed<35)nextPage(micros);
        y-=draw(ej.nombre,left,y,W-64,10,bold)+5;
        if(ej.subtitle)y-=draw(ej.subtitle,left,y,W-64,8)+4;
        micros.forEach((mn,i)=>draw(tobPlanLabel(plans[i]),startX+i*colW,y,colW-14,9,bold));y-=planH;
        draw('Registro',left,y,170,8,bold);
        micros.forEach((mn,i)=>{draw('Kg',startX+i*colW,y,70,8);draw('Reps',startX+i*colW+85,y,70,8);});y-=15;
        for(let row=0;row<count;row++){
          if(y<105)nextPage(micros);
          const label=isCircuit?`${Math.floor(row/ej.circuitoLineas.length)+1}ª · ${ej.circuitoLineas[row%ej.circuitoLineas.length]}`:`${row+1}ª serie`;
          const labelRows=lines(label,170,8),rowH=Math.max(21,labelRows.length*11+3);
          draw(label,left,y,170,8);
          micros.forEach((mn,i)=>{
            if(row>=counts[i])return;
            const arr=isCircuit?'lineas':'series',record=it?.sesiones?.[mn]?.[en.id]?.ejs?.[ej.id]?.[arr]?.[row];
            field(`ej_${ej.id}_${mn}_${en.id}_${arr}_${row}_kg`,record?.kg,startX+i*colW,y+8,75,17,'kg');
            field(`ej_${ej.id}_${mn}_${en.id}_${arr}_${row}_reps`,record?.reps,startX+i*colW+85,y+8,75,17,'reps');
          });y-=rowH;
        }
        if(y-restH-68<30)nextPage(micros);
        draw('Descanso',left,y,170,8,bold);micros.forEach((mn,i)=>draw(plans[i].pausa||'Sin indicación',startX+i*colW,y,colW-14,8));y-=restH;
        draw('Comentarios',left,y,170,8,bold);micros.forEach((mn,i)=>field(`comentario_${ej.id}_${mn}_${en.id}`,it?.sesiones?.[mn]?.[en.id]?.ejs?.[ej.id]?.comentario,startX+i*colW,y+8,colW-12,42));y-=62;
        page.drawLine({start:{x:left,y:y+6},end:{x:W-32,y:y+6},thickness:.5,color:rgb(.75,.75,.75)});
      }
      const cardioH=Math.max(0,...micros.map(mn=>lines(en.cardioByMicro?.[mn]?.label,colW-14,8).length*11))+16;
      if(y<110+cardioH)nextPage(micros);
      draw('Aeróbico indicado',left,y,170,8,bold);
      micros.forEach((mn,i)=>draw(en.cardioByMicro?.[mn]?.label||'Sin indicación',startX+i*colW,y,colW-14,8));y-=cardioH;
      for(const key of ['tipo','tiempo','intensidad']){
        draw('Aeróbico · '+key,left,y,170,9,bold);micros.forEach((mn,i)=>field(`aer_${en.id}_${mn}_${key}`,it?.sesiones?.[mn]?.[en.id]?.aerobica?.[key],startX+i*colW,y+8,colW-12,18));y-=25;
      }
    }
  }
  doc.getPages().forEach((p,i)=>p.drawText(`${i+1} / ${doc.getPageCount()}`,{x:W-75,y:15,size:8,font}));
  form.updateFieldAppearances(font);const bytes=await doc.save();if(returnBytes)return bytes;
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  if(preview){if(!window.open(url,'_blank'))tobToast('Permite ventanas emergentes para la vista previa','red');}
  else{const link=document.createElement('a');link.href=url;link.download=`${(cli?.nombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}_${pl.categoria}_it${it?.numero||1}.pdf`;link.click();}
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
