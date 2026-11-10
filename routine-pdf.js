/* Visual, editable routine PDF. IDs stay compatible; metadata prevents cross-client imports. */
async function tobBuildVisualRoutinePdf(cli,a,pl,it,preview,returnBytes=false){
  const {PDFDocument,StandardFonts,rgb}=PDFLib,doc=await PDFDocument.create(),form=doc.getForm();
  const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),italic=await doc.embedFont(StandardFonts.HelveticaOblique);
  const W=842,H=595,M=30,black=rgb(.06,.06,.06),gray=rgb(.45,.45,.45),line=rgb(.82,.84,.83),accent=rgb(.96,.65,.13),ink=rgb(.60,.37,.04),pale=rgb(.99,.96,.89);
  const safe=value=>tobPdfSafe(String(value??'')).replace(/[\u0000-\u001f]/g,' ');
  const title=pl?tobRutinaShortName(pl):'Programa de entrenamiento';
  const period=FTRoutine.fullDate(it?.fechaInicio)||FTRoutine.fullDate(a.fechaInicio)||'';
  const metadata={version:1,client:cli?.id||null,assignment:a.id,iteration:it?.id||null,period,movements:{}};
  let page,y,tableLayout=null;
  function rows(value,width,size=9,f=font){
    const out=[];
    for(const para of String(value??'').split('\n')){
      let row='';for(const word of safe(para).split(/\s+/)){
        if(f.widthOfTextAtSize((row?row+' ':'')+word,size)>width&&row){out.push(row);row='';}
        if(f.widthOfTextAtSize(word,size)>width){
          for(const ch of word){if(f.widthOfTextAtSize(row+ch,size)>width){out.push(row);row='';}row+=ch;}
        }else row+=(row?' ':'')+word;
      }
      if(row)out.push(row);
    }
    return out;
  }
  function text(value,x,top,width,size=9,f=font,color=black){
    const lines=rows(value,width,size,f);lines.forEach((s,i)=>page.drawText(s,{x,y:top-i*(size+3),font:f,size,color}));return lines.length*(size+3);
  }
  function brand(height=H){text('FULL',40,height-45,60,16,bold,accent);text('TRAINING',85,height-45,160,16,bold);}
  function next(heading){
    page=doc.addPage([W,H]);brand();
    text(title+' · Iteración '+(it?.numero||1),W-270,H-42,230,8,bold,ink);
    const hh=text(heading,M,H-85,W-2*M,17,bold);
    text(tableLayout?'Registro de sesión':'Posición inicial, final y puntos clave de ejecución.',M,H-85-hh-2,W-2*M,8,font,gray);
    y=H-85-hh-28;
    page.drawLine({start:{x:M,y:y+14},end:{x:W-M,y:y+14},thickness:1,color:accent});
    if(tableLayout){
      const {micros,x0,cw}=tableLayout;text('MICROCICLO',M,y,75,7,bold,gray);
      micros.forEach((mn,i)=>text(String(mn).padStart(2,'0'),x0+i*cw+4,y,cw-8,9,bold,ink));y-=20;
    }
  }
  function field(name,value,x,top,width,height,kind){
    const f=form.createTextField(name);if(value!=null)f.setText(safe(value));
    if(height>22)f.enableMultiline();
    f.addToPage(page,{x,y:top-height,width,height,font,borderColor:line,borderWidth:.5,backgroundColor:rgb(1,1,1)});f.setFontSize(8);
    if(kind)tobPdfNumberField(doc,f,kind);return f;
  }
  function ensure(height,heading){if(y-height<42)next(heading);}
  page=doc.addPage([W,H]);page.drawRectangle({x:0,y:0,width:11,height:H,color:accent});brand();
  text('BIIO / PROGRAMA DE ENTRENAMIENTO',W-270,H-43,235,8,bold,gray);
  page.drawRectangle({x:40,y:440,width:280,height:25,color:pale});text((pl?.categoria||'ENTRENAMIENTO').toUpperCase(),50,449,260,9,bold,ink);
  const titleSize=Math.min(48,335/Math.max(1,bold.widthOfTextAtSize(safe(title),1)));
  text(title,40,389,345,titleSize,bold);text('Tu planificación, tus registros\ny tu progreso en un mismo lugar.',40,347,325,12);
  page.drawLine({start:{x:40,y:291},end:{x:360,y:291},thickness:.5,color:line});
  text(cli?.nombre||'Plantilla',40,269,325,12,bold);text('Iteración '+(it?.numero||1)+' / Inicio: '+(period?period.split('-').reverse().join('/'):'Por confirmar'),40,248,325,9,font,gray);
  const total=Math.max(0,...(a.rutina?.entrenos||[]).map(en=>en.numMicro||a.rutina.numMicro||6));
  const stats=tobCalcItStats(a,it);
  [[total,'MICROCICLOS'],[a.rutina.entrenos.length,'ENTRENOS'],[stats.sesiones,'REGISTRADOS']].forEach(([v,label],i)=>{text(String(v).padStart(2,'0'),40+i*110,192,100,25,bold);text(label,40+i*110,172,105,7,font,gray);});
  page.drawLine({start:{x:405,y:157},end:{x:405,y:465},thickness:.5,color:line});text('01 / TU RUTINA',435,452,360,9,bold,ink);
  const desc=(pl&&typeof tobDescOf==='function'?tobDescOf(pl.categoria,tobLangOf(cli),pl.sexo):null)||pl?.descripcion||'';
  let descY=428;
  for(const row of rows(desc,360,10)){
    if(descY<62){next('Tu rutina · '+title);descY=y;}
    text(row,435,descY,360,10);descY-=14;
  }
  if(descY>245){
    descY-=28;text('02 / CÓMO LEER TU RUTINA',435,descY,360,9,bold,ink);descY-=23;
    descY-=text('Cada sesión se presenta por separado. Consulta las repeticiones objetivo y el descanso; anota aparte los kilos y repeticiones que hiciste. Fecha: DD/MM/AAAA.',435,descY,360,10)+24;
    text('03 / AL TERMINAR',435,descY,360,9,bold,ink);descY-=23;
    text('Anota cómo te has sentido en los comentarios y guarda el PDF con tus resultados.',435,descY,360,10);
  }
  // A session is one microcycle and one training day. Pair compact exercise
  // cards on A4 portrait; continuation pages are only used when content grows.
  const SW=595,SH=842,SM=32,SG=12,cardW=(SW-2*SM-SG)/2;
  const sessionDate=value=>{const date=FTRoutine.fullDate(value);return date?date.split('-').reverse().join('/'):'';};
  function sessionPage(en,mn,total,continued=false){
    page=doc.addPage([SW,SH]);brand(SH);
    text(title+' · Iteración '+(it?.numero||1),SW-245,SH-39,210,8,bold,ink);
    const heading=en.nombre||'ENTRENAMIENTO '+(en.letra||en.id);
    text(heading,SM,SH-78,SW-2*SM,17,bold);
    text(`MICROCICLO ${String(mn).padStart(2,'0')} / ${String(total).padStart(2,'0')}${continued?' · CONTINUACIÓN':''}`,SM,SH-103,SW-2*SM,9,bold,ink);
    page.drawLine({start:{x:SM,y:SH-116},end:{x:SW-SM,y:SH-116},color:accent,thickness:1});
    if(continued){text('Continúa el registro de la misma sesión.',SM,SH-139,SW-2*SM,9,font,gray);return SH-159;}
    const ses=it?.sesiones?.[mn]?.[en.id];
    text('FECHA',SM,SH-141,55,8,bold,gray);
    field(`fecha_${en.id}_${mn}`,sessionDate(ses?.fecha),SM+52,SH-126,119,22);
    text('DD/MM/AAAA',SM+178,SH-141,95,8,font,gray);
    text('COMENTARIO DEL DÍA',SM,SH-171,160,8,bold,gray);
    field(`sesion_comentario_${en.id}_${mn}`,ses?.comentario,SM+160,SH-156,SW-2*SM-160,35).setMaxLength(300);
    const guidance=en.indicaciones?.[mn]||'';
    if(guidance){text('INDICACIÓN',SM,SH-209,95,8,bold,ink);const gh=text(guidance,SM+95,SH-209,SW-2*SM-95,8,font,gray);return SH-225-Math.max(0,gh-11);}
    return SH-207;
  }
  function sessionCard(base,en,mn){
    const ej=FTRoutine.effective(base,mn,it,en.id),plan=ej.plan||{},circuit=ej.tipo==='circuito',parts=ej.circuitoLineas||base.circuitoLineas||[];
    const arr=circuit?'lineas':'series',record=it?.sesiones?.[mn]?.[en.id]?.ejs?.[base.id],planned=circuit?(base.source?(plan.recordSlots||0)*parts.length:parts.length):(plan.series||0);
    const count=Math.max(planned,record?.[arr]?.length||0);
    const targets=Array.isArray(plan.repsTarget)?plan.repsTarget.map(String):String(plan.repsTarget||'').split('/').map(s=>s.trim()).filter(Boolean);
    const displayTargets=targets.map(value=>value.replace(/\s*@\s*\d+(?:[.,]\d+)?\s*%.*/,'').trim());
    const patchedPercent=Object.hasOwn(record?.prescripcion?.plan||{},'porcentaje');
    const exactSourceLabel=!!plan.label&&!patchedPercent&&(plan.capacityUnspecified||!targets.length||!!plan.porcentaje||/\b(?:o|u)\b|\?/.test(plan.seriesLiteral||''));
    const planText=exactSourceLabel||!Number.isFinite(Number(plan.series))
      ?(plan.label||'No programado')
      :`${plan.series||0} ${circuit?'rondas':'series'}${displayTargets.length?' · Reps objetivo: '+displayTargets.join(' / '):''}`;
    const info=[`Descanso: ${plan.pausa||'No indicado'}`,plan.porcentaje&&!planText.includes('%')?`% de carga: ${plan.porcentaje}`:'',plan.cargaObjetivo?`Carga objetivo: ${plan.cargaObjetivo}`:'',plan.rir?`RIR: ${plan.rir}`:'',plan.rpe?`RPE: ${plan.rpe}`:'',plan.tempo?`Tempo: ${plan.tempo}`:''].filter(Boolean);
    const subtitle=String(ej.subtitle||'').split('\n').map(s=>s.trim()).filter(s=>s&&!/^Alterno con$/i.test(s)).join('\n');
    const note=plan.indicaciones&&plan.indicaciones!==en.indicaciones?.[mn]?plan.indicaciones:'';
    const nameLines=rows(ej.nombre.toUpperCase(),cardW-20,9,bold),nameH=Math.max(1,nameLines.length)*12+12;
    const subH=subtitle?rows(subtitle,cardW-18,8,italic).length*11:0;
    const planH=Math.max(1,rows(planText,cardW-18,8,bold).length)*11;
    const infoH=info.reduce((sum,value)=>sum+Math.max(1,rows(value,cardW-18,7).length)*10,0);
    const noteH=note?rows(note,cardW-18,7).length*10+4:0;
    const rowLabel=r=>circuit?`${Math.floor(r/(parts.length||1))+1} · ${parts[r%(parts.length||1)]||'Ejercicio'}`:`${r+1}ª serie`;
    const targetAt=r=>displayTargets.length===1?displayTargets[0]:(displayTargets[circuit?Math.floor(r/(parts.length||1)):r]||'');
    const rowHeight=r=>Math.max(18,rows(rowLabel(r),102,7).length*9+2,rows(targetAt(r),31,7).length*9+2);
    const heights=Array.from({length:count},(_,r)=>rowHeight(r));
    const h=nameH+7+subH+planH+infoH+4+14+heights.reduce((sum,v)=>sum+v,0)+noteH+38+7;
    metadata.movements[`${en.id}/${mn}/${base.id}`]={name:ej.nombre,library:ej.libraryId||null};
    return {base,en,mn,ej,plan,circuit,parts,arr,record,count,targets,targetAt,planText,info,subtitle,note,nameH,subH,planH,infoH,noteH,rowLabel,heights,h};
  }
  function drawSessionCard(card,x,top){
    const {base,en,mn,ej,arr,record,count,targetAt,planText,info,subtitle,note,nameH,subH,planH,infoH,noteH,rowLabel,heights,h,circuit}=card;
    page.drawRectangle({x,y:top-h,width:cardW,height:h,borderWidth:.6,borderColor:line,color:rgb(1,1,1)});
    page.drawRectangle({x,y:top-nameH,width:cardW,height:nameH,color:black});
    text(ej.nombre.toUpperCase(),x+9,top-13,cardW-18,9,bold,rgb(1,1,1));
    let cy=top-nameH-7;
    if(subtitle){text(subtitle,x+9,cy,cardW-18,8,italic,gray);cy-=subH;}
    text(planText,x+9,cy,cardW-18,8,bold,ink);cy-=planH;
    for(const item of info){text(item,x+9,cy,cardW-18,7,font,gray);cy-=Math.max(1,rows(item,cardW-18,7).length)*10;}
    cy-=4;
    page.drawLine({start:{x:x+8,y:cy+5},end:{x:x+cardW-8,y:cy+5},color:line,thickness:.5});
    text(circuit?'RONDA / EJERCICIO':'SERIE',x+9,cy,104,6,bold,gray);
    text('OBJ.',x+114,cy,32,6,bold,gray);
    text('KG',x+153,cy,42,6,bold,gray);
    text('REPS',x+205,cy,42,6,bold,gray);
    cy-=14;
    for(let r=0;r<count;r++){
      const rh=heights[r],label=rowLabel(r);
      if(r%2===1)page.drawRectangle({x:x+7,y:cy-rh+3,width:cardW-14,height:rh,color:rgb(.98,.98,.97)});
      text(label,x+9,cy,102,7,font,black);
      text(targetAt(r),x+114,cy,31,7,bold,ink);
      for(const [key,fx,fw] of [['kg',x+150,45],['reps',x+202,45]]){
        field(`ej_${base.id}_${mn}_${en.id}_${arr}_${r}_${key}`,record?.[arr]?.[r]?.[key],fx,cy+7,fw,16,key);
      }
      cy-=rh;
    }
    if(note){text(note,x+9,cy-2,cardW-18,7,font,gray);cy-=noteH;}
    text('COMENTARIO DEL EJERCICIO',x+9,cy-5,cardW-18,6,bold,gray);
    field(`comentario_${base.id}_${mn}_${en.id}`,record?.comentario,x+9,cy-10,cardW-18,26);
  }
  function sessionCardio(en,mn,top){
    const label=en.cardioByMicro?.[mn]?.label||'Sin indicación',labelLines=rows(label,SW-2*SM-122,8).length;
    const h=Math.max(75,labelLines*11+59);
    if(top-h<42)return {h,drawn:false};
    page.drawRectangle({x:SM,y:top-h,width:SW-2*SM,height:h,borderWidth:.6,borderColor:line,color:pale});
    text('AERÓBICO',SM+10,top-16,100,9,bold,ink);
    text(label,SM+112,top-16,SW-2*SM-122,8,font,black);
    const fy=top-Math.max(33,labelLines*11+13);
    const labels=[['tipo','TIPO'],['tiempo','TIEMPO'],['intensidad','INTENSIDAD']];
    labels.forEach(([key,caption],i)=>{
      const fx=SM+10+i*174;text(caption,fx,fy,164,7,bold,gray);
      field(`aer_${en.id}_${mn}_${key}`,it?.sesiones?.[mn]?.[en.id]?.aerobica?.[key],fx,fy-4,160,20);
    });
    return {h,drawn:true};
  }
  const allSessions=Math.max(0,...(a.rutina?.entrenos||[]).map(en=>en.numMicro||a.rutina.numMicro||6));
  for(let mn=1;mn<=allSessions;mn++)for(const en of a.rutina?.entrenos||[]){
    const total=en.numMicro||a.rutina.numMicro||6;if(mn>total)continue;
    const cards=[...(en.ejercicios||[])].sort((a,b)=>(a.orden||0)-(b.orden||0)).map(base=>sessionCard(base,en,mn));
    let sy=sessionPage(en,mn,total);
    for(let i=0;i<cards.length;i+=2){
      const left=cards[i],right=cards[i+1],rowH=Math.max(left.h,right?.h||0);
      if(sy-rowH<95)sy=sessionPage(en,mn,total,true);
      if(sy-rowH<42)throw Error(`El ejercicio de ${en.nombre} no cabe en una página. Acorta sus notas antes de exportar.`);
      drawSessionCard(left,SM,sy);if(right)drawSessionCard(right,SM+cardW+SG,sy);
      sy-=rowH+12;
    }
    if(!sessionCardio(en,mn,sy).drawn){sy=sessionPage(en,mn,total,true);if(!sessionCardio(en,mn,sy).drawn)throw Error(`La indicación aeróbica de ${en.nombre} no cabe en una página.`);}
  }
  const embedded=new Map();
  async function image(src){
    if(!embedded.has(src)){
      const response=await fetch(src,{credentials:'same-origin'});if(!response.ok)throw Error('No se ha podido cargar una imagen del anexo. El PDF no se ha descargado incompleto.');
      const bytes=new Uint8Array(await response.arrayBuffer());embedded.set(src,await doc.embedJpg(bytes));
    }
    return embedded.get(src);
  }
  tableLayout=null;
  for(const group of tobRoutineGuides(a,it)){
    let index=0;
    for(const {name,movement,subtitle,illustration}of group.items){
      const shown=movement||illustration;
      const nameH=rows(name,188,11,bold).length*14,cue=[subtitle||movement?.equipment,illustration?'Variante ilustrada: '+illustration.name:'',!movement?FTExercises.referenceNote(name):'',shown?.generated?'Ilustracion generada por IA':''].filter(Boolean).join('\n')||'Ejercicio sin asociar',cueH=rows(cue,188,8,bold).length*11;
      const technique=shown?.technique||'Consulta con tu entrenador la variante y su ejecución. No se ha asociado una fotografía por suposición.';
      const h=Math.max(shown?.generated?180:126,nameH+cueH+rows(technique,188,8).length*11+24);
      if(index===0||index>=3||y-h<38){next('Cómo realizar los ejercicios');text('ANEXO VISUAL · '+group.name,M,y,W-2*M,8,bold,ink);y-=20;index=0;}
      const top=y;
      if(top-h<38)throw Error('Una explicación es demasiado larga para el anexo. Revisa su extensión antes de exportar.');
      page.drawRectangle({x:M,y:top-h,width:W-2*M,height:h,borderWidth:.5,borderColor:line});page.drawRectangle({x:M,y:top-h,width:212,height:h,color:pale});
      text(name,M+12,top-18,188,11,bold);text(cue,M+12,top-18-nameH-2,188,8,bold,ink);text(technique,M+12,top-18-nameH-cueH-6,188,8,font,gray);
      if(shown)for(let i=0;i<2;i++){
        const img=await image(shown.images[i]),maxW=258,maxH=h-12,scale=Math.min(maxW/img.width,maxH/img.height),x=M+222+i*274;
        page.drawImage(img,{x:x+(maxW-img.width*scale)/2,y:top-h+(h-img.height*scale)/2,width:img.width*scale,height:img.height*scale});
      }
      y-=h+8;index++;
    }
  }
  doc.setSubject('FTROUTINE:'+JSON.stringify(metadata));doc.setTitle(title);doc.setAuthor('Full Training');
  doc.getPages().forEach((p,i)=>{p.drawText('FULL TRAINING · ENTRENAMIENTO PERSONAL',{x:M,y:18,size:7,font,color:gray});p.drawText(`${i+1} / ${doc.getPageCount()}`,{x:p.getWidth()-75,y:18,size:7,font,color:gray});});
  form.updateFieldAppearances(font);const bytes=await doc.save();if(returnBytes)return bytes;
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  if(preview){if(!window.open(url,'_blank'))tobToast('Permite la vista previa en otra pestaña','red');}
  else{const link=document.createElement('a');link.href=url;link.download=`${(cli?.nombre||'rutina').replace(/[^a-zA-Z0-9]/g,'_')}_it${it?.numero||1}.pdf`;link.click();}
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

