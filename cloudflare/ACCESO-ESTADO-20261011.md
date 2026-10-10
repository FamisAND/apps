# Acceso y estado central unico

## Cambios y preservacion

- Respaldo de los archivos anteriores verificado por hash en
  `.full-training-backups/20261011-session-indicators-before`.
- No hay migraciones ni cambios en claves, IDs, perfiles, datos centrales,
  localStorage o IndexedDB. No se limpia el almacenamiento del navegador.
- En modo records se ocultan el badge antiguo de GitHub y el SYNC OK fijo
  del inicio. La barra central conserva errores, pendientes y confirmaciones.
- Los errores previos a enviar un pendiente tambien se propagan al estado central.
- Barra compacta, con ancho limitado por el contenido y adaptacion a movil.
- El inicio identifica Cloudflare como origen y su comando de recarga se llama
  Actualizar, sin cambiar las protecciones contra recarga sobre borradores.

## Recuperacion del acceso

- Una pagina con cookie de aplicacion rechazada la caduca mediante Set-Cookie;
  no borra ninguna copia local ni crea otra sesion automaticamente.
- Se distingue la caducidad por tiempo de otros rechazos de acceso.
- El usuario puede pedir /auth/restart. Esta ruta exige identidad verificada,
  caduca solo __Host-ft_session y redirige al logout oficial de Access.
- /auth/restart no crea ni altera filas de usuarios o sesiones. Las sesiones
  caducadas/revocadas siguen sin permitir lecturas, actividad o guardados.
- Se conserva el rechazo de /auth/complete sin cookie, sin bucles automaticos.
- Referencia del logout de Access:
  https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/

## Pruebas y rollback

- 100 pruebas unitarias correctas: caducidad, cookie rechazada, reentrada,
  ausencia de cambios en sesiones al reintentar, permisos y errores centrales.
- Navegador aislado: HTTPS local y cookies Secure/HttpOnly reales; sesion
  caducada y cookie ausente vuelven a entrar sin ciclos. El logout/IdP de
  Cloudflare se simula; no se usan tokens ni cuentas reales.
- Escritorio/movil: un unico indicador, barra compacta, conflicto visible,
  administracion, aviso previo y bloqueo por inactividad.
- Siete accesos con respaldo real en memoria: sin errores JavaScript ni
  peticiones a GitHub, guardado, reapertura y recuperacion offline correctos.
- Ninguna prueba escribe en produccion ni modifica los respaldos.
- Version de rollback: c8534a8c-989e-49e3-a74d-a8a94422e3b3.
  Recuperar solo el codigo Worker; no restaurar bases ni limpiar navegadores.

## Publicacion

- Publicado el 11/10/2026: f36983ec-1803-4841-80da-1cfc4ad2a5c4.
- Se mantienen dataset, bindings, permisos, secretos y politica 30 minutos / 8 horas.
- Inicio, Consulta, administracion, /api/session y /auth/restart siguen
  redirigiendo a Cloudflare Access sin credenciales (HTTP 302).
- No se ha comprobado una reentrada con la cuenta real de Sergio en Chrome;
  las pruebas autenticadas usaron el navegador temporal e identidades ficticias.
