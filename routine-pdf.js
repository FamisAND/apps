/* Visual, editable routine PDF. IDs stay compatible; metadata prevents cross-client imports. */
async function tobBuildVisualRoutinePdf(cli,a,pl,it,preview,returnBytes=false){
  const {PDFDocument,StandardFonts,rgb}=PDFLib,doc=await PDFDocument.create(),form=doc.getForm();
  const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const W=842,H=595,M=30,black=rgb(.08,.09,.08),gray=rgb(.4,.43,.41),line=rgb(.81,.83,.81),accent=rgb(.84,.48,0),pale=rgb(1,.96,.85);
  const safe=value=>tobPdfSafe(String(value??'')).replace(/[\u0000-\u001f]/g,' ');
  const title=pl?tobRutinaShortName(pl):'Programa de entrenamiento';
  const period=FTRoutine.fullDate(it?.fechaInicio)||FTRoutine.fullDate(a.fechaInicio)||'';
  const metadata={version:1,client:cli?.id||null,assignment:a.id,iteration:it?.id||null,period,movements:{}};
  let page,y;
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
  function next(heading){
    page=doc.addPage([W,H]);page.drawRectangle({x:0,y:0,width:8,height:H,color:accent});
    text('FULL TRAINING',M,H-35,280,16,bold);text(cli?.nombre||'Plantilla',W-300,H-33,270,9,font,gray);
    const hh=text(heading,M,H-72,W-2*M,17,bold);text(title+' · Iteración '+(it?.numero||1),M,H-76-hh,W-2*M,9,font,gray);
    page.drawLine({start:{x:M,y:H-92-hh},end:{x:W-M,y:H-92-hh},thickness:1,color:line});y=H-112-hh;
  }
  function field(name,value,x,top,width,height,kind){
    const f=form.createTextField(name);if(value!=null)f.setText(safe(value));
    if(height>22)f.enableMultiline();
    f.addToPage(page,{x,y:top-height,width,height,font,borderColor:line,borderWidth:.5,backgroundColor:rgb(.98,.99,.98)});f.setFontSize(8);
    if(kind)tobPdfNumberField(doc,f,kind);return f;
  }
  function ensure(height,heading){if(y-height<42)next(heading);}
  next('Tu programa de entrenamiento');
  text(title,M,y,W-2*M,27,bold);y-=58;
  text('Cliente',M,y,150,9,font,gray);text(cli?.nombre||'Plantilla',M+150,y,550,14,bold);y-=32;
  text('Inicio del periodo',M,y,150,9,font,gray);text(period?period.split('-').reverse().join('/'):'Por confirmar',M+150,y,550,12,bold);y-=32;
  const total=Math.max(0,...(a.rutina?.entrenos||[]).map(en=>en.numMicro||a.rutina.numMicro||6));
  text(`${total} microciclos · ${(a.rutina?.entrenos||[]).length} días de entrenamiento`,M,y,700,12,bold);y-=42;
  const desc=pl?.descripcion||'';
  for(const row of rows(desc,W-2*M,10)){ensure(17,'Tu programa');text(row,M,y,W-2*M,10);y-=15;}
  y-=24;
  text('Registro',M,y,700,12,bold);y-=22;
  text('Fecha: DD/MM. Anota solo números en Kg y Reps; utiliza los comentarios para sensaciones o molestias. Los porcentajes y descansos corresponden a cada microciclo.',M,y,700,10,font,gray);
  const guides=new Map();
  for(const en of a.rutina?.entrenos||[]){
    const total=en.numMicro||a.rutina.numMicro||6;
    for(let first=1;first<=total;first+=6){
      const micros=Array.from({length:Math.min(6,total-first+1)},(_,i)=>first+i),x0=142,cw=(W-M-x0)/micros.length;
      const heading=(en.nombre||'Día '+(en.letra||en.id))+' · Microciclos '+micros.join(', ');
      next(heading);
      text('Microciclo',M,y,105,9,bold);micros.forEach((mn,i)=>text(String(mn),x0+i*cw,y,cw-8,11,bold,accent));y-=20;
      text('Fecha DD/MM',M,y,105,9,bold);micros.forEach((mn,i)=>field(`fecha_${en.id}_${mn}`,FTRoutine.shortDate(it?.sesiones?.[mn]?.[en.id]?.fecha),x0+i*cw,y+9,cw-10,20));y-=32;
      text('Comentario del día',M,y,105,8,bold);micros.forEach((mn,i)=>field(`sesion_comentario_${en.id}_${mn}`,it?.sesiones?.[mn]?.[en.id]?.comentario,x0+i*cw,y+9,cw-10,30).setMaxLength(300));y-=40;
      const guidance=micros.map(mn=>en.indicaciones?.[mn]||'');
      const gh=Math.max(0,...guidance.map(v=>rows(v,cw-10,8).length*11));
      if(gh){ensure(gh+15,heading);text('Indicación del día',M,y,105,8,bold);guidance.forEach((v,i)=>text(v,x0+i*cw,y,cw-10,8));y-=gh+14;}
      for(const base of [...(en.ejercicios||[])].sort((a,b)=>(a.orden||0)-(b.orden||0))){
        const effective=micros.map(mn=>FTRoutine.effective(base,mn,it,en.id));
        for(let i=0;i<micros.length;i++){
          const ej=effective[i],movement=tobRoutineMovement(ej);
          metadata.movements[`${en.id}/${micros[i]}/${base.id}`]={name:ej.nombre,library:ej.libraryId||null};
          if(ej.tipo==='circuito'){
            for(const name of ej.circuitoLineas||[]){const movement=FTExercises.resolve(name,tobDB.exerciseAliases||{});guides.set(movement?.id||name,{name,movement});}
          }else guides.set(movement?.id||ej.nombre,{name:ej.nombre,movement});
        }
        const circuit=base.tipo==='circuito',arr=circuit?'lineas':'series',components=base.circuitoLineas||[];
        const counts=effective.map((e,i)=>Math.max(circuit?(base.source?(e.plan.recordSlots||0)*components.length:components.length):(e.plan.series||0),it?.sesiones?.[micros[i]]?.[en.id]?.ejs?.[base.id]?.[arr]?.length||0));
        const count=Math.max(0,...counts);
        const labels=effective.map(e=>[e.nombre,tobPlanLabel(e.plan),e.plan.porcentaje,...['cargaObjetivo','rir','rpe','tempo'].filter(k=>e.plan[k]).map(k=>`${{cargaObjetivo:'Carga',rir:'RIR',rpe:'RPE',tempo:'Tempo'}[k]}: ${e.plan[k]}`)].filter(Boolean).join('\n'));
        const notes=effective.map(e=>[e.subtitle,e.plan.indicaciones].filter(Boolean).join('\n'));
        const headerH=Math.max(32,...labels.map(v=>rows(v,cw-12,8,bold).length*11+12));
        const restH=Math.max(18,...effective.map(e=>rows(e.plan.pausa||'Sin indicación',cw-12,8).length*11+6));
        const noteH=Math.max(0,...notes.map(v=>rows(v,cw-12,8).length*11));
        if(headerH>160||noteH>240)throw Error('Una prescripción o nota es demasiado larga para el PDF. Revisa su extensión antes de exportar; el original se conserva.');
        let offset=0;
        do{
          const need=headerH+Math.min(count-offset,8)*19+70;ensure(need,heading);
          text(base.nombre,M,y,105,9,bold);
          effective.forEach((ej,i)=>{page.drawRectangle({x:x0+i*cw,y:y-headerH+10,width:cw-8,height:headerH,color:pale});text(labels[i],x0+i*cw+4,y,cw-16,8,bold);});y-=headerH+6;
          text('Serie / ejercicio',M,y,105,8,bold);micros.forEach((mn,i)=>{text('Kg',x0+i*cw,y,cw/2-8,8);text('Reps',x0+i*cw+cw/2,y,cw/2-8,8);});y-=15;
          const capacity=Math.max(1,Math.floor((y-42-65)/20)),end=Math.min(count,offset+capacity);
          for(let r=offset;r<end;r++){
            const label=circuit?`${Math.floor(r/(components.length||1))+1} · ${components[r%(components.length||1)]||''}`:`${r+1}ª serie`;
            const rh=Math.max(19,rows(label,105,7).length*10+3);
            if(y-rh<100)break;
            text(label,M,y,105,7);
            micros.forEach((mn,i)=>{
              if(r>=counts[i])return;const record=it?.sesiones?.[mn]?.[en.id]?.ejs?.[base.id]?.[arr]?.[r];
              for(const [j,k]of ['kg','reps'].entries())field(`ej_${base.id}_${mn}_${en.id}_${arr}_${r}_${k}`,record?.[k],x0+i*cw+j*cw/2,y+9,cw/2-9,16,k);
            });y-=rh;offset=r+1;
          }
          if(offset<count){next(heading);continue;}
          ensure(restH+noteH+63,heading);
          text('Descanso',M,y,105,8,bold,accent);effective.forEach((ej,i)=>text(ej.plan.pausa||'Sin indicación',x0+i*cw,y,cw-12,8));y-=restH;
          if(noteH){text('Entrenador',M,y,105,8,bold);notes.forEach((v,i)=>text(v,x0+i*cw,y,cw-12,8));y-=noteH+8;}
          text('Comentarios',M,y,105,8,bold);micros.forEach((mn,i)=>field(`comentario_${base.id}_${mn}_${en.id}`,it?.sesiones?.[mn]?.[en.id]?.ejs?.[base.id]?.comentario,x0+i*cw,y+8,cw-10,30));y-=44;
          page.drawLine({start:{x:M,y:y+4},end:{x:W-M,y:y+4},color:line,thickness:.5});
          break;
        }while(offset<count);
      }
      const cardio=micros.map(mn=>en.cardioByMicro?.[mn]?.label||'Sin indicación'),ch=Math.max(16,...cardio.map(v=>rows(v,cw-12,8).length*11));
      ensure(ch+92,heading);text('Aeróbico',M,y,105,8,bold);cardio.forEach((v,i)=>text(v,x0+i*cw,y,cw-12,8));y-=ch+8;
      for(const key of ['tipo','tiempo','intensidad']){text(key,M,y,105,8);micros.forEach((mn,i)=>field(`aer_${en.id}_${mn}_${key}`,it?.sesiones?.[mn]?.[en.id]?.aerobica?.[key],x0+i*cw,y+9,cw-10,19));y-=26;}
    }
  }
  const embedded=new Map();
  async function image(src){
    if(!embedded.has(src)){
      const response=await fetch(src,{credentials:'same-origin'});if(!response.ok)throw Error('No se ha podido cargar una imagen del anexo. El PDF no se ha descargado incompleto.');
      const bytes=new Uint8Array(await response.arrayBuffer());embedded.set(src,await doc.embedJpg(bytes));
    }
    return embedded.get(src);
  }
  let index=0;
  for(const {name,movement}of guides.values()){
    if(index%3===0)next('Cómo realizar los ejercicios');
    const top=H-133-(index%3)*143;
    text(name,M,top,215,12,bold);
    text(movement?.equipment||'Ejercicio sin asociar',M,top-29,215,8,bold,accent);
    text(movement?.technique||'Consulta con tu entrenador la variante y su ejecución. No se ha asociado una fotografía por suposición.',M,top-47,215,9,font,gray);
    if(movement)for(let i=0;i<2;i++){
      const img=await image(movement.images[i]),maxW=257,maxH=126,scale=Math.min(maxW/img.width,maxH/img.height),x=270+i*273;
      page.drawImage(img,{x:x+(maxW-img.width*scale)/2,y:top-117,width:img.width*scale,height:img.height*scale});
    }
    page.drawLine({start:{x:M,y:top-130},end:{x:W-M,y:top-130},color:line,thickness:.5});index++;
  }
  doc.setSubject('FTROUTINE:'+JSON.stringify(metadata));doc.setTitle(title);doc.setAuthor('Full Training');
  doc.getPages().forEach((p,i)=>{p.drawText('FULL TRAINING · ENTRENAMIENTO PERSONAL',{x:M,y:18,size:7,font,color:gray});p.drawText(`${i+1} / ${doc.getPageCount()}`,{x:W-75,y:18,size:7,font,color:gray});});
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
