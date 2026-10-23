export const STORAGE_KEYS={training:['ft_v4','ft_theme','ft_lang'],training_online:['tob_online_v2'],options:['ot_hist','ot_snaps','ot_activas','ot_cfg'],patrimonio:['pat_v5','pat_dismissed'],facturas:['fac_v1'],funding:['funding_tracker_v1']};
export const NAMESPACE_MODULE={training:'training',training_online:'training_online',tob_menus_catalog:'training_online',options:'options',patrimonio:'patrimonio',facturas:'facturas',__dashboard_config:'admin',funding:'funding'};
export const FILE_NAMESPACE={'full_training.html':'training','consulta.html':'training_online','options.html':'options','patrimonio.html':'patrimonio','facturas.html':'facturas','funding.html':'funding'};
// Only this new, independent module may start without imported records.
export function emptyRecordValue(namespace){return namespace==='funding'?{funding_tracker_v1:null}:null;}
