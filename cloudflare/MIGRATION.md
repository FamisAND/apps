# Migracion con conservacion de datos

## Estado al 9 de octubre de 2026

El corte tecnico esta completado, con autorizacion del usuario para terminarlo
sin mas preguntas y forzar el cierre de Chrome si fuera necesario. Cloudflare
es el unico escritor central; GitHub appdata esta archivado y conserva su
historia privada. Ningun almacen original se ha borrado o reinicializado.

Actualizacion completa seleccionada: dataset `complete-1614c79e9164d6c2`, estado
active, 10.364 registros: seis conjuntos actualizados, 539 fotos, dashboard y
ajustes cifrados. Exportacion SHA256
`e5d6e6e70382764b04ea1da21017653b968c255373184d46fee0bcef28e2297f`.
Respaldo y clave de recuperacion privados, fuera del repositorio publicado.
539/539 fotos por ID y hash, 1.363 ingredientes y 623 recetas exactos al catalogo
local. Configuracion IA local igual a la remota. Cero solicitudes normales de
escritura al verificar el corte. RECORDS_ENABLED=true, DATA_WRITES_ENABLED=true;
AUTH_DB y DATA_DB. Version activa: 31935f52-439a-4b92-b8d3-fa3e15284350.
Los datasets anteriores se conservan; no se sustituyen ni eliminan.

El usuario pide los tres proximos pasos. Posteriormente aviso de un menu y una
medicion nuevos de un cliente en Consulta antigua / GitHub. La copia
complete-d765c29c63726711 es anterior a esos cambios: NO activarla como autoridad.
Se detuvo el corte y se genero otro respaldo. La comparacion completa verifica
85 clientes, siete mediciones de octubre y el nuevo menu; los 84 clientes previos
no han cambiado ni falta ninguno. Todos los otros bloques de negocio coinciden.
Fuente Git c583425; blob c790adbc145f339a0b985c38f159fa13f640b7d1;
SHA256 del archivo `80d620ce230952c7b1831ff615918665140fc769e593e0f0ab2a337e94d02095`.
Reconstruccion D1 exacta con cero guardados normales; clave cifrada reutilizada
desde su respaldo, sin rotar secretos ni alterar originales.
El usuario confirmo HTML y otros equipos cerrados y autorizo completar el corte.
Chrome se cerro; Windows retenia entradas de procesos con HasExited=true, lo
que producia un falso bloqueo del backup. Se corrigio la comprobacion para
considerar solo procesos vivos. Backup final COMPLETADO: 63 archivos, todos
comparados por hash. No se limpiaron localStorage ni IndexedDB.

La comparacion final de todos los valores actuales del origen GitHub, catalogo,
539 fotos y ajustes confirma igualdad con la fuente importada. file:// conserva
copias mas antiguas distintas; estan respaldadas y exportables, sin fusionarlas
ni sustituirlas. No se inspeccionaron los discos de los otros ordenadores.

Paquete final privado: ../../.full-training-backups/20261009-204525-cutover-final-0837a97d.
Contiene datos locales de Chrome, mirror e historia de appdata, ZIP remoto exacto
y bundle de codigo previo al corte. appdata verificado privado y archivado;
el blob congelado sigue siendo c790adbc145f339a0b985c38f159fa13f640b7d1.
Los seis HTML antiguos cargan cutover.js antes del arranque: bloquea escrituras,
preserva valores, permite exportar y enlaza al modulo equivalente privado.
Una copia de HTML anterior aun cacheada no puede escribir en appdata archivado.

Activacion D1 condicionada al hash, codec, 10.364 registros/versiones iniciales,
cero escrituras normales y ausencia de otro dataset activo. Solo cambio su
estado, no su contenido. La exportacion POSTERIOR al despliegue reconstruida
en RAM coincide completamente con la fuente y sus hashes. Copia de negocio,
acceso, informe y clave de recuperacion en
../../.full-training-backups/20261009-active-cutover-verified.

