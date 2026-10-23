# Tracker de Fondeo

Implementacion integrada en el panel privado existente. No es un diario de trades.
La aplicacion registra eventos de evaluaciones y flujos de caja, no balances de
trading ni P&L simulado. No inserta cuentas de ejemplo automaticamente.

## Acceso

Panel principal > Tracker de Fondeo, archivo `funding.html`.
Cuatro vistas: Dashboard, Cuentas, Movimientos, Estadisticas. La primera alta
ofrece Earn2Trade / TCP25 / 19-10-2026 / 75 USD como formulario editable, sin
guardar hasta confirmar. Otras altas usan la fecha local actual.

## Archivos

- Nuevos: `funding.html`, `funding.css`, `funding.js`, `funding-model.js`.
- Graficas: `funding-chart.umd.js`, Chart.js 4.4.1, la misma version usada por
  Consulta, alojada localmente. Licencia en `funding-chart.LICENSE.txt`.
  SHA256 del JS: 74401d738dd3e03ee5dfb3b6841210fe2c4ead8a960c4011ca4ba0b78a9fd8f3.
- Registro de herramienta: `index.html`, `index.js`, `app-session.js`,
  `session-admin.js`, `cloudflare/src/policy.mjs`, `record-layout.mjs`,
  `record-loader.mjs`, `session-activity.mjs` y el conjunto local de iconos.
- Adaptacion acotada de `record-client.mjs` y `record-bridge.mjs`: inicio vacio
  EXCLUSIVAMENTE para el nuevo namespace, sin relajar la carga de los anteriores.
- Pruebas: `scripts/funding-model.test.cjs`, `cloudflare/test/funding.test.mjs`,
  `cloudflare/scripts/check-funding.cjs`; pruebas adicionales de permiso en worker.

## Almacenamiento y seguridad

- D1 actual: `full-training-data`, nuevo namespace `funding`, clave logica
  `funding_tracker_v1`. El libro tiene version, divisa base, cuentas y eventos.
- No requiere SQL, otra base, cambios de perfiles, migraciones, claves renombradas
  ni escritura en namespaces existentes. La apertura de un tracker vacio hace
  cero escrituras; el primer evento crea los registros mediante la API normal.
- Acceso independiente `funding`. Administracion tiene acceso conforme al patron
  existente; otros usuarios necesitan seleccion explicita en Usuarios y sesiones.
  No se han actualizado automaticamente los permisos guardados de ningun usuario.
- Guardado central con version esperada, recibo idempotente y recuperacion local
  en `full-training-record-checkpoints-v1`, por usuario y namespace, como el resto
  de herramientas. GitHub guarda codigo; no se reactiva el escritor antiguo.
- Si una peticion pierde su respuesta, reintentar reutiliza su ID. No inventa otro
  movimiento ni cuenta dos veces el cobro. No cerrar ante un estado pendiente.
- Validacion antes de guardar, comprobacion de coherencia de transiciones y
  relaciones, importes en centimos y conversion con precision decimal explicita.
- Anular/eliminar es retirada logica de los calculos: se conservan el registro,
  revisiones y relacion con la cuenta. Restauracion accesible en el listado.
  No se puede retirar una compra o aprobacion y dejar sucesores huerfanos.
- Aparte, existe vista local de prueba solo para `localhost` / `127.0.0.1` con
  `?preview=1`: utiliza una IndexedDB SEPARADA `full-training-funding-preview-v1`
  y un aviso permanente. No sincroniza con Cloudflare ni con los HTML antiguos.

## Definiciones economicas

- Divisa de libro USD por defecto, EUR opcional antes del primer evento. No cambia
  retrospectivamente. Cada movimiento conserva importe/divisa originales, cambio
  manual e importe convertido. Una divisa diferente exige introducir el cambio;
  no se presupone paridad USD/EUR. No hay consultas de cambio externas.
- Gastos efectivos = compras + resets + renovaciones + activaciones + otros
  gastos - reembolsos. El reembolso apunta a su gasto original, en la misma divisa,
  y no puede superar el importe original. El cambio puede ser el del reembolso.
- Cobros = importe NETO efectivamente recibido. Solicitudes no son ingresos.
  El split de la firma y comisiones ya descontadas no se restan otra vez.
  La comision incluida es informativa. Gastos pagados aparte son otro gasto.
- Beneficio = cobros - gastos efectivos. Aportaciones no alteran beneficio ni ROI.
  ROI = beneficio / gastos efectivos; sin denominador positivo se muestra guion.
- Bankroll principal GLOBAL = aportaciones + cobros - gastos efectivos hasta el
  final del periodo. No cambia al filtrar empresas; se etiqueta global.
- Compra crea el primer intento; reset finaliza como fallido el intento pendiente
  y crea otro en la misma cuenta. Renovacion no crea otro intento. Aprobacion
  conserva la misma cuenta y su historia de costes e intentos.
- Tasa de fondeo = intentos aprobados / intentos finalizados EN el periodo. Los
  pendientes no son fracasos. Cuenta una aprobacion en su fecha aunque se haya
  comprado antes del periodo. Resets muestran intentos anteriores por separado.
