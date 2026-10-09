export const MODULES={training:'Clientes y gestion Full Training',training_online:'Consulta: rutinas, nutricion y mediciones',options:'Opciones',patrimonio:'Patrimonio',facturas:'Facturas'};
export const SECTION_MODULE={training:'training',training_online:'training_online',tob_menus_catalog:'training_online',options:'options',patrimonio:'patrimonio',facturas:'facturas',__dashboard_config:'admin'};
export const DATA_KEYS={training:['ft_v4','ft_theme','ft_lang'],training_online:['tob_online_v2'],options:['ot_hist','ot_snaps','ot_activas','ot_cfg'],patrimonio:['pat_v5','pat_dismissed'],facturas:['fac_v1']};
export const FILE_MODULE={'full_training.html':'training','full_training.css':'training','consulta.html':'training_online','consulta.js':'training_online','consulta.css':'training_online','biio-source.js':'training_online','biio-support.js':'training_online','options.html':'options','options.css':'options','options-dates.js':'options','pcs-guide.js':'options','patrimonio.html':'patrimonio','patrimonio.css':'patrimonio','facturas.html':'facturas','facturas.js':'facturas','facturas.css':'facturas','session-admin.html':'admin','session-admin.js':'admin'};
export const RECORD_FILES=new Set(['hash.mjs','snapshot-codec.mjs','record-client.mjs','checkpoint-store.mjs','record-layout.mjs','record-bridge.mjs','record-loader.mjs','storage-dialog.mjs','media-format.mjs','media-client.mjs','settings-client.mjs']);
export const COMMON_FILES=new Set(['index.html','index.js','index.css','design-system.css','github-sync.js','dashboard-auth.js','utils.js','manifest.json','app-session.js',...RECORD_FILES]);
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
