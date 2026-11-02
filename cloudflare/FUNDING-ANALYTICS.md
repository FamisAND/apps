# Identificadores y Analytics por cuenta

Actualizado el 2 de noviembre de 2026.

## Uso

Cada evaluación tiene un único identificador visible, asociado a la cuenta y no a la empresa. Se puede buscar, copiar y editar. Los identificadores anteriores, incluidos los de la fase fondeada, permanecen en el historial. La compra y edición de evaluaciones muestran siete campos.

En la ficha de una cuenta, **Analytics** abre el calendario, las estadísticas y las operaciones. La rueda **Configuración e importaciones** contiene la zona horaria y el inicio de jornada, la importación CSV y el historial de archivos. En una cuenta sin datos se abre automáticamente para facilitar la primera importación.

Al cargar un CSV, se eligen zona horaria del archivo, formato de fecha, divisa y correspondencia de columnas. Antes de guardar se muestran las filas del archivo y cuántas operaciones activas sustituirá. Si el identificador del CSV no coincide o no se puede verificar, hay que confirmar la cuenta. Se puede declarar un periodo completo para distinguir los días sin operativa de los periodos sin datos.

## Sustitución de CSV

**El CSV nuevo sustituye todas las operaciones activas de esa cuenta.** Un informe acumulado de 35 filas deja 35 operaciones activas, aunque antes hubiera uno de 28. También un informe parcial sustituye al anterior; la pantalla lo indica antes de guardar. Las filas legítimamente idénticas dentro del nuevo CSV se conservan. Volver a cargar el archivo activo exacto no añade operaciones ni crea otra importación.

Los archivos anteriores siguen en el historial, descargables con su SHA-256, opciones de lectura y datos de cobertura. Solo el archivo activo contribuye al calendario y a la cobertura de días vacíos. Una cuenta creada con la versión incremental anterior puede volver a importar su CSV más reciente para eliminar las duplicaciones actuales: la primera importación nueva establece el archivo activo.

El archivo original se conserva en base64. Se admiten CSV con coma, punto y coma o tabulación, UTF-8 o Windows-1252, campos entre comillas y saltos de línea. Los cierres se asignan por zona IANA e inicio de jornada; las horas ambiguas por cambio de horario requieren offset explícito. Límite: 8 MB y 50.000 filas por CSV. El JSON completo conserva también los originales, con un límite de importación de 100 MB.

## Estadísticas y calendario

Analytics calcula neto, bruto, comisiones, ganadoras y perdedoras, win rate, profit factor, medias, extremos, duración, curva operativa y drawdown de resultados cerrados. La gráfica de DD permite consultar con el cursor el valor y la jornada de cada cierre; debajo permanece la tabla de valores. No se inventan MAE, MFE ni pérdidas flotantes.

El calendario mensual empieza en lunes y muestra neto y número de operaciones. El detalle diario desglosa bruto, comisiones, neto, tasas, símbolos, contratos y filas originales. Se puede alternar entre cierres individuales y trades agrupados por ID explícito. Los cierres simultáneos se agregan sin inventar un orden.

Las estadísticas por jornada incluyen mejor y peor día, medias, rachas, número de operaciones, horario, dirección, símbolo y día de semana. Siempre se muestra el tamaño de muestra. Los datos de un CSV no se mezclan con otras divisas sin conversión.

## Separación del dinero real

Un CSV modifica exclusivamente Analytics. No crea cobros, retiradas, compras ni gastos en el Tracker. El beneficio económico, el ROI y el bankroll se calculan solo con movimientos efectivos. Estadísticas del Tracker muestra ahora un resumen de beneficio neto real, ROI, retiradas cobradas y DD económico.

## Verificación y publicación

- 63 pruebas del libro, analizador avanzado e importaciones, incluido el CSV local de 28 registros: 2.370,04 USD netos, 86,46 USD de comisiones y cinco jornadas.
- Cuatro pruebas directas de recursos y persistencia, más un recorrido privado con base sintética que cubre guardado central, recuperación, JSON, CSV y FondeoLab.
- Recorridos de navegador local y modular para sustitución 28 → 35 → 1 → 35, archivo repetido, aviso de otra cuenta, DD con cursor, calendario, móvil y exportación/restauración.
- Build privado con lista explícita de recursos; no incluye CSV personales, copias, Excel, secretos ni historial Git.

Publicado en el Worker privado full-training-private, versión a2402ac2-590d-4e3d-9383-5a139bacb27d. Se conservaron las conexiones y variables del Worker anterior. No se ejecutó ninguna migración ni escritura sobre datos reales durante las pruebas o el despliegue.
