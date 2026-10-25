export const MODULES={training:'Clientes y gestion Full Training',training_online:'Consulta: rutinas, nutricion y mediciones',options:'Opciones',patrimonio:'Patrimonio',facturas:'Facturas',funding:'Tracker de Fondeo'};
export const SECTION_MODULE={training:'training',training_online:'training_online',tob_menus_catalog:'training_online',options:'options',patrimonio:'patrimonio',facturas:'facturas',funding:'funding',__dashboard_config:'admin'};
export const DATA_KEYS={training:['ft_v4','ft_theme','ft_lang'],training_online:['tob_online_v2'],options:['ot_hist','ot_snaps','ot_activas','ot_cfg'],patrimonio:['pat_v5','pat_dismissed'],facturas:['fac_v1'],funding:['funding_tracker_v1']};
export const FILE_MODULE={'full_training.html':'training','full_training.css':'training','consulta.html':'training_online','consulta.js':'training_online','consulta.css':'training_online','biio-source.js':'training_online','biio-support.js':'training_online','options.html':'options','options.css':'options','options-dates.js':'options','pcs-guide.js':'options','patrimonio.html':'patrimonio','patrimonio.css':'patrimonio','facturas.html':'facturas','facturas.js':'facturas','facturas.css':'facturas','funding.html':'funding','funding.js':'funding','funding-model.js':'funding','funding.css':'funding','session-admin.html':'admin','session-admin.js':'admin'};
FILE_MODULE['funding-chart.umd.js']='funding';
FILE_MODULE['funding-chart.LICENSE.txt']='funding';
for(const file of ['exercise-library.js','exercise-photos.js','routine-support.js','routine-ui.js','routine-pdf.js'])FILE_MODULE[file]='training_online';
for(const id of ['box-squat','seated-barbell-press','chest-supported-row','barbell-curl','back-extension','standing-calf','barbell-deadlift','barbell-hip-thrust','lat-pulldown','leg-press-45','reverse-crunch','close-grip-bench'])for(const side of ['start','end'])FILE_MODULE[`exercise-${id}-${side}.jpg`]='training_online';
for(const id of ["barbell-bench-press","barbell-back-squat","standing-barbell-press","parallel-bar-dip","lying-leg-curl","flat-dumbbell-press","seated-dumbbell-press","incline-barbell-press","incline-dumbbell-press","leg-press-calf","pull-up","chin-up","leg-extension","bent-over-barbell-row","seal-barbell-row","t-bar-row","one-arm-dumbbell-row","forward-lunge","split-squat","lying-ez-triceps-extension","glute-ham-raise","donkey-calf-machine","floor-crunch","supinated-lat-pulldown","supinated-barbell-row","dumbbell-fly","cable-fly","forearm-plank","dumbbell-lateral-raise","kneeling-landmine-rotation","incline-dumbbell-curl","spider-curl","neutral-grip-pull-up","wide-grip-pull-up","straight-arm-pulldown","trx-row","chest-press-machine","fitball-crunch","banded-barbell-hip-thrust","cable-front-raise","reverse-cable-fly","cable-glute-kickback","reverse-lunge","ab-wheel-rollout","kneeling-cable-crunch","dead-stop-barbell-curl"])for(const side of ['start','end'])FILE_MODULE[`exercise-${id}-${side}.jpg`]='training_online';
export const RECORD_FILES=new Set(['hash.mjs','request.mjs','snapshot-codec.mjs','record-client.mjs','checkpoint-store.mjs','record-layout.mjs','record-bridge.mjs','record-loader.mjs','storage-dialog.mjs','media-format.mjs','media-client.mjs','settings-client.mjs']);
export const COMMON_FILES=new Set(['index.html','index.js','index.css','design-system.css','github-sync.js','cutover.js','dashboard-auth.js','utils.js','manifest.json','app-session.js','session-ui.css','session-icons.js',...RECORD_FILES]);
export function canAccess(user,module){return !!user?.active && (user.role==='admin'||(module!=='admin'&&user.permissions.includes(module)));}
export function publicUser(row){return {id:row.id,email:row.email,name:row.name,role:row.role,active:!!row.active,permissions:JSON.parse(row.permissions)};}
export function filterData(content,user){
  const out={version:content.version,lastUpdate:content.lastUpdate};
  for(const [section,module]of Object.entries(SECTION_MODULE))if(canAccess(user,module)&&content[section])out[section]=content[section];
  if(user.role==='admin')out.__dashboard_config=content.__dashboard_config||{};
  return out;
}
export function validateSection(section,value){
  if(!SECTION_MODULE[section] || !value || typeof value!=='object' || Array.isArray(value))throw new Error('Invalid section');
  if(DATA_KEYS[section] && Object.keys(value).some(key=>!DATA_KEYS[section].includes(key)))throw new Error('Unexpected storage key');
}
