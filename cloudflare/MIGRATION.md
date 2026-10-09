# Migracion con conservacion de datos

## Estado al 9 de octubre de 2026

NO se ha cambiado el origen de trabajo, activado escrituras centrales ni
eliminado almacenamiento anterior. El usuario autorizo crear una D1 privada
nueva y copiar el respaldo solo para validacion, sin habilitar edicion.
La copia real ya esta importada en staging y verificada mediante exportacion
completa. El corte de sistema sigue requiriendo copias finales y confirmacion.

Respaldo actualizado, privado, fuera del repositorio publicado:
`../../.full-training-backups/20261008-141123-pre-cloudflare-2658b99d/`.
Incluye mirror, bundle de historia y ZIP cuyo data.json coincide con el blob
Git `1ea7f234aca924e745811b3e8196b6932745d797`. No cubre cambios posteriores
ni cambios locales no sincronizados de otros ordenadores.

Revalidacion del 2026-10-09: mirror y snapshot privados nuevos en
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
Dataset `rehearsal-b49b1b75c2a67350`, estado staging, sin binding en el Worker.
Configuracion CLI separada: `wrangler.data-validation.jsonc`; no publica assets.
Informe privado: `d1-preflight-final/remote-verification.private.json` dentro
del respaldo citado. Reconstruccion completa y hashes coinciden en seis conjuntos.

## Inventario de almacenamiento y dependencias

