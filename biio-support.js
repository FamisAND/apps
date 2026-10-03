/* Strict result validation and source-backed BIIO helpers. */
function tobLoadNotice(message){
  let el=document.getElementById('tobLoadNotice');
  if(!el){el=document.createElement('div');el.id='tobLoadNotice';el.setAttribute('role','status');el.style.cssText='padding:12px 20px;background:#382b10;color:#ffde9c;line-height:1.5';document.querySelector('.tob-topbar')?.insertAdjacentElement('afterend',el);}
  el.textContent=message;el.hidden=!message;
}
async function tobBackupDatabase(raw){
  // Large recovery copies belong in IndexedDB, outside the localStorage quota.
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('consulta-safety-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('Copia bloqueada por otra pestaña'));
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots');
      const get=store.get('before-plan6');
      get.onsuccess=()=>{if(!get.result)store.put({raw,createdAt:new Date().toISOString()},'before-plan6');};
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||new Error('No se ha podido guardar la copia'));};
    };
  });
}
function tobSetSessionComment(entId,microNum,value){
  const ses=tobGetSesion(microNum,entId);if(!ses)return;
  ses.comentario=String(value).slice(0,300);tobSave();
}
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
  const W=842,H=595,left=30,startX=110;
  let colW=140;
  const ORANGE=rgb(.96,.65,.13),BLACK=rgb(.06,.06,.06),GRAY=rgb(.55,.55,.55),GRAY_DK=rgb(.25,.25,.25);
  const fontB=bold,fontO=await doc.embedFont(StandardFonts.HelveticaOblique),W_L=W,H_L=H;
  let page,y,title;
  function lines(value,width,size=9,f=font){
    const out=[];
    for(const paragraph of String(value||'').split('\n').map(tobPdfSafe)){
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
  function brand(){
    draw('FULL',40,H-45,60,16,bold,ORANGE);
    draw('TRAINING',85,H-45,160,16,bold,BLACK);
  }
  function nextPage(micros){
    page=doc.addPage([W,H]);brand();
    draw(tobRutinaShortName(pl)+' · Iteración '+(it?.numero||1),W-270,H-42,230,8,bold,rgb(.58,.38,.08));
    const th=draw(title,left,H-85,W-64,17,bold,BLACK);
    draw('Registro de sesión',left,H-85-th-2,W-64,8,font,GRAY);
    y=H-85-th-28;
    page.drawLine({start:{x:left,y:y+14},end:{x:W-30,y:y+14},thickness:1.2,color:ORANGE});
    if(micros.length){draw('MICROCICLO',left,y,75,7,bold,GRAY_DK);micros.forEach((mn,i)=>draw(String(mn).padStart(2,'0'),startX+i*colW+4,y,colW-8,9,bold,rgb(.58,.38,.08)));y-=20;}
  }
  function field(name,value,x,yy,width,height,numeric){
    const f=form.createTextField(name);if(value!=null)f.setText(tobPdfSafe(String(value)));if(height>20)f.enableMultiline();
    f.addToPage(page,{x,y:yy-height,width,height,font,borderWidth:.5,borderColor:rgb(.82,.84,.83)});f.setFontSize(9);
    if(numeric)tobPdfNumberField(doc,f,numeric);
  }
  const rutinaShort=tobRutinaShortName(pl),L=tobLangOf(cli);
  const stats=tobCalcItStats(a,it);
  page=doc.addPage([W,H]);
  page.drawRectangle({x:0,y:0,width:11,height:H,color:ORANGE});brand();
  draw('BIIO / PROGRAMA DE ENTRENAMIENTO',W-270,H-43,235,8,bold,GRAY_DK);
  page.drawRectangle({x:40,y:440,width:280,height:25,color:rgb(.99,.96,.89)});
  draw((pl.categoria||'ENTRENAMIENTO').toUpperCase(),50,449,260,9,bold,rgb(.58,.38,.08));
  const titleSize=Math.min(48,320/Math.max(1,bold.widthOfTextAtSize(tobPdfSafe(rutinaShort),1)));
  draw(rutinaShort,40,389,330,titleSize,bold,BLACK);
  draw('Tu planificación, tus registros\ny tu progreso en un mismo lugar.',40,347,325,12,font,GRAY_DK);
  page.drawLine({start:{x:40,y:291},end:{x:360,y:291},thickness:.5,color:rgb(.85,.86,.85)});
  draw(cli?.nombre||'Cliente',40,269,325,12,bold,BLACK);
  draw('Iteración '+(it?.numero||1)+' / Inicio: '+(a.fechaInicio||'___ / ___ / ______'),40,248,325,9,font,GRAY_DK);
  const micros=Math.max(...a.rutina.entrenos.map(en=>en.numMicro||a.rutina.numMicro));
  [[micros,'MICROCICLOS'],[a.rutina.entrenos.length,'ENTRENOS'],[stats.sesiones,'REGISTRADOS']].forEach(([v,label],i)=>{draw(String(v).padStart(2,'0'),40+i*110,192,100,25,bold,BLACK);draw(label,40+i*110,172,105,7,font,GRAY);});
  page.drawLine({start:{x:405,y:157},end:{x:405,y:465},thickness:.5,color:rgb(.85,.86,.85)});
  draw('01 / TU RUTINA',435,452,360,9,bold,rgb(.58,.38,.08));
  const description=(pl?tobDescOf(pl.categoria,L,pl.sexo):null)||pl.descripcion||'';
  let descY=428;
  for(const line of lines(description,360,10)){
    if(descY<62){title='Tu rutina · '+rutinaShort;nextPage([]);descY=y;}
    draw(line,435,descY,360,10,font,GRAY_DK);descY-=14;
  }
  if(descY>245){
    descY-=28;draw('02 / CÓMO LEER TU RUTINA',435,descY,360,9,bold,rgb(.58,.38,.08));descY-=23;
    descY-=draw('Cada columna corresponde a un microciclo. Consulta la prescripción y registra los kilos y las repeticiones de cada serie.',435,descY,360,10,font,GRAY_DK)+24;
    draw('03 / AL TERMINAR',435,descY,360,9,bold,rgb(.58,.38,.08));descY-=23;
    draw('Anota cómo te has sentido en el comentario del día y guarda el PDF con tus resultados.',435,descY,360,10,font,GRAY_DK);
  }
  for(const en of a.rutina.entrenos){
    const total=en.numMicro||a.rutina.numMicro;
    for(let first=1;first<=total;first+=total){
      colW=(W-startX-30)/total;
      const micros=Array.from({length:total},(_,i)=>first+i);
      title=en.nombre.toUpperCase().startsWith('ENTRENAMIENTO')?en.nombre:'ENTRENAMIENTO '+(en.letra||en.id)+' - '+en.nombre;nextPage(micros);
      draw('Fecha\n(aaaa-mm-dd)',left,y,75,7,bold);
      micros.forEach((mn,i)=>field(`fecha_${en.id}_${mn}`,it?.sesiones?.[mn]?.[en.id]?.fecha,startX+i*colW,y+8,colW-12,18));y-=28;
      draw('Comentario\ndel día',left,y,75,8,bold);
      micros.forEach((mn,i)=>{field(`sesion_comentario_${en.id}_${mn}`,it?.sesiones?.[mn]?.[en.id]?.comentario,startX+i*colW,y+8,colW-12,32);form.getTextField(`sesion_comentario_${en.id}_${mn}`).setMaxLength(300);});y-=46;
      const guidanceH=Math.max(0,...micros.map(mn=>lines(en.indicaciones?.[mn],colW-14,8).length*11));
      micros.forEach((mn,i)=>draw(en.indicaciones?.[mn],startX+i*colW,y,colW-14,8));y-=guidanceH+12;
      for(const ej of en.ejercicios){
        const plans=micros.map(mn=>tobPlanFor(ej,mn));
        const isCircuit=ej.tipo==='circuito';
        const counts=plans.map(p=>isCircuit?(p.recordSlots||0)*ej.circuitoLineas.length:p.series);
        const count=Math.max(...counts);
        const headerH=30;
        const planH=Math.max(...plans.map(p=>Math.max(1,lines(tobPlanLabel(p),colW-14,9,bold).length)*12))+8;
        const restH=Math.max(...plans.map(p=>Math.max(1,lines(p.pausa||'Sin indicación',colW-14,8).length)*11))+8;
        const needed=headerH+planH+count*13+restH+46;
        if(y-needed<35)nextPage(micros);
        const name=tobPdfSafe(ej.nombre.toUpperCase()),nameSize=Math.min(10,350/Math.max(1,bold.widthOfTextAtSize(name,1)));
        page.drawRectangle({x:24,y:y-5,width:W-48,height:19,color:BLACK});
        page.drawText(name,{x:left,y:y+1,size:nameSize,font:bold,color:rgb(1,1,1)});
        if(ej.subtitle){const sx=left+bold.widthOfTextAtSize(name,nameSize)+12,sub=tobPdfSafe(ej.subtitle);page.drawText(sub,{x:sx,y:y+2,size:Math.min(8,(W-35-sx)/Math.max(1,fontO.widthOfTextAtSize(sub,1))),font:fontO,color:rgb(.85,.85,.85)});}
        y-=25;
        micros.forEach((mn,i)=>{page.drawRectangle({x:startX+i*colW,y:y-planH+12,width:colW-5,height:planH,color:rgb(.99,.96,.89)});draw(tobPlanLabel(plans[i]),startX+i*colW+4,y,colW-14,8,bold,rgb(.60,.37,.04));});y-=planH+3;
        draw('Series',left,y,75,8,bold,GRAY_DK);
        micros.forEach((mn,i)=>{draw('Kg',startX+i*colW+4,y,colW/2-8,7);draw('Reps',startX+i*colW+colW/2,y,colW/2-8,7);});y-=15;
        for(let row=0;row<count;row++){
          if(y<105)nextPage(micros);
          const label=isCircuit?`${Math.floor(row/ej.circuitoLineas.length)+1}ª · ${ej.circuitoLineas[row%ej.circuitoLineas.length]}`:`${row+1}ª serie`;
          const labelRows=lines(label,75,7),rowH=Math.max(13,labelRows.length*10+3);
          draw(label,left,y,75,7);
          micros.forEach((mn,i)=>{
            if(row>=counts[i])return;
            const arr=isCircuit?'lineas':'series',record=it?.sesiones?.[mn]?.[en.id]?.ejs?.[ej.id]?.[arr]?.[row];
            field(`ej_${ej.id}_${mn}_${en.id}_${arr}_${row}_kg`,record?.kg,startX+i*colW,y+8,colW/2-8,11,'kg');
            field(`ej_${ej.id}_${mn}_${en.id}_${arr}_${row}_reps`,record?.reps,startX+i*colW+colW/2,y+8,colW/2-8,11,'reps');
          });y-=rowH;
        }
        if(y-restH-46<30)nextPage(micros);
        draw('Descanso',left,y,75,8,bold,rgb(.60,.37,.04));micros.forEach((mn,i)=>draw(plans[i].pausa||'Sin indicación',startX+i*colW,y,colW-14,8));y-=restH;
        draw('Comentarios',left,y,75,7,bold);micros.forEach((mn,i)=>field(`comentario_${ej.id}_${mn}_${en.id}`,it?.sesiones?.[mn]?.[en.id]?.ejs?.[ej.id]?.comentario,startX+i*colW,y+8,colW-12,24));y-=40;
        page.drawLine({start:{x:left,y:y+6},end:{x:W-32,y:y+6},thickness:.5,color:rgb(.75,.75,.75)});
      }
      const cardioH=Math.max(0,...micros.map(mn=>lines(en.cardioByMicro?.[mn]?.label,colW-14,8).length*11))+16;
      if(y<110+cardioH)nextPage(micros);
      draw('Aeróbico\nindicado',left,y,75,8,bold);
      micros.forEach((mn,i)=>draw(en.cardioByMicro?.[mn]?.label||'Sin indicación',startX+i*colW,y,colW-14,8));y-=cardioH;
      for(const key of ['tipo','tiempo','intensidad']){
        draw(key,left,y,75,8,bold);micros.forEach((mn,i)=>field(`aer_${en.id}_${mn}_${key}`,it?.sesiones?.[mn]?.[en.id]?.aerobica?.[key],startX+i*colW,y+8,colW-12,18));y-=25;
      }
    }
  }
  doc.getPages().forEach((p,i)=>{p.drawText('FULL TRAINING · ENTRENAMIENTO PERSONAL',{x:40,y:22,size:7,font,color:GRAY});p.drawText(`${i+1} / ${doc.getPageCount()}`,{x:W-75,y:22,size:7,font,color:GRAY});});
  form.updateFieldAppearances(font);const bytes=await doc.save();if(returnBytes)return bytes;
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  if(preview){if(!window.open(url,'_blank'))tobToast('Permite ventanas emergentes para la vista previa','red');}
  else{const link=document.createElement('a');link.href=url;link.download=`${(cli?.nombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}_${pl.categoria}_it${it?.numero||1}.pdf`;link.click();}
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