- Tasa de retiro: cohorte de cuentas aprobadas en el periodo, evaluadas hasta su
  final. Con resultado conocido = ya cobraron o cerraron sin cobro ni solicitud
  pendiente. Una cuenta cerrada con solicitud aun sin resolver sigue pendiente.
  Se muestran numerador, denominador y pendientes, no porcentajes inventados.
- Coste / aprobacion: compras y resets del periodo, netos de sus reembolsos, /
  aprobaciones. Coste / cuenta con cobro: gastos efectivos del periodo / cuentas
  de la cohorte con al menos un cobro. Las ventanas pueden mezclar gastos y
  resultados de distintas cohortes; consultar todo el historico para coste total.
- Tiempos: dias calendario desde el inicio del intento hasta aprobar, y desde
  aprobar hasta el primer cobro. Se muestran media y mediana; nunca fecha de
  solicitud como sustituto de la de cobro.
- Drawdown economico: maxima caida del beneficio acumulado a cierre diario,
  incluyendo cero inicial. No se inventa orden intradia porque se registran fechas,
  no horas. No es el drawdown de ninguna cuenta de trading.
- Grafica: gastos efectivos/cobros/neto en una escala monetaria y eje temporal
  reales. Escalones en la fecha del evento, negativos visibles, leyenda
  interactiva y marcadores opcionales. Ventanas conservan acumulado de apertura.
- La linea secundaria de bankroll con filtros representa el segmento, sin
  adjudicarle aportaciones generales. Se etiqueta de forma diferente al global.

## Copias y restauracion

- Copia JSON completa, versionada, con SHA256, IDs, eventos retirados y revisiones.
- Importacion: comprobar integridad y modelo; combinar IDs nuevos, omitir identicos
  y detenerse ante un mismo ID con contenido diferente o divisa base incompatible.
  No hay reemplazo masivo silencioso. Antes de combinar se ofrece una copia del
  estado anterior y se conserva la base mediante el mecanismo habitual.
- Importar dos veces la misma copia no duplica registros. Una copia valida puede
  restaurar un tracker vacio. Los conflictos con registros editados requieren
  revision; no se elige automaticamente la version mas antigua ni la mas nueva.
- CSV separados de cuentas y movimientos, con IDs, divisa/cambio original y
  proteccion frente a celdas de texto interpretables como formulas.

Antes de esta publicacion se crearon respaldos privados fuera del repositorio:
`.full-training-backups/20261023-funding-before-code` y
`.full-training-backups/20261023-funding-release` (carpetas hermanas de `apps`).
La copia SQL completa y la de autenticacion se restauraron en memoria y superaron
`integrity_check` y `foreign_key_check`. El LEEME privado identifica hashes y un
archivo incompleto de la primera descarga que NO debe utilizarse para restaurar.
No habia namespace funding en el respaldo del dataset activo.

## Verificacion y publicacion

Publicado el 23/10/2026 en el Worker privado existente:
`https://full-training-private.sergiofamisr.workers.dev/funding.html`.
Version: `21b46ef3-5f62-45e6-9e52-eb6ea42efc0e`.
Codigo: commit `9d91459`, subido a `main`. Se publicaron 48 assets permitidos,
sin cambios de esquema, dataset, bases o variables. Pruebas automatizadas:
104 del gateway/almacenamiento/permisos y 25 de calculo; ambas suites superadas.
Comprobacion posterior sin sesion: panel, tracker, JS, API funding y administracion
redirigen a `fulltraining.cloudflareaccess.com` (302). No se ha usado una sesion
real del usuario para registrar pruebas en produccion. El recorrido funcional y
la restauracion se probaron en navegadores aislados con SQLite en memoria o una
IndexedDB de prueba nueva, sin modificar perfiles personales.

Pruebas de calculo: libro vacio, ciclo completo, pendientes, resets, renovaciones,
reembolsos, splits/comisiones, FX, fechas imposibles, medias/medianas, cierres,
drawdown, periodos, importacion idempotente y conflictos de ID.
Pruebas de API: inicio vacio sin escrituras, borradores conservados, recibo perdido,
reintento unico, reapertura y permisos separados. Otros namespaces intactos.
Pruebas de navegador aislado: integracion en panel, alta, aprobacion, cobro, cierre,
reset tras fallo, edicion, anular/restaurar, JSON/CSV, filtros, fallo de red,
movil/escritorio y pixeles de grafica no vacia. Ninguna escritura de prueba en
produccion ni uso del perfil personal del navegador.

Referencia de codigo anterior para recuperacion: Worker
`f36983ec-1803-4841-80da-1cfc4ad2a5c4`, commit `8c94247`.
No restaurar una base SQL para revertir esta interfaz. Antes del primer registro,
se puede retirar solo el nuevo codigo sin modificar los otros modulos. Despues
de guardar datos de fondeo, conservar los lectores/API nuevos y desactivar solo
las ediciones afectadas o preparar un parche compatible; el Worker antiguo no
conoce este namespace. Una retirada completa requeriria exportacion verificada
y confirmacion, no borrar el namespace para volver atras.

Limites: sin cotizacion FX automatica, sin entrada masiva que supere el limite
habitual de 300 registros por guardado, sin eliminacion fisica de historia y sin
fusion automatica de JSON contradictorios. No hay garantias absolutas frente a
errores: revisar la confirmacion central y conservar copias verificadas.