El login real del administrador fue comprobado anteriormente por el usuario.
No se ha repetido el uso interactivo autentificado de sus modulos despues del
corte: Chrome esta cerrado y no disponible. Tampoco se certifican dos equipos
fisicos ni formularios no cubiertos por las pruebas. No se simulo identidad ni
se debilito Access para suplir esa limitacion.

Respaldo actualizado, privado, fuera del repositorio publicado:
`../../.full-training-backups/20261008-141123-pre-cloudflare-2658b99d/`.
Incluye mirror, bundle de historia y ZIP cuyo data.json coincide con el blob
Git `1ea7f234aca924e745811b3e8196b6932745d797`. No cubre cambios posteriores
ni cambios locales no sincronizados de otros ordenadores.

Revalidacion anterior del 2026-10-09 (conservada, previa al nuevo cliente): mirror y snapshot en
`../../.full-training-backups/20261009-cutover-source-review-65d01a7c/`.
SHA256 del snapshot nuevo: `2959a41988a19ba4ec4fe72f92fcc11f7b927b5f73d01dc6bde210bf4a3a6f0c`.
Los bytes/formato difieren del respaldo importado, pero la comparacion completa
de todos los bloques JSON no encuentra cambios de contenido. Los seis conjuntos
de negocio coinciden y hay seis mediciones de octubre. Las dos no recuperadas
por PDF siguen pendientes de introducir por el usuario; no se han inventado.
Esto no verifica pendientes locales ni fotos de otros ordenadores.

Ensayo local: 9.820 registros, seis conjuntos compartidos. Reconstruccion igual
campo a campo al original, sin cambiar IDs, tipos, orden, menus, mediciones,
rutinas ni configuraciones de negocio. Los formatos originales siguen siendo
el contrato de los HTML; el codec es solo una representacion interna nueva.
Los resultados y el bundle del ensayo son PRIVADOS, nunca assets del Worker.

Base creada: `full-training-data`, ID `bf9b6cd9-ed4c-484a-bc79-03fe9c396857`,
jurisdiccion EU. Importacion y exportacion verificada: 9.820 registros,
9.820 versiones iniciales y CERO solicitudes normales de escritura.
Dataset anterior `rehearsal-b49b1b75c2a67350`, staging, conservado y no seleccionado.
Configuracion CLI separada: `wrangler.data-validation.jsonc`; no publica assets.
Informe privado: `d1-preflight-final/remote-verification.private.json` dentro
del respaldo citado. Reconstruccion completa y hashes coinciden en seis conjuntos.

## Inventario de almacenamiento y dependencias