async function tobImportRoutinePdf(file){
  const a=tobAsig(),it=tobIt(),cli=tobDB.clientes.find(c=>c.id===tobCurrentAsig?.clienteId),status=document.getElementById('tobPdfStatus');
  if(!a||!it){tobToast('Abre la rutina y la iteración de destino','red');return;}
  status.textContent='Leyendo y comprobando el PDF...';
  try{
    const doc=await PDFLib.PDFDocument.load(await file.arrayBuffer()),fields=doc.getForm().getFields();
    if(!fields.length)throw Error('El PDF no contiene campos de formulario importables. Conserva el original y registra los datos manualmente.');
    const subject=doc.getSubject()||'',meta=subject.startsWith('FTROUTINE:')?JSON.parse(subject.slice(10)):null;
    if(meta&&(meta.client!==cli?.id||meta.assignment!==a.id||meta.iteration!==it.id))throw Error('Este PDF pertenece a otro cliente, rutina o iteración. No se ha importado ningún dato.');
    if(!meta&&!confirm(`PDF antiguo sin identificación verificable. Confirma que pertenece a ${cli?.nombre}, iteración ${it.numero}. Los IDs de ejercicio por sí solos no identifican al cliente. ¿Revisar e importar aquí?`)){status.textContent='Importación cancelada; no se han cambiado datos.';return;}
    const staged=FTRoutine.clone(it),changes=[];let values=0,conflicts=0;
    function exerciseScope(token){
      const matches=[];
      for(const en of a.rutina.entrenos){
        const suffix='_'+en.id;if(!token.endsWith(suffix))continue;
        const m=token.slice(0,-suffix.length).match(/^(.+)_(\d+)$/);
        if(m&&en.ejercicios.some(e=>e.id===m[1]))matches.push([m[1],Number(m[2]),en.id]);
      }
      if(matches.length!==1)throw Error('El PDF contiene una posición de ejercicio desconocida o ambigua.');
      return matches[0];
    }
    for(const f of fields){
      if(!f.getText)continue;const name=f.getName(),value=f.getText();if(!value)continue;
      let m,entId,mn,kind,ejId,arr,idx,key;
      if((m=name.match(/^ej_(.+)_(series|lineas)_(\d+)_(kg|reps)$/))){[ejId,mn,entId]=exerciseScope(m[1]);[, ,arr,idx,key]=m;kind='result';}
      else if((m=name.match(/^comentario_(.+)$/))){[ejId,mn,entId]=exerciseScope(m[1]);kind='comment';}
      else if((m=name.match(/^sesion_comentario_(\w+)_(\d+)$/))){[,entId,mn]=m;kind='session';}
      else if((m=name.match(/^fecha_(\w+)_(\w+)$/))){[mn,entId]=/^\d+$/.test(m[1])?[m[1],m[2]]:[m[2],m[1]];kind='date';}
      else if((m=name.match(/^aer_(\w+)_(\w+)_(tipo|tiempo|intensidad)$/))){[mn,entId]=/^\d+$/.test(m[1])?[m[1],m[2]]:[m[2],m[1]];key=m[3];kind='aer';}
      else continue;
      mn=Number(mn);const en=a.rutina.entrenos.find(e=>e.id===entId),ej=en?.ejercicios.find(e=>e.id===ejId);
      if(!en||!Number.isInteger(mn)||mn<1||mn>(en.numMicro||a.rutina.numMicro||6)||(ejId&&!ej))throw Error('El PDF no coincide con la estructura actual. No se ha importado ningún dato.');
      if(ej){
        const effective=FTRoutine.effective(ej,mn,it,entId),identity=meta?.movements?.[`${entId}/${mn}/${ejId}`];
        if(meta&&(!identity||identity.name!==effective.nombre||(identity.library||'')!==(effective.libraryId||'')))throw Error('La programación del ejercicio cambió desde este PDF. Revisa el documento antes de importar.');
        if(!meta&&effective.nombre!==ej.nombre)throw Error('Un PDF antiguo no permite verificar la sustitución de este ejercicio. Importa sus datos manualmente.');
      }
      const ses=tobGetSesionIt(staged,mn,entId);ses.ejs||={};ses.aerobica||={};let target,property,newValue=value;
      if(kind==='date'){
        newValue=FTRoutine.resolveDate(value,FTRoutine.dateContext(a,{...staged,fechaInicio:staged.fechaInicio||meta?.period},mn,entId));target=ses;property='fecha';
      }else if(kind==='session'){target=ses;property='comentario';newValue=value.slice(0,300);}
      else if(kind==='aer'){target=ses.aerobica;property=key;}
      else{
        ses.ejs[ejId]||={};target=ses.ejs[ejId];property='comentario';
        if(kind==='result'){
          idx=Number(idx);if(idx>199)throw Error('Índice de serie fuera de rango.');
          if((ej.tipo==='circuito')!==(arr==='lineas'))throw Error('El tipo de registro no coincide con el ejercicio.');
          newValue=tobParseResult(value,key);target[arr]||=[];while(target[arr].length<=idx)target[arr].push({kg:null,reps:null});target=target[arr][idx];property=key;
        }
      }
      if(target[property]!=null&&target[property]!==''&&target[property]!==newValue)conflicts++;
      if(target[property]!==newValue){target[property]=newValue;values++;changes.push(name);}
    }
    if(!values){status.textContent='No hay valores nuevos que importar.';return;}
    if(!confirm(`${cli?.nombre} · Iteración ${it.numero}: ${values} campos nuevos o modificados; ${conflicts} sustituyen valores existentes. ¿Importar en esta iteración?`)){status.textContent='Importación cancelada; datos conservados.';return;}
    if(tobIt()!==it||tobAsig()!==a)throw Error('Ha cambiado la selección de destino. Repite la revisión.');
    it.sesiones=staged.sesiones;
    if(!tobSave()){status.textContent='No confirmado. Los datos leídos se conservan en esta ventana; exporta tu copia antes de cerrar.';return;}
    status.textContent=`${values} campos importados en la iteración ${it.numero}.`;tobRenderEntreno();tobRenderCharts();
  }catch(error){status.textContent=error.message;tobToast(error.message,'red');}
}