| Sistema y clave/ID | Contenido y consumidores | Local/compartido | Riesgo y conservacion |
| --- | --- | --- | --- |
| GitHub privado FamisAND/appdata, main, data.json | Todos los conjuntos compartidos y configuraciones, leidos por github-sync.js y cada HTML | Compartido entre usuarios/ordenadores | Un snapshot viejo puede tapar otro. Conservar historia, ZIP exacto y hashes; no sustituir el archivo entero tras nuevos cambios. |
| localStorage ft_v4; ft_theme; ft_lang | Gestion Full Training: clientes, servicios, remesas, gastos y preferencias | Perfil/origen local; ft_v4 sincronizado en training | IDs y entradas referenciados por remesas. Importar sin reasignar ni normalizar; exportar pendientes antes del corte. |
| localStorage tob_online_v2 | Consulta: clientes, anamnesis, mediciones, planes, asignaciones y menus por cliente | Perfil/origen local; compartido mediante training_online | Critico. Respaldar cada perfil y comparar con remoto. No decidir por fecha global ni cargar encima de pendientes. |
| localStorage tob_online_v1; tob_online_v2_before_import | Datos legacy y copia previa a importaciones de Consulta | Local; puede contener informacion unica | No retirar ni migrar automaticamente. Inventariar contenido antes de decidir su destino. |
| localStorage tob_menus; tob_menus_sync_dirty | Catalogo legacy y aviso de cambios pendientes | Local | La marca dirty no demuestra que el remoto este actualizado. Comparacion por ID, nunca ganador por timestamp. |
| IndexedDB tob_recetas_imgdb v2, store kv | Catalogo activo de ingredientes, recetas y menus base; consulta.js | Local con sincronizacion al conjunto tob_menus_catalog | Puede contener cambios que GitHub no tiene. Exportacion logica y comparacion completa antes del traslado. |
| IndexedDB tob_recetas_imgdb v2, store fotos, key recetaId | Fotos de recetas con _fotoLocal | Solo local | GitHub no contiene necesariamente la foto. Backup de cada imagen con hash y mismo recetaId; probar lectura desde nuevo origen. No marcar como migrado solo por importar recetas. |
| IndexedDB consulta-safety-v1 | Copias de rutinas/importaciones, biio-support.js | Local | Conservar almacen y versiones. No mezclarlas automaticamente con datos activos. |
| IndexedDB full-training-sync-safety-v1, records | Snapshots, bases de comparacion, archivo ot_images y __gh_sync_lastgood | Local por origen, snapshots etiquetados por scope | Conservar sin poda automatica. Algunas versiones pueden ser unicas; exportar y mantener el origen anterior. |
| IndexedDB full-training-record-checkpoints-v1, entries y heads | Copias verificadas, borradores, pendientes, confirmaciones y resoluciones explicitas para RecordClient/RecordBridge | Nuevo origen y usuario de sesion; adaptador de HTML implementado, NO activo en produccion | Almacen nuevo independiente. entries solo se anaden; head se cambia con comparacion atomica. Verificar tras commit, exportar por usuario, recuperar el mismo requestId tras cierre. Un fallo de cuota o hash bloquea el guardado. Las cargas identicas se deduplican; no hay limpieza de historiales. No lee ni limpia los almacenes anteriores. |
| localStorage pat_v5; pat_dismissed | Patrimonio, carteras, gastos, historial y avisos | Local; conjunto patrimonio compartido | Mantener claves, configuracion de empresa y cartera, importes y formulas existentes. Probar resultados, no solo recuentos. |
| localStorage ot_hist; ot_snaps; ot_activas; ot_cfg | Opciones: historial, cuenta, operaciones y reglas | Local; conjunto options compartido | Mantener IDs y unidades de primas/riesgos. Migracion no cambia reglas, DTE ni calculos. |
| localStorage fac_v1 | Facturas, numeracion, datos fiscales | Local; conjunto facturas compartido | Igualdad completa e IDs originales; no recalcular ni regenerar numeros en la importacion. |
| __security en data.json | Hashes de PINs legacy | Compartido | Preservar en backup; no convertirlos en usuarios ni publicar hashes en nueva API. |
| __gh_sync_token; __gh_sync_repo; __gh_sync_branch; cache SHA y sessionStorage __gh_synced_* | Acceso/configuracion de sincronizacion antigua | Local | No copiar token al frontend nuevo. Mantener hasta corte controlado; despues retirar permiso de escritura legacy con confirmacion del usuario. |
| __ia; __ia_config; tob_ai_cfg; __fin; __notif | Claves de proveedores, configuracion IA/financiera y notificaciones legacy | Mezcla de local y compartido | No importarlas a la API general de datos. Preservarlas en backup privado; trasladar secretos a servidor y probar intermediarios antes del corte. No borrarlas. |
| IndexedDB/Cache Storage y service worker del origen anterior | Recursos offline y posibles caches de codigo | Local/origen | Mantener datos. Verificar que ningun codigo viejo pueda escribir tras el corte; no usar limpiar almacenamiento como procedimiento. |
| D1 full-training-auth, id 4aaab3a9-c02e-4818-9223-3ed9d8d3b442 | users, sessions, audit | Cloudflare compartido | Usuarios de acceso nuevos no reemplazan IDs de clientes o perfiles. Sesiones HttpOnly, revocacion y permisos por modulo. |
| D1 full-training-data, id bf9b6cd9-ed4c-484a-bc79-03fe9c396857, futuro DATA_DB | datasets, records, record_versions, write_requests | Cloudflare compartido, copia staging aislada | Copia real verificada, aun no vinculada al Worker. Requiere validacion de HTML antes de verified/active. Base de sesiones separada. |

Este inventario combina lectores del codigo actual y respaldos inspeccionados.
No certifica el contenido local del ordenador del socio o del trabajo: hay que
inventariarlos/exportarlos antes del corte. Ante diferencias sin origen claro,
detenerse y conservar ambas versiones.

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
   El usuario no dispone del ordenador y permite avanzar suponiendo ese rol.
   Esto NO verifica el login, NO simula identidad en produccion y NO autoriza
   activar escrituras ni sustituir el sistema actual.
3. Completar adaptadores de almacenamiento/guardado de los HTML, checkpoints
   duraderos verificados, cola de pendientes recuperable y avisos de estado.
   IMPLEMENTADO y ensayado localmente para las seis secciones de negocio.
   Un cargador verifica sesion y datos antes de ejecutar los HTML existentes.
   La fachada de compatibilidad sirve sus claves en memoria, conservando las
   claves antiguas fisicas. Las escrituras crean primero checkpoints nuevos
   duraderos y solo despues cambios por registro en D1. Catalogo adaptado.
   Hay estado confirmado/pendiente/error, exportacion, reintento y comparacion
   con seleccion explicita de central que conserva la version rechazada.
   No incluye todavia migracion de fotos, secretos ni configuracion del dashboard.
   No esta desplegado ni activo; no equivale a validar todos los formularios.
