# Identificadores y Analytics por cuenta

Ampliación del Tracker de Fondeo existente, 1 de noviembre de 2026. Conserva el analizador, las normas individuales, las cohortes, las plantillas y el libro económico anteriores.

## Uso

1. Crear o editar una cuenta y rellenar sus identificadores de evaluación y fondeada. Se pueden buscar desde Cuentas y copiar desde la ficha; las ediciones conservan los valores anteriores.
2. Abrir **Analytics** en esa cuenta. Seleccionar o arrastrar un CSV en **Importar operaciones CSV**.
3. Indicar la zona horaria del archivo, revisar las columnas y pulsar **Revisar importación**. La aplicación no adivina la zona de fechas sin offset. Se admiten zonas IANA, como America/Chicago, America/New_York, Europe/Andorra o UTC.
4. Revisar nuevas, repetidas, actualizadas y ambiguas. Confirmar la cuenta cuando el identificador no coincide o no puede verificarse. Resolver cada ambigüedad antes de guardar.
5. Marcar **informe completo** solo si el archivo incluye todas las operaciones del periodo declarado. Entonces los días vacíos se muestran como sin operativa. Fuera de una cobertura confirmada se muestran como sin datos.

**Guardar JSON** conserva también los CSV originales y toda la operativa. El guardado automático usa IndexedDB. Un archivo JSON con IDs ya presentes y contenido diferente se detiene ante el conflicto; no sobrescribe silenciosamente el libro actual. Se puede restaurar una copia completa en una instancia vacía.

## Importación y trazabilidad

- Cada cuenta tiene su colección `analytics`, vinculada al ID interno existente. Los identificadores externos no se asignan a la firma ni sustituyen el ID interno.
- CSV con coma, punto y coma o tabulación, campos entre comillas y saltos de línea. UTF-8, con alternativa Windows-1252. Correspondencia de columnas editable, formatos de fecha explícitos y selección del separador decimal.
- El archivo original se guarda íntegro en base64, con SHA-256, nombre, opciones de lectura, mapeo, confirmación de cuenta, periodo declarado y resultados de conciliación. Se puede descargar desde el historial.
- Un archivo idéntico ya importado no vuelve a añadir operaciones. Un informe acumulado con 28 registros anteriores y 7 nuevos conserva 35.
- Los IDs de ejecución tienen prioridad. Sin IDs se concilian fechas, cuenta, símbolo, contrato, dirección, precios, cantidad y divisa. Las coincidencias exactas se tratan como un multiconjunto: se conserva la multiplicidad de filas legítimamente idénticas.
- Una corrección identificable mantiene el ID interno de la operación y su versión anterior. Las coincidencias dudosas requieren elegir entre corregir una fila, conservar como nueva u omitir. Los informes parciales no eliminan operaciones ausentes.
- Una fila clasificada como repetida puede declararse explícitamente una nueva ejecución idéntica. No es posible deducir por software dos ejecuciones distintas si un informe no aporta ningún dato diferenciador: esa decisión queda visible para revisión.
- Límite de entrada: 8 MB y 50.000 filas por CSV; los informes se pueden importar por periodos. Copias JSON de hasta 100 MB. El panel conserva su protocolo de registros fragmentados y comprobación de integridad, sin migrar a localStorage.

## Estadísticas y calendario

Neto, bruto, comisiones, ganadoras, perdedoras, neutras, win rate, profit factor, medias, máximos, duración, curva operativa y drawdown cerrado. El neto usa céntimos enteros. Las comisiones se derivan de bruto menos neto cuando ambos están disponibles; si falta información no se inventa un valor cero.

La curva parte de cero y agrega los cierres simultáneos, evitando inventar un orden dentro de la misma marca temporal. No calcula MAE, MFE ni pérdidas flotantes. Las duraciones excluyen entradas no disponibles y muestran su tamaño de muestra.

El calendario empieza en lunes, permite elegir mes y año, tiene tonos discretos y muestra neto y cantidad de operaciones por día. El detalle incluye bruto, comisiones, neto, ganadoras/perdedoras, win rate, profit factor, largos/cortos, símbolos, contratos, cantidades y filas originales con revisiones.

Las jornadas se asignan por cierre, zona horaria y hora de inicio configurada (0–23). Cambiar la configuración conserva los instantes importados y guarda la configuración anterior. Las horas ambiguas o inexistentes durante cambios de horario se rechazan; requieren un origen con offset explícito. Se reutilizan los agregados de jornadas intactas y se invalidan las jornadas afectadas por altas, correcciones o cambios de fecha.

La vista agrupada usa un ID de trade/posición explícito, cuenta externa, símbolo, contrato, dirección y divisa. No adivina agrupaciones por cercanía temporal. Cada trade agrupado se asigna al último cierre; la vista de filas conserva cada cierre parcial. Ambas conservan el neto y las comisiones totales, aunque pueden redistribuir jornadas.

Las estadísticas de jornadas muestran mejor/peor día, media/mediana, proporciones positivas/negativas, rachas de jornadas operadas consecutivas, operaciones medias, comparación por cantidad de operaciones, horario, dirección, símbolo y día de semana. Siempre muestran el tamaño de muestra; no atribuyen causas a una racha. Las jornadas sin operaciones quedan fuera de estas medias y rachas.

Cada informe usa una sola divisa. Se rechaza mezclar monedas dentro de la misma cuenta sin un criterio de conversión explícito.

## Separación económica

El CSV modifica exclusivamente Analytics. No genera eventos de retirada, cobro, compra ni gasto. Las comisiones operativas del CSV ya forman parte de su neto y no se vuelven a registrar como gastos de caja. El beneficio real, ROI y bankroll siguen dependiendo únicamente de los movimientos económicos existentes.

## Verificación

- 25 pruebas del libro anterior y 18 del analizador, sin regresiones.
- 17 pruebas de CSV, importación incremental, repetición, correcciones, multiplicidad, informes parciales, identificadores, agrupación, calendario, cambio horario, días afectados, JSON y separación económica. Incluyen 10.000 ejecuciones sintéticas en conciliación.
- CSV de ejemplo disponible localmente: 28 registros, 237.004 céntimos de neto, 8.646 céntimos de comisiones y cinco jornadas. La prueba usa UTC explícitamente para comprobar importes y jornadas del ejemplo; no deduce la zona real del proveedor. El archivo y su identificador personal no forman parte del repositorio ni del HTML distribuido.
- 6 pruebas de recursos, permisos y persistencia del panel: incluye originales CSV fragmentados, reapertura y conservación de IDs con una base sintética.
- Recorridos de navegador en HTML autónomo y versión modular: alta y edición de identificadores, búsqueda/copia, CSV, incremento, repetición, informe parcial, aviso de otra cuenta, detalle diario, agrupación, navegación mensual, móvil a 390 px, recarga y exportación/restauración JSON.
- Recorridos anteriores del analizador también verificados. Build de recursos privados correcto.

## Entrega y publicación

El HTML autónomo se genera con `node scripts/build-funding-standalone.cjs`. Las dos versiones usan los mismos cálculos. Se actualizan el HTML de la carpeta apps, su carpeta de distribución y el ZIP. Hay una copia previa fuera del repositorio.

Los archivos de código están preparados para el panel privado. El despliegue de Cloudflare sigue pendiente de una credencial válida, como ya se indicó en la ampliación anterior; las pruebas de persistencia usan una base sintética, no los datos de producción del usuario.