| Sistema y clave/ID | Contenido y consumidores | Local/compartido | Riesgo y conservacion |
| --- | --- | --- | --- |
| GitHub privado FamisAND/appdata, main, data.json | Archivo de todos los conjuntos y configuraciones del sistema anterior | Compartido, archivado tras el corte | Historia, ZIP exacto y hashes conservados. Archivar bloquea snapshots antiguos. Desarchivar requiere pausa y reconciliacion; no sustituir el archivo entero tras nuevos cambios. |
| localStorage ft_v4; ft_theme; ft_lang | Gestion Full Training: clientes, servicios, remesas, gastos y preferencias | Perfil/origen local; ft_v4 sincronizado en training | IDs y entradas referenciados por remesas. Importar sin reasignar ni normalizar; exportar pendientes antes del corte. |
| localStorage tob_online_v2 | Consulta: clientes, anamnesis, mediciones, planes, asignaciones y menus por cliente | Perfil/origen local; compartido mediante training_online | Critico. Respaldar cada perfil y comparar con remoto. No decidir por fecha global ni cargar encima de pendientes. |
| localStorage tob_online_v1; tob_online_v2_before_import | Datos legacy y copia previa a importaciones de Consulta | Local; puede contener informacion unica | No retirar ni migrar automaticamente. Inventariar contenido antes de decidir su destino. |
| localStorage tob_menus; tob_menus_sync_dirty | Catalogo legacy y aviso de cambios pendientes | Local | La marca dirty no demuestra que el remoto este actualizado. Comparacion por ID, nunca ganador por timestamp. |
| IndexedDB tob_recetas_imgdb v2, store kv | Catalogo activo de ingredientes, recetas y menus base; consulta.js | Local con sincronizacion al conjunto tob_menus_catalog | Puede contener cambios que GitHub no tiene. Exportacion logica y comparacion completa antes del traslado. |
| IndexedDB tob_recetas_imgdb v2, store fotos, key recetaId | Fotos de recetas con _fotoLocal | Solo local | GitHub no contiene necesariamente la foto. Backup de cada imagen con hash y mismo recetaId; probar lectura desde nuevo origen. No marcar como migrado solo por importar recetas. |
| IndexedDB consulta-safety-v1 | Copias de rutinas/importaciones, biio-support.js | Local | Conservar almacen y versiones. No mezclarlas automaticamente con datos activos. |
| IndexedDB full-training-sync-safety-v1, records | Snapshots, bases de comparacion, archivo ot_images y __gh_sync_lastgood | Local por origen, snapshots etiquetados por scope | Conservar sin poda automatica. Algunas versiones pueden ser unicas; exportar y mantener el origen anterior. |
| IndexedDB full-training-record-checkpoints-v1, entries y heads | Copias verificadas, borradores, pendientes, confirmaciones y resoluciones para RecordClient/RecordBridge | Nuevo origen y usuario; guardado central activo | Almacen independiente. Head con comparacion atomica; copia verificada tras commit y reintento con mismo requestId. Cuota/hash bloquean guardado. Copias identicas deduplicadas. Archivado MANUAL solo tras verificar archivo y confirmacion, protegiendo heads/bases/pendientes, con recuperacion sin mover el head. Nunca limpia almacenes antiguos. |
| localStorage pat_v5; pat_dismissed | Patrimonio, carteras, gastos, historial y avisos | Local; conjunto patrimonio compartido | Mantener claves, configuracion de empresa y cartera, importes y formulas existentes. Probar resultados, no solo recuentos. |
| localStorage ot_hist; ot_snaps; ot_activas; ot_cfg | Opciones: historial, cuenta, operaciones y reglas | Local; conjunto options compartido | Mantener IDs y unidades de primas/riesgos. Migracion no cambia reglas, DTE ni calculos. |
| localStorage fac_v1 | Facturas, numeracion, datos fiscales | Local; conjunto facturas compartido | Igualdad completa e IDs originales; no recalcular ni regenerar numeros en la importacion. |
| __security en data.json | Hashes de PINs legacy | Compartido | Preservar en backup; no convertirlos en usuarios ni publicar hashes en nueva API. |
| __gh_sync_token; __gh_sync_repo; __gh_sync_branch; cache SHA y sessionStorage __gh_synced_* | Acceso/configuracion de sincronizacion antigua | Local | No copiados al frontend nuevo ni revocados globalmente. appdata archivado bloquea escritura a ese repositorio sin afectar otros usos del token. |
| __ia; __ia_config; tob_ai_cfg; __fin; __notif | Claves de proveedores, configuracion IA/financiera y notificaciones legacy | Mezcla de local y compartido | No importarlas a la API general de datos. Preservarlas en backup privado; trasladar secretos a servidor y probar intermediarios antes del corte. No borrarlas. |
| IndexedDB/Cache Storage y service worker del origen anterior | Recursos offline y posibles caches de codigo | Local/origen | Mantener datos. Verificar que ningun codigo viejo pueda escribir tras el corte; no usar limpiar almacenamiento como procedimiento. |
| D1 full-training-auth, id 4aaab3a9-c02e-4818-9223-3ed9d8d3b442 | users, sessions, audit | Cloudflare compartido | Usuarios de acceso nuevos no reemplazan IDs de clientes o perfiles. Sesiones HttpOnly, revocacion y permisos por modulo. |
| D1 full-training-data, id bf9b6cd9-ed4c-484a-bc79-03fe9c396857, DATA_DB | datasets, records, record_versions, write_requests | Cloudflare compartido; dataset completo active como unica autoridad | Datasets anteriores conservados. Exportacion activa comprobada en RAM. Guardado por version, recibos idempotentes e historial. Backup y clave privados; pausar y reconciliar antes de cualquier rollback. |
| D1 records, namespaces recipe_photo_ + SHA256 del tipo/ID de receta | Fotos bajo demanda; media-client.mjs y consulta.js | Cloudflare privado, permisos de Consulta | ID original y hash binario dentro del payload. Cada foto tiene versiones y checkpoints al editar; no se descarga todo el catalogo de imagenes. Quitar referencia no destruye la foto. Original IndexedDB y ZIP conservados. |
| D1 private_settings/root y secret SETTINGS_ENCRYPTION_KEY | Ajustes legacy conservados cifrados; proxy IA y configuracion administrativa | Cloudflare servidor; nunca API general | AES-GCM vinculado al dataset. Perder la clave impediria abrir ajustes; clave respaldada en archivo privado junto a exportacion, originales preservados. API devuelve solo metadatos de IA, CAS para cambios; secretos no van al navegador. |