4. Exportar los datos locales de todos los perfiles/origenes, catalogos y fotos.
   Comparar cada diferencia. DETENERSE si hay registros unicos sin decidir.
5. Consentimiento concreto para copiar datos personales, mediciones y finanzas a
   D1 privada nueva y archivos de imagen al almacenamiento elegido, conservando originales.
   COMPLETADO para los seis conjuntos del respaldo; no incluye traslado de fotos.
6. Importar copia a staging; no editar ni activar. Volver a leer desde Cloudflare,
   comparar cada registro/hash y reconstruir contra el respaldo exacto.
   COMPLETADO: exportacion SQL oficial reconstruida en memoria y comparada completa.
7. Ensayar todos los HTML desde origen nuevo: menus, imagenes, anamnesis, rutinas,
   remesas, facturas, opciones, patrimonio y calculos. Probar dos sesiones y
   desconexion/cuota. Medir CPU/latencia/limites reales del plan gratuito.
8. Pausa acordada de edicion, backup final de todos los pendientes, comprobar que
   el remoto no cambio desde el import y actualizar staging si hace falta.
9. Confirmacion explicita para cortar. Retirar capacidad de escritura del token
   antiguo y revisar origen publico; cerrar pestanas no basta para impedir que
   un cliente antiguo vuelva a subir datos. No borrar historia ni repositorios.
10. Activar un unico origen y DATA_DB como unica autoridad. Prueba de guardado,
    cierre y apertura desde dos ordenadores; observacion y backups verificados.

No activar escrituras mientras falten intermediarios de IA/finanzas o fotos
locales. No probar la migracion escribiendo sobre clientes reales activos.

## Ensayo de concurrencia sin tocar produccion

En las pruebas del 2026-10-08/09 pasaron 63 tests Node, 12 comprobaciones de checkpoints en un
navegador aislado y 19 tests de regresion de las protecciones GitHub/Full Training.
Incluyen borrador recuperable, copia sin cambios, resolucion explicita sin subida,
exportacion forense y de memoria cuando falla el archivo local, y avisos que no
presentan como confirmado un borrador o un fallo.

`scripts/check-record-html.cjs` ensaya los HTML reales con la copia del respaldo
importada solo a SQLite en RAM, sesion ficticia y navegador aislado. Pasaron:

- Arranque de Full Training, Consulta, Patrimonio, Opciones y Facturas, con las
  seis secciones verificadas, cero errores JS y cero escrituras en solo lectura.
- Cero peticiones a GitHub desde esos HTML en modo por registros.
- Edicion de una medicion en Consulta y confirmacion central de la fixture.
- Cierre y reapertura con el mismo valor confirmado.
- Desconexion durante el siguiente guardado, conservacion del pendiente,
  cierre, reapertura y recuperacion con el mismo requestId sin duplicados.
- Capturas privadas de escritorio y movil, fuera del repositorio publicado.
- SHA256 original intacto, cero escrituras a Cloudflare o GitHub.

El ensayo no certifica fotos locales de otros perfiles, todos los formularios,
intermediarios de IA, limites de CPU reales de Workers ni el login del usuario.

`scripts/check-snapshot-concurrency.mjs` lee el respaldo privado y su bundle,
verifica hashes y crea exclusivamente una SQLite `:memory:`. No llama a redes,
no abre Chrome del usuario y no escribe archivos de datos. El estado active de
esa fixture solo existe en RAM; el dataset Cloudflare sigue staging y sin binding.

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
Programar exportaciones privadas independientes, definir retencion y probar
restauracion en otra base, sin restaurar automaticamente sobre la base activa.
No crear automaciones ni politica de borrado de backups sin aprobacion.

Antes del corte: desactivar piloto y continuar en el origen previo intacto.
Despues del corte: suspender escrituras, exportar cambios nuevos y reconciliar;
no reactivar ciegamente el JSON viejo. Recuperar registros como nuevas versiones
contra su version actual, conservando las modificaciones posteriores.

Referencias oficiales comprobadas:
- https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/workers/platform/limits/
