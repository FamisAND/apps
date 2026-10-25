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
  const generated=typeof module==='object'&&module.exports?require('./exercise-photos.js'):(root.FTExercisePhotos||[]);
  entries.push(...generated);
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const byId=id=>entries.find(e=>e.id===id)||null;
  function resolve(name,aliases={},explicitId){
    if(explicitId)return byId(explicitId);
    const key=normalize(name);
    if(Object.hasOwn(aliases,key))return byId(aliases[key]);
    const matches=entries.filter(e=>[e.name,...e.aliases].some(a=>normalize(a)===key));
    return matches.length===1?matches[0]:null;
  }
  // Display examples only: never write these choices into stored prescriptions or aliases.
  const references={
    'remo o seal row':['chest-supported-row','bent-over-barbell-row','seal-barbell-row'],
    'remo seal row':['chest-supported-row','bent-over-barbell-row','seal-barbell-row'],
    'dominadas o lat machine':['lat-pulldown','pull-up'],
    'dominadas lat machine':['lat-pulldown','pull-up'],
    'squat':['barbell-back-squat'],
    'squat 2 pausa':['barbell-back-squat'],
    'box squat 2 pausa':['box-squat'],
    'press militar':['standing-barbell-press','seated-barbell-press'],
    'remo':['bent-over-barbell-row','chest-supported-row'],
    'leg curl':['lying-leg-curl'],
    'leg curl o glute ham raise':['lying-leg-curl','glute-ham-raise'],
    'glute ham raise o leg curl':['glute-ham-raise','lying-leg-curl'],
    'hiperextension o leg curl':['back-extension','lying-leg-curl'],
    'press con mancuernas':['flat-dumbbell-press','seated-dumbbell-press'],
    'press mancuernas':['flat-dumbbell-press','seated-dumbbell-press'],
    'press inclinado 45':['incline-barbell-press','incline-dumbbell-press'],
    'press inclinado':['incline-barbell-press','incline-dumbbell-press'],
    'press banco inclinado':['incline-barbell-press','incline-dumbbell-press'],
    'press horizontal':['barbell-bench-press','flat-dumbbell-press'],
    'press triceps o fondos':['close-grip-bench','parallel-bar-dip'],
    'fondos triceps o press estrecho':['parallel-bar-dip','close-grip-bench'],
    'fondos o press estrecho':['parallel-bar-dip','close-grip-bench'],
    'fondos estrechos o press estrecho':['parallel-bar-dip','close-grip-bench'],
    'press estrecho o fondos':['close-grip-bench','parallel-bar-dip'],
    'remo barra o seal row':['bent-over-barbell-row','seal-barbell-row','chest-supported-row'],
    'remo barra t o mancuerna':['t-bar-row','one-arm-dumbbell-row'],
    'calf machine o en prensa':['standing-calf','leg-press-calf'],
    'calf machine o prensa':['standing-calf','leg-press-calf'],
    'calf machine o calf prensa':['standing-calf','leg-press-calf'],
    'prensa 45 o lunge':['leg-press-45','forward-lunge'],
    'prensa 45 o tijeras':['leg-press-45','forward-lunge'],
    'prensa 45 o leg extension':['leg-press-45','leg-extension'],
    'leg extension o prensa 45':['leg-extension','leg-press-45'],
    'prensa 45 o leg extension o split squat':['leg-press-45','leg-extension','split-squat'],
    'calf machine o donkey':['standing-calf','donkey-calf-machine'],
    'press frances':['lying-ez-triceps-extension'],
    'french press':['lying-ez-triceps-extension'],
    'elevacion de talones de pie':['standing-calf'],
    'peso muerto con piernas flexionadas':['barbell-deadlift'],
    'jalones invertidos o remo con barra invertido':['supinated-lat-pulldown','supinated-barbell-row'],
    'aperturas o cruces polea':['dumbbell-fly','cable-fly'],
    'chop con barra':['kneeling-landmine-rotation'],
    'prensa':['leg-press-45'],
    'spider curl':['spider-curl'],
    'lunges o split squat':['forward-lunge','split-squat'],
    'tracciones agarre estrecho':['neutral-grip-pull-up'],
    'tracciones agarre ancho':['wide-grip-pull-up','lat-pulldown'],
    'tracciones supinas':['chin-up','supinated-lat-pulldown'],
    'pull down':['straight-arm-pulldown'],
    'remo trx o seal row':['trx-row','seal-barbell-row','chest-supported-row'],
    'chest press o press banca':['chest-press-machine','barbell-bench-press'],
    'remo landmine o seal row':['t-bar-row','seal-barbell-row','chest-supported-row'],
    'seal row o bent over row':['seal-barbell-row','bent-over-barbell-row'],
    'hip thrust 1 peak':['barbell-hip-thrust'],
    'hip thrust pausa 1':['barbell-hip-thrust'],
    'dead curl biceps':['dead-stop-barbell-curl'],
    'ab roll pull down':['ab-wheel-rollout','kneeling-cable-crunch']
  };
  const additionalAliases={
    'close-grip-bench':['PRESS AGARRE ESTRECHO','PRESS CON AGARRE ESTRECHO','PRESS ESTRECHO TRICEPS'],
    'reverse-crunch':['CRUNCH INVERTIDO']
  };
  for(const [id,aliases]of Object.entries(additionalAliases))byId(id).aliases.push(...aliases);
  function referenceIllustrations(name){return (references[normalize(name)]||[]).map(byId).filter(Boolean);}
  function referenceIllustration(name){return referenceIllustrations(name)[0]||null;}
  function referenceNote(name){return ['dead curl biceps','ab roll pull down'].includes(normalize(name))?'Confirma la variante exacta con tu entrenador antes de realizarla.':'';}
  const api={entries,normalize,byId,resolve,referenceIllustration,referenceIllustrations,referenceNote};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.FTExercises=api;
})(typeof window==='undefined'?globalThis:window);
