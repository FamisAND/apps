# Correccion de la carga del dashboard

Estado: publicada en Cloudflare el 10 de octubre de 2026, version
`9d58cb7d-07a2-43cd-b179-d0668b9d1e61`. Despliegue confirmado por Wrangler;
bindings y variables de acceso comprobados posteriormente en la version remota.

## Fallo identificado

El inicio de `index.js` esperaba la sesion y llamaba siempre a `goLoading()`.
En modo Cloudflare, el cargador ya habia descargado y verificado los datos.
`goLoading()` llamaba a `GitHubSync.pullAndApplyAll()`, cuya implementacion en
modo records recarga la pagina. La siguiente apertura repetia el mismo camino.
Esto puede mostrar la pantalla de carga una y otra vez sin abrir el panel.

El cambio abre directamente `goMenu()` despues de verificar la sesion en modo
records. El inicio legacy conserva su comportamiento anterior.

## Cambios Preparados

- El dashboard omite el catalogo de recetas y la configuracion de IA que no usa.
  Los modulos siguen cargandolos con sus permisos anteriores.
- El cargador indica modulo, pagina y cantidad de registros verificados.
- Las peticiones de registros y del HTML tienen un plazo de 30 segundos,
  incluida la lectura de su respuesta. Un timeout no confirma un guardado.
- Los guardados con respuesta perdida conservan su peticion pendiente y
  reintentan con el mismo ID, sin duplicar el cambio.
- Los hashes se comprueban en grupos de 32; ningun dato se entrega sin verificar
  todos los registros y conservar la copia local requerida.
- Un fallo al importar archivos de la aplicacion muestra un aviso y Reintentar.
- Si una operacion local tarda, se indica la fase. No se cancela ni limpia
  automaticamente IndexedDB para intentar desbloquearla.

No cambian IDs, claves, formatos, permisos, perfiles ni rutas de datos.
No se han ejecutado cambios sobre datos de produccion ni sobre los respaldos.

## Comprobaciones

- 87 pruebas Node: todas correctas, incluidas las nuevas pruebas del inicio,
  timeout, preservacion de pendientes e idempotencia.
- Assets generados con la lista permitida: correcto.
- Prueba visual sintetica: correcta, con 6.041 registros ficticios. La portada
  y index.html permanecen abiertos, sin bucle; fallos de archivos y registros
  muestran Reintentar. Cero guardados o accesos externos de datos; las dos
  solicitudes de fuentes Google tambien quedaron bloqueadas.
- Prueba visual con el respaldo real, leido con autorizacion en un entorno
  aislado: correctos `/`, index.html y los cinco modulos. Cero errores JS.
  Mediciones y menus importados exactos; imagen comprobada con pixeles no vacios.
  Guardado, reapertura y recuperacion de un pendiente correctos contra una base
  en memoria. Cero guardados de produccion o modificaciones al respaldo original.
- Capturas revisadas de escritorio y movil. Archivos privados de prueba fuera
  del repositorio publicado; resultados sinteticos bajo test-output ignorado.
- Simulacion de despliegue correcta: 40 archivos permitidos, sin datos privados.

La prueba sintetica comprueba `/` y `/index.html`, permanencia del panel,
ausencia de recargas, preservacion del localStorage anterior y fallos de
descarga de modulos/registros. No accede a produccion ni permite conexiones
externas. La comprobacion anterior de HTMLs tambien incluye ahora ambas rutas.

## Verificacion Remota

La version nueva conserva AUTH_DB, DATA_DB, ACTIVE_DATASET_ID, TEAM_DOMAIN,
POLICY_AUD y SETTINGS_ENCRYPTION_KEY. Se publico con --keep-vars, sin cambios
a bases, secretos o politicas. No se ejecuto ninguna migracion de almacenamiento.

Las consultas de solo lectura antes y despues coinciden: 10.364 registros,
version 1 en todos los registros y cero recibos de guardados normales. Incluyen
1.976 registros de Consulta y 539 fotos. Cero filas escritas en las comprobaciones.

El bloqueo de revision de permisos de la sesion anterior ya no se reprodujo:
las pruebas y las operaciones remotas se ejecutaron mediante aprobacion normal.

Limite pendiente: la comprobacion interactiva autenticada en produccion.
Chrome llega a Cloudflare Access, pero no tiene una sesion verificada de Sergio;
no se ha sorteado la identificacion ni accedido a cookies o credenciales.
El control del navegador agoto su espera al intentar seguir la identificacion.
Se deja la pestana preparada para que el usuario complete su acceso habitual.
Las pruebas aisladas no se presentan como una prueba real de su sesion.

## Recuperacion

La version previa `31935f52-439a-4b92-b8d3-fa3e15284350` sigue en el historial
de despliegues para una eventual recuperacion de codigo. No se necesita ni debe
restaurarse un snapshot antiguo de pacientes para revertir este cambio de codigo.

Si el fallo persiste despues de publicarla, usar la nueva fase visible para
diagnosticarlo. No borrar cookies, localStorage ni IndexedDB como solucion
automatica. Conservar borradores antes de cualquier reintento o recuperacion.