Este inventario combina lectores del codigo actual y respaldos inspeccionados.
No certifica el contenido local del ordenador del socio o del trabajo. El
usuario confirmo que no estaban editando. Si aparecen copias unicas, exportarlas,
detener su importacion y conservar ambas versiones; nunca cargar un snapshot
antiguo completo sobre la nueva autoridad.

## Garantias del protocolo construido

- Cada registro usa una version esperada: el servidor rechaza una edicion antigua.
- Un guardado completo es transaccional. Si un registro entra en conflicto,
  no queda guardada una parte del menu o de la medicion.
- Reintentos con el mismo ID/contenido devuelven el recibo anterior, sin duplicar.
- El recibo se verifica antes de confirmar exito. Si falla la copia local,
  no se transmite; si falla despues del guardado central, se mantiene pendiente.
- Checkpoints IndexedDB de solo adicion y aislamiento por usuario. La copia
  pendiente conserva su base y requestId; tras reabrir se recupera y reintenta
  sin duplicar. Una pestana antigua no puede sustituir el head de otra.
- Antes de recuperar o reenviar un pendiente se recalculan las operaciones
  desde su base y borrador. Deben coincidir exactamente, incluidas las versiones;
  un pendiente incoherente se conserva y no se transmite ni sustituye la base.
- Historial inmutable con autor, fecha, version y contenido. Retirada recuperable
  mediante tombstone, nunca DELETE fisico desde la API.
- Cargas paginadas con generation: rechazan una copia mezclada durante cambios.
- Cambio de dataset rechaza clientes antiguos antes de escribir sobre otra copia.
- RECORDS_ENABLED deshabilita /api/data legacy, lectura y escritura de archivos completos.
- Solicitudes normales limitadas a 300 cambios atomicos, parametros SQL agrupados
  por nueve filas y cuerpo limitado. Importaciones mayores requieren staging.
- Registros pequenos, payload checksummed y campos grandes fragmentados sin
  recortar contenido. El navegador reconstruye; Worker no parsea 10 MB en cada guardado.

## Orden del traslado y condiciones de parada

1. Terminar ensayo local y guardar codigo probado. COMPLETADO para los seis conjuntos
   del respaldo citado; no equivale a validacion integral de todos los HTML.
2. Vincular Access solo al admin inicialmente; obtener POLICY_AUD real. Verificar
   identidad firmada y denegacion sin sesion, sin abrir un acceso publico temporal.
   Usuario activo Access All traffic con Solo Sergio y ocho horas. Verificada
   redireccion externa al login. AUD efectivo del nuevo Worker comprobado con
   metadatos publicos firmados, dominio de equipo fijado y hostname exacto.
   Alineado en version cc81b9fc-6cac-4a81-ad1b-c81e8ac718c7. Revision del
   2026-10-09 desplegada en 4b4edb0e-ca85-4fdf-b73c-64a8624110ee: rutas HTML
   literales, cookie compatible con regreso de Access y cierre del bucle de
   inicio de sesion. Solo AUTH_DB; ambos indicadores de datos siguen false.
   Version final f4fb2e2a-7cfa-4ed6-a1f2-b9010bba38c7 con mensajes de sesion
   diferenciados y permisos visuales del administrador corregidos.
   Entrada autentificada al panel del administrador comprobada el 2026-10-09
   por captura del usuario: Sergio, Administrador, Activo y listado de sesiones.
   El login del administrador ya esta comprobado. No se simula identidad en
   produccion; queda pendiente el uso interactivo autentificado tras el corte.
