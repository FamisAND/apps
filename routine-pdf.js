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
  function brand(){text('FULL',40,H-45,60,16,bold,accent);text('TRAINING',85,H-45,160,16,bold);}
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
    descY-=text('Cada columna corresponde a un microciclo. Consulta la prescripción y registra los kilos y las repeticiones de cada serie. Fecha: DD/MM.',435,descY,360,10)+24;
    text('03 / AL TERMINAR',435,descY,360,9,bold,ink);descY-=23;
    text('Anota cómo te has sentido en los comentarios y guarda el PDF con tus resultados.',435,descY,360,10);
  }
  for(const en of a.rutina?.entrenos||[]){
    const total=en.numMicro||a.rutina.numMicro||6;
    for(let first=1;first<=total;first+=7){
      const micros=Array.from({length:Math.min(7,total-first+1)},(_,i)=>first+i),x0=110,cw=(W-M-x0)/micros.length;
      const heading=en.nombre||'ENTRENAMIENTO '+(en.letra||en.id);
      tableLayout={micros,x0,cw};next(heading);
      text('Fecha\nDD/MM',M,y,75,7,bold);micros.forEach((mn,i)=>field(`fecha_${en.id}_${mn}`,FTRoutine.shortDate(it?.sesiones?.[mn]?.[en.id]?.fecha),x0+i*cw,y+8,cw-12,18));y-=28;
      text('Comentario\ndel día',M,y,75,8,bold);micros.forEach((mn,i)=>field(`sesion_comentario_${en.id}_${mn}`,it?.sesiones?.[mn]?.[en.id]?.comentario,x0+i*cw,y+8,cw-12,30).setMaxLength(300));y-=42;
      const guidance=micros.map(mn=>en.indicaciones?.[mn]||'');
      const gh=Math.max(0,...guidance.map(v=>rows(v,cw-10,8).length*11));
      if(gh){ensure(gh+15,heading);text('Indicación\ndel día',M,y,75,8,bold);guidance.forEach((v,i)=>text(v,x0+i*cw,y,cw-12,8));y-=gh+10;}
      y-=8;
      for(const base of [...(en.ejercicios||[])].sort((a,b)=>(a.orden||0)-(b.orden||0))){
        const effective=micros.map(mn=>FTRoutine.effective(base,mn,it,en.id));
        for(let i=0;i<micros.length;i++){
          const ej=effective[i];
          metadata.movements[`${en.id}/${micros[i]}/${base.id}`]={name:ej.nombre,library:ej.libraryId||null};
        }
        const circuit=base.tipo==='circuito',arr=circuit?'lineas':'series',components=base.circuitoLineas||[];
        const counts=effective.map((e,i)=>Math.max(circuit?(base.source?(e.plan.recordSlots||0)*components.length:components.length):(e.plan.series||0),it?.sesiones?.[micros[i]]?.[en.id]?.ejs?.[base.id]?.[arr]?.length||0));
        const count=Math.max(0,...counts);
        const sharedSubtitle=effective.every(e=>e.subtitle===base.subtitle&&e.nombre===base.nombre)&&base.subtitle&&bold.widthOfTextAtSize(safe(base.nombre.toUpperCase()),10)+italic.widthOfTextAtSize(safe(base.subtitle),8)<W-2*M-20?base.subtitle:'';
        const labels=effective.map(e=>[e.nombre!==base.nombre?e.nombre:'',tobPlanLabel(e.plan)+(e.plan.porcentaje?' · '+e.plan.porcentaje:'')].filter(Boolean).join('\n'));
        const notes=effective.map(e=>[!sharedSubtitle?e.subtitle:'',e.plan.indicaciones,...['cargaObjetivo','rir','rpe','tempo'].filter(k=>e.plan[k]).map(k=>`${{cargaObjetivo:'Carga',rir:'RIR',rpe:'RPE',tempo:'Tempo'}[k]}: ${e.plan[k]}`)].filter(Boolean).join('\n'));
        const planH=Math.max(18,...labels.map(v=>rows(v,cw-16,8,bold).length*11+6));
        const restH=Math.max(16,...effective.map(e=>rows(e.plan.pausa||'Sin indicación',cw-12,8).length*11+5));
        const noteH=Math.max(0,...notes.map(v=>rows(v,cw-12,8).length*11));
        if(planH>160||noteH>240)throw Error('Una prescripción o nota es demasiado larga para el PDF. Revisa su extensión antes de exportar; el original se conserva.');
        const rowLabel=r=>circuit?`${Math.floor(r/(components.length||1))+1} · ${components[r%(components.length||1)]||''}`:`${r+1}ª serie`;
        const rowHeight=r=>Math.max(14,rows(rowLabel(r),75,7).length*10+2);
        const tailH=restH+noteH+(noteH?8:0)+38,headerH=28+planH+17;
        const allHeight=headerH+Array.from({length:count},(_,i)=>rowHeight(i)).reduce((s,n)=>s+n,0)+tailH;
        const capacity=H-85-rows(heading,W-2*M,17,bold).length*20-28-20-42;
        if(headerH+rowHeight(Math.max(0,count-1))+tailH>capacity)throw Error('Las notas de un ejercicio no caben junto a sus casillas. Revisa su extensión antes de exportar.');
        ensure(allHeight<=capacity?allHeight:headerH+rowHeight(0),heading);
        function blockHeader(){
          page.drawRectangle({x:24,y:y-5,width:W-48,height:19,color:black});
          const name=safe(base.nombre.toUpperCase()),size=Math.min(10,(W-2*M)/Math.max(1,bold.widthOfTextAtSize(name,1)));
          text(name,M,y+1,W-2*M,size,bold,rgb(1,1,1));
          if(sharedSubtitle)text(sharedSubtitle,M+bold.widthOfTextAtSize(name,size)+12,y+2,W-M-(M+bold.widthOfTextAtSize(name,size)+12),8,italic,rgb(.85,.85,.85));
          y-=25;
          effective.forEach((ej,i)=>{page.drawRectangle({x:x0+i*cw,y:y-planH+10,width:cw-5,height:planH,color:pale});text(labels[i],x0+i*cw+4,y,cw-16,8,bold,ink);});y-=planH+4;
          text('Series',M,y,75,8,bold,gray);micros.forEach((mn,i)=>{text('Kg',x0+i*cw+4,y,cw/2-8,7);text('Reps',x0+i*cw+cw/2,y,cw/2-8,7);});y-=13;
        }
        let offset=0;
        do{
          blockHeader();
          for(let r=offset;r<count;r++){
            const rh=rowHeight(r),last=r===count-1;
            if(y-rh-(last?tailH:0)<42)break;
            text(rowLabel(r),M,y,75,7);
            micros.forEach((mn,i)=>{
              if(r>=counts[i])return;const record=it?.sesiones?.[mn]?.[en.id]?.ejs?.[base.id]?.[arr]?.[r];
              for(const [j,k]of ['kg','reps'].entries())field(`ej_${base.id}_${mn}_${en.id}_${arr}_${r}_${k}`,record?.[k],x0+i*cw+j*cw/2,y+8,cw/2-8,12,k);
            });y-=rh;offset=r+1;
          }
          if(offset<count){next(heading);continue;}
          text('Descanso',M,y,75,8,bold,ink);effective.forEach((ej,i)=>text(ej.plan.pausa||'Sin indicación',x0+i*cw,y,cw-12,8));y-=restH;
          if(noteH){text('Entrenador',M,y,75,8,bold);notes.forEach((v,i)=>text(v,x0+i*cw,y,cw-12,8));y-=noteH+8;}
          text('Comentarios',M,y,75,7,bold);micros.forEach((mn,i)=>field(`comentario_${base.id}_${mn}_${en.id}`,it?.sesiones?.[mn]?.[en.id]?.ejs?.[base.id]?.comentario,x0+i*cw,y+8,cw-12,24));y-=38;
          page.drawLine({start:{x:M,y:y+4},end:{x:W-M,y:y+4},color:line,thickness:.5});
          break;
        }while(offset<count);
      }
      const cardio=micros.map(mn=>en.cardioByMicro?.[mn]?.label||'Sin indicación'),ch=Math.max(16,...cardio.map(v=>rows(v,cw-12,8).length*11));
      ensure(ch+92,heading);text('Aeróbico',M,y,75,8,bold);cardio.forEach((v,i)=>text(v,x0+i*cw,y,cw-12,8));y-=ch+8;
      for(const key of ['tipo','tiempo','intensidad']){text(key,M,y,75,8);micros.forEach((mn,i)=>field(`aer_${en.id}_${mn}_${key}`,it?.sesiones?.[mn]?.[en.id]?.aerobica?.[key],x0+i*cw,y+8,cw-12,18));y-=25;}
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
  tableLayout=null;
  for(const group of tobRoutineGuides(a,it)){
    let index=0;
    for(const {name,movement,subtitle,illustration}of group.items){
      const shown=movement||illustration;
      const nameH=rows(name,188,11,bold).length*14,cue=[subtitle||movement?.equipment,illustration?'Alternativa ilustrada: '+illustration.name:''].filter(Boolean).join('\n')||'Ejercicio sin asociar',cueH=rows(cue,188,8,bold).length*11;
      const technique=shown?.technique||'Consulta con tu entrenador la variante y su ejecución. No se ha asociado una fotografía por suposición.';
      const h=Math.max(126,nameH+cueH+rows(technique,188,8).length*11+24);
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
