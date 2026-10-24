(function(root){
  'use strict';
  const entries=[
    ['box-squat','Box squat',['BOX SQUAT','SENTADILLA A CAJON','SENTADILLA AL CAJON'],'Barra y cajón','Lleva la cadera atrás, mantén las rodillas en la dirección de los pies y toca el cajón con control. Conserva la tensión y sube empujando el suelo.'],
    ['seated-barbell-press','Press militar sentado con barra',['PRESS MILITAR SENTADO','PRESS MILITAR SENTADA','PRESS MILITAR SENTADO CON BARRA'],'Barra y banco','Apoya la espalda y mantén el abdomen firme. Baja con control hacia la zona de clavículas y presiona sin arquear la zona lumbar.'],
    ['chest-supported-row','Remo con mancuernas y pecho apoyado',['SEAL ROW CON MANCUERNAS','REMO CON MANCUERNAS PECHO APOYADO'],'Mancuernas y banco','Apoya el pecho en el banco, deja colgar los brazos y lleva los codos atrás acercando la carga al tronco. Evita encoger los hombros.'],
    ['barbell-curl','Curl con barra',['CURL CON BARRA','CURL BARRA'],'Barra','Mantén el tronco estable y los codos cerca del cuerpo. Flexiona sin balancearte y baja la barra de forma controlada.'],
    ['back-extension','Hiperextensión 45°',['HIPEREXTENSION','HIPEREXTENSION 45','HIPEREXTENSION 45 GRADOS'],'Banco de 45°','Flexiona desde la cadera sin redondear la espalda. Sube hasta alinear el tronco con las piernas, sin sobreextender la zona lumbar.'],
    ['standing-calf','Gemelos de pie en máquina',['CALF MACHINE','GEMELOS DE PIE EN MAQUINA'],'Máquina de gemelos','Deja bajar los talones con control y sube hasta las puntas. Evita rebotes y mantén las rodillas estables.'],
    ['barbell-deadlift','Peso muerto con barra',['PESO MUERTO','PESO MUERTO CONVENCIONAL','PESO MUERTO CON BARRA'],'Barra','Mantén la barra cerca del cuerpo, el abdomen firme y la espalda neutra. Empuja el suelo y extiende rodillas y cadera hasta quedar de pie.'],
    ['barbell-hip-thrust','Hip thrust con barra',['HIP THRUST','HIP THRUST CON BARRA'],'Barra y banco','Apoya la parte alta de la espalda en el banco. Empuja con los pies y extiende la cadera sin arquear la zona lumbar. Baja con control.'],
    ['lat-pulldown','Jalón al pecho',['LAT MACHINE','JALON AL PECHO','JALON AL PECHO AGARRE PRONO'],'Polea alta','Inicia bajando los hombros y lleva la barra hacia la parte alta del pecho. Evita balancearte y controla el regreso.'],
    ['leg-press-45','Prensa 45°',['PRENSA 45','PRENSA 45 GRADOS','PRENSA INCLINADA 45'],'Prensa inclinada','Apoya bien los pies. Baja hasta un rango cómodo sin despegar la pelvis y empuja sin bloquear por completo las rodillas.'],
    ['reverse-crunch','Crunch inverso',['CRUNCH INVERSO'],'Colchoneta','Parte con caderas y rodillas flexionadas. Acerca las rodillas al tronco elevando suavemente la pelvis; vuelve sin dejar caer las piernas.'],
    ['close-grip-bench','Press banca con agarre estrecho',['PRESS ESTRECHO','PRESS BANCA AGARRE ESTRECHO'],'Barra y banco','Agarra cerca de la anchura de hombros. Baja con los codos relativamente cerca del cuerpo y empuja manteniendo las muñecas alineadas.']
  ].map(([id,name,aliases,equipment,technique])=>({id,name,aliases,equipment,technique,images:[`exercise-${id}-start.jpg`,`exercise-${id}-end.jpg`],source:'Anexo visual aportado por el entrenador; versión 1'}));
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const byId=id=>entries.find(e=>e.id===id)||null;
  function resolve(name,aliases={},explicitId){
    if(explicitId)return byId(explicitId);
    const key=normalize(name);
    if(Object.hasOwn(aliases,key))return byId(aliases[key]);
    const matches=entries.filter(e=>[e.name,...e.aliases].some(a=>normalize(a)===key));
    return matches.length===1?matches[0]:null;
  }
  const api={entries,normalize,byId,resolve};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.FTExercises=api;
})(typeof window==='undefined'?globalThis:window);