3. Completar adaptadores de almacenamiento/guardado de los HTML, checkpoints
   duraderos verificados, cola de pendientes recuperable y avisos de estado.
   IMPLEMENTADO y ensayado localmente para las seis secciones de negocio.
   Un cargador verifica sesion y datos antes de ejecutar los HTML existentes.
   La fachada de compatibilidad sirve sus claves en memoria, conservando las
   claves antiguas fisicas. Las escrituras crean primero checkpoints nuevos
   duraderos y solo despues cambios por registro en D1. Catalogo adaptado.
   Hay estado confirmado/pendiente/error, exportacion, reintento y comparacion
   con seleccion explicita de central que conserva la version rechazada.
   Incluye fotos bajo demanda, ajustes privados cifrados y proxy IA, ademas de
   dashboard. Activado tras las verificaciones; no equivale a validar todos los formularios.
4. Exportar datos locales, catalogos y fotos. COMPLETADO para este equipo.
   file:// conservado por separado. Otros equipos no inspeccionados; no importar
   sus datos automaticamente. DETENERSE ante registros unicos sin decidir.
5. Consentimiento concreto para copiar datos personales, mediciones y finanzas a
   D1 privada nueva y archivos de imagen al almacenamiento elegido, conservando originales.
   COMPLETADO para los seis conjuntos; el paso completo solicitado incluye
   conservacion de fotos y ajustes. Los originales siguen intactos.
6. Importar copia a staging; no editar ni activar. Volver a leer desde Cloudflare,
   comparar cada registro/hash y reconstruir contra el respaldo exacto.
   COMPLETADO: exportacion SQL oficial reconstruida en memoria y comparada completa.
7. Ensayar los HTML desde origen nuevo, dos sesiones y desconexion/cuota.
   COMPLETADO en fixtures aisladas y protocolo D1 real con datos sinteticos.
   Pendiente cobertura integral de formularios, uso interactivo autentificado
   y medida de CPU/latencia bajo carga del plan gratuito.
8. Pausa acordada de edicion, backup final de todos los pendientes, comprobar que
   el remoto no cambio desde el import y actualizar staging si hace falta.
   COMPLETADO: fuente final y valores locales actuales exactos.
9. Confirmacion explicita para cortar. Retirar capacidad de escritura del token
   antiguo y revisar origen publico; cerrar pestanas no basta para impedir que
   un cliente antiguo vuelva a subir datos. No borrar historia ni repositorios.
   COMPLETADO con autorizacion final: appdata archivado, privado e intacto.
10. Activar un unico origen y DATA_DB como unica autoridad. Prueba de guardado,
    cierre y apertura; observacion y backups verificados. D1 activada y respaldo
    posterior exacto. Guardado/reapertura probados en navegadores aislados;
    comprobacion en los dos ordenadores fisicos pendiente.

IA y fotos ya preparadas y ensayadas; no hay proveedores financieros configurados.
Las copias finales y el aislamiento de escritores estan completados. No probar
la migracion escribiendo sobre clientes reales activos.

## Ensayo de concurrencia sin tocar produccion

En las pruebas del 2026-10-08/09 pasaron 76 tests Node, 16 comprobaciones de checkpoints en un
navegador aislado y 23 tests de regresion de las protecciones GitHub/Consulta/Full Training.
Incluyen borrador recuperable, copia sin cambios, resolucion explicita sin subida,
exportacion forense y de memoria cuando falla el archivo local, y avisos que no
presentan como confirmado un borrador o un fallo.

