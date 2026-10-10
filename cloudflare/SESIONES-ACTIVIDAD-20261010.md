# Sesiones, actividad y carga verificada

## Preservacion y compatibilidad

- Autorizado por Sergio el 10/10/2026 al aceptar estas mejoras.
- Respaldo privado previo: `.full-training-backups/20261010-session-audit-before`.
- Ambos SQL restaurados en SQLite en memoria: `integrity_check=ok`.
- Datos SHA256: `e5d6e6e70382764b04ea1da21017653b968c255373184d46fee0bcef28e2297f`.
- Sesiones SHA256: `eab1f341af5deb14ffe4425193565f0ac7d3e0c3f4ce958ebfcd48b52f4a004d`.
- No se cambian claves, perfiles, IDs, registros existentes ni el esquema de IndexedDB.
- Migraciones aditivas: `session_policy` en AUTH_DB y `session_commits` en DATA_DB.
- Cada vinculo de actividad se inserta en la MISMA transaccion que su guardado.
- Los reintentos conservan la atribucion original; un conflicto no registra un cambio.
- Sesiones anteriores a esta version no tienen atribucion retrospectiva inventada.
- Se muestran diez sesiones; no se borra el historial anterior.

## Activacion y rollback

1. Restaurar copias en memoria, aplicar migraciones y verificar tablas anteriores intactas.
2. Ejecutar pruebas de permisos, concurrencia, reintentos, cache e inactividad.
3. Aplicar SOLO las migraciones nuevas en sus bases correspondientes.
4. Publicar el Worker y verificar endpoints protegidos y datos sin cambios.
5. Si falla: volver a la version Worker `9d58cb7d-07a2-43cd-b179-d0668b9d1e61`.
   Las tablas nuevas se conservan; no ejecutar DROP, DELETE ni importar sobre produccion.
   La version anterior ignora ambas tablas y usa intactos los mismos registros.

## Comportamiento

- Inactividad predeterminada: 30 minutos; duracion maxima: 8 horas.
- Administracion puede cambiar ambos limites. No se alarga una sesion ya emitida
  mas alla de su caducidad original o la identidad de Cloudflare Access.
- El heartbeat comprueba permisos y caducidad, pero NO renueva la actividad.
- Solo interacciones del usuario renuevan actividad, con solicitudes limitadas.
- Aviso dos minutos antes; al caducar se bloquea la interfaz y se conservan
  pendientes/copias. Los formularios no guardados siguen disponibles para exportar.
- La cache solo se reutiliza si identidad y dataset coinciden, una lectura estable
  confirma que ese modulo no cambio desde la generacion base y la copia local
  supera las verificaciones existentes. Si no, descarga completa.
- El catalogo y la configuracion de Consulta solo se cargan en Consulta.
- La auditoria muestra tipo de cambio, entidad y campos, no claves de IA ni contenido
  completo de historias clinicas. Solo administracion puede consultarla.

## Comprobaciones

- 96 pruebas automatizadas correctas, incluidos permisos, inactividad, duracion
  maxima, atribucion atomica, reintento desde otra sesion y cache antigua/corrupta.
- Navegador aislado: 10 sesiones, detalle de medicion/menu, limites editables,
  aviso de caducidad, bloqueo y continuidad tras interaccion; escritorio y movil.
- Navegador con respaldo real: siete entradas, sin errores JavaScript,
  mismos clientes/mediciones/menus, fotos no vacias, guardado en memoria,
  reapertura y recuperacion offline. Cero escrituras de produccion o del respaldo.
- Reapertura sin cambios: seis consultas de estado, sin descargar otra vez
  las paginas de registros ni crear copias locales duplicadas.
- La primera lectura remota fallo temporalmente con 7403. Se comprobaron los
  permisos existentes (sin ampliarlos) y el reintento de lectura fue correcto.

## Publicacion verificada

- Migraciones nuevas aplicadas el 10/10/2026, antes de publicar el codigo.
- Version publicada: `c8534a8c-989e-49e3-a74d-a8a94422e3b3`.
- Los 10364 registros activos conservan sus recuentos y version 1; los cinco
  write_requests previos, pertenecientes a conjuntos anteriores, siguen intactos.
- Usuario existente conservado; politica confirmada en D1: 30 minutos / 8 horas.
- 42 archivos estaticos permitidos, sin respaldos, documentos ni secretos.
- Comprobacion remota sin credenciales: inicio, Consulta, administracion, sesiones,
  estado de registros y CSS redirigen a Cloudflare Access (HTTP 302).
- Las pruebas autenticadas de interfaz se realizaron en un navegador aislado;
  la conexion a Chrome mediante la herramienta de escritorio no estuvo disponible
  para una comprobacion autenticada en produccion.
- Estas dos migraciones se ejecutaron con archivos explicitos, no mediante el
  registro automatico de Wrangler. Antes de futuras migraciones, comprobar el
  esquema real y el historial de aplicacion; no volver a ejecutar 0001 ni 0002.
- Para pestanas ya abiertas: conservar formularios pendientes y recargar una vez
  para utilizar el nuevo seguimiento de actividad.
