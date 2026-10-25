/* Mechanical asset preparation: split generated diptychs, encode JPEG and audit coverage. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const sharp=require('../cloudflare/node_modules/sharp');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../output/exercise-photos');
const generations=require('./exercise-photo-generations.json'),library=require('../exercise-library.js');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function main(){
  const completed=[];
  for(const item of generations.images){
    if(item.review!=='visually-reviewed')continue;
    const input=fs.readFileSync(item.path),meta=await sharp(input).metadata(),middle=Math.floor(meta.width/2),gutter=9;
    for(const [index,side]of ['start','end'].entries()){
      const file=`exercise-${item.id}-${side}.jpg`,target=path.join(root,file);
      const left=index?middle+gutter:0,width=index?meta.width-middle-gutter:middle-gutter;
      const bytes=await sharp(input).extract({left,top:0,width,height:meta.height}).resize({width:850,height:850,fit:'inside',withoutEnlargement:true}).jpeg({quality:86,mozjpeg:true}).toBuffer();
      if(fs.existsSync(target)&&digest(fs.readFileSync(target))!==digest(bytes))throw Error('Refusing to overwrite '+file);
      if(!fs.existsSync(target))fs.writeFileSync(target,bytes,{flag:'wx'});
      completed.push({id:item.id,file,bytes:bytes.length,sha256:digest(bytes)});
    }
  }
  const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'biio-source.js'),'utf8'),context);
  const source=vm.runInContext('TOB_BIIO_SOURCE',context),names=new Map();
  function add(name){if(name)names.set(library.normalize(name),name);}
  function collect(obj){
    if(!obj||typeof obj!=='object')return;
    if(Array.isArray(obj.ejercicios))for(const ej of obj.ejercicios){if(ej.tipo==='circuito'&&ej.circuitoLineas?.length)ej.circuitoLineas.forEach(add);else add(ej.nombre);}
    if(obj.prescripcion?.nombre)add(obj.prescripcion.nombre);
    for(const v of Object.values(obj))if(v&&typeof v==='object')collect(v);
  }
  collect(source);
  if(process.env.EXERCISE_BACKUP_JSON){const data=JSON.parse(fs.readFileSync(process.env.EXERCISE_BACKUP_JSON,'utf8'));let db=data.training_online.tob_online_v2;if(typeof db==='string')db=JSON.parse(db);collect(db);}
  const inventory=[...names.values()].sort((a,b)=>a.localeCompare(b,'es')).map(name=>{
    const direct=library.resolve(name),shown=direct?[direct]:library.referenceIllustrations(name);
    return {name,association:direct?'exact':'illustrated-variant',illustrations:shown.map(x=>({id:x.id,name:x.name,images:x.images})),missing:shown.length===0};
  });
  fs.mkdirSync(out,{recursive:true});
  const report={created:'2026-10-25',movements:library.entries.length,images:library.entries.length*2,newMovements:completed.length/2,newBytes:completed.reduce((n,x)=>n+x.bytes,0),inventory,assets:completed,withheld:generations.images.filter(x=>x.review!=='visually-reviewed').map(x=>({id:x.id,reason:x.review}))};
  fs.writeFileSync(path.join(out,'inventario.json'),JSON.stringify(report,null,2));
  const md=['# Inventario de ejercicios e imagenes','','Biblioteca: '+report.movements+' movimientos y variantes; '+report.images+' fotografias. '+report.newMovements+' pares nuevos generados mediante image_gen.','',
    'Las variantes ilustradas son ejemplos identificados, no sustituciones ni cambios del ejercicio guardado. Los porcentajes, pausas y descansos no generan movimientos diferentes.',
    'Los nombres DEAD CURL y AB ROLL PULL DOWN requieren confirmar la ejecucion exacta con el entrenador; las imagenes de sus variantes no convierten esos nombres en equivalentes.',
    'No se ha modificado almacenamiento, IDs, resultados, prescripciones ni perfiles. Una variante extra de curl sentado queda fuera de uso por dudas visuales sobre la maquina.','',
    '## Biblioteca completa','',...library.entries.map((x,i)=>`${i+1}. ${x.name} (${x.id}) [${x.generated?'IA':'anexo original'}]`),'','## Nombres encontrados','',
    ...inventory.map(x=>`- ${x.name}: ${x.missing?'SIN IMAGEN':x.association==='exact'?'asociacion exacta':'variante/s ilustrada/s'}: ${x.illustrations.map(x=>x.name).join(' / ')}`),''];
  fs.writeFileSync(path.join(out,'INVENTARIO.md'),md.join('\n'));
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Biblioteca de ejercicios | Full Training</title><style>body{font:15px system-ui;margin:0;color:#16251e;background:#f5f7f6}header,main{max-width:1180px;margin:auto;padding:24px}header{border-bottom:1px solid #cbd7cf}h1{font-size:28px}h2{font-size:18px;margin:0 0 8px}article{padding:24px 0;border-bottom:1px solid #cbd7cf;break-inside:avoid}.photos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}img{width:100%;height:340px;object-fit:contain;background:white}p{max-width:900px;line-height:1.5}small{color:#496658}a{color:#12754f}@media(max-width:600px){img{height:240px}header,main{padding:16px}}</style><header><h1>Biblioteca de ejercicios</h1><p>${report.movements} movimientos y variantes · ${report.images} imagenes · ${report.newMovements} pares nuevos</p><a href="INVENTARIO.md">Lista y correspondencias</a></header><main>${library.entries.map(x=>`<article id="${esc(x.id)}"><h2>${esc(x.name)}</h2><small>${esc(x.equipment)} · ${x.generated?'Ilustracion generada por IA':'Anexo original'}</small><p>${esc(x.technique)}</p><div class="photos">${x.images.map((src,i)=>`<img loading="lazy" src="../../apps/${esc(src)}" alt="${esc(x.name)}: ${i?'final':'inicio'}">`).join('')}</div></article>`).join('')}</main></html>`;
  fs.writeFileSync(path.join(out,'catalogo.html'),html);
  console.log(JSON.stringify({movements:report.movements,images:report.images,newImages:completed.length,bytes:report.newBytes,names:inventory.length,missing:inventory.filter(x=>x.missing).map(x=>x.name),out},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