`scripts/check-record-html.cjs` ensaya los HTML reales con la copia del respaldo
importada solo a SQLite en RAM, sesion ficticia y navegador aislado. Pasaron:

- Arranque de Full Training, Consulta, Patrimonio, Opciones y Facturas, con las
  seis secciones y dashboard verificados, cero errores JS y cero escrituras en solo lectura.
- Cero peticiones a GitHub desde esos HTML en modo por registros.
- Edicion de una medicion en Consulta y confirmacion central de la fixture.
- Cierre y reapertura con el mismo valor confirmado.
- Desconexion durante el siguiente guardado, conservacion del pendiente,
  cierre, reapertura y recuperacion con el mismo requestId sin duplicados.
- Capturas privadas de escritorio y movil, fuera del repositorio publicado.
- SHA256 original intacto, cero escrituras a Cloudflare o GitHub.

Ensayo repetido con la fuente actualizada y 10.364 registros: los cinco HTML
arrancan en solo lectura sin escrituras ni errores JS. Consulta conserva su
objeto completo campo a campo, incluido el nuevo menu y medicion. Guardado,
reapertura y pendiente offline probados solo contra la base en RAM.

Se probaron tambien los seis HTML legacy: valores locales intactos, escrituras
y sincronizacion bloqueadas, exportacion exacta y capturas desktop/movil.

`scripts/check-remote-protocol.mjs` uso el proxy oficial de Wrangler con DATA_DB
real y un dataset nuevo exclusivamente sintetico. Verifico dos cambios
independientes, rechazo atomico de un lote antiguo y reintento con recibo tras
perder una respuesta. Sus 17 checkpoints pasaron y el dataset quedo retirado.
No se uso una identidad Access ficticia en produccion ni se modificaron clientes.
Las cuatro rutas desplegadas comprobadas sin sesion redirigen al login Access.

El ensayo no certifica fotos locales de otros perfiles, todos los formularios,
intermediarios de IA, limites de CPU reales de Workers ni el login del usuario.

`scripts/check-snapshot-concurrency.mjs` lee el respaldo privado y su bundle,
verifica hashes y crea exclusivamente una SQLite `:memory:`. No llama a redes,
no abre Chrome del usuario y no escribe archivos de datos. El estado active de
esa fixture solo existe en RAM. En el corte, el dataset completo Cloudflare
esta active y su exportacion tenia cero solicitudes normales de escritura.

Resultado con los 9.820 registros del respaldo verificado:

- Igualdad completa al reconstruir los seis conjuntos.
- Dos sesiones cambian registros distintos y ambos cambios permanecen.
- La segunda edicion del mismo registro se rechaza entera con 409.
- El borrador rechazado permanece en memoria y en el checkpoint del ensayo.
- Cero cambios en registros ajenos; aislamiento entre los seis modulos.
- SHA256 del archivo original igual antes y despues; cero escrituras reales.

El ensayo modifica campos numericos solo dentro de la fixture y evita campos ID.
No valida todavia formularios, calculos de negocio, fotos ni el comportamiento
integral de los HTML. No sustituye el backup final ni la prueba de login real.

## Copias y rollback

El historial por registro no sustituye backups. D1 Free ofrece actualmente
7 dias de Time Travel; no basta para una perdida descubierta semanas despues.
Existe exportacion privada independiente al corte, reconstruida y verificada
en RAM junto con el hash y todos los datos. No se ha importado otra copia remota
completa: los indices/triggers consumen cuota de filas escritas, y la carga del
dia ya incluye las copias de migracion. No confundir la prueba RAM con un ensayo
de restauracion en otra D1 remota. No hay calendario automatico ni politica de
borrado de backups. Las copias futuras requieren exportacion y comprobacion.

Despues del corte: suspender escrituras, exportar cambios nuevos y reconciliar;
no reactivar ciegamente el JSON viejo. Recuperar registros como nuevas versiones
contra su version actual, conservando las modificaciones posteriores.

Referencias oficiales comprobadas:
- https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/workers/platform/limits/
