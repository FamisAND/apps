# Tracker de Fondeo: compra sencilla y FondeoLab

Actualizado el 2 de noviembre de 2026.

El alta y la edición de una evaluación muestran siete campos:

1. Identificador de cuenta.
2. Empresa.
3. Precio.
4. Objetivo de profit.
5. Consistencia (%).
6. DD máximo.
7. DLL.

Hay un único identificador visible por cuenta. Las referencias antiguas de evaluación y fondeada siguen conservadas en el libro y sus revisiones. No se pide un identificador de fondeada ni se muestran sus normas al comprar.

Las compras nuevas usan la fecha del día y la divisa del libro, indicadas en pantalla. Las fechas históricas se conservan al editar. Los movimientos mantienen su editor para corregir fechas y registrar gastos, retiros o divisas distintas. Identificador, empresa y precio son obligatorios; las cuatro normas pueden quedar pendientes. Consistencia y DLL aceptan 0 cuando no existen.

Editar el precio corrige el evento de compra inicial, conserva su versión anterior y su cambio de divisa, y actualiza el precio de las condiciones. No se pierden notas, nombres antiguos, CSV, otras normas ni movimientos posteriores.

## Analizar empresas de fondeo

La pestaña aparece después de **Estadísticas**. Su vista principal integra el HTML FondeoLab de probabilidades y rachas v4 proporcionado por el usuario: los mismos campos para evaluación y LiveSim, probabilidades, sensibilidad, coste y rentabilidad del primer retiro, lote de compras y comparación opcional con resultados reales. Los valores de 25K y 50K se guardan en el libro del Tracker y en una copia local del navegador; se incluyen en la copia JSON.

Las herramientas avanzadas y los análisis anteriores siguen disponibles en una sección plegada. Sus plantillas, resultados y condiciones guardadas no se reescriben. La simplificación de siete campos se aplica solo a la compra y edición de evaluaciones.

## Estadísticas e importaciones

Analytics de cada cuenta usa el CSV más reciente como conjunto activo; los archivos anteriores quedan descargables en el historial dentro de la rueda de configuración. El DD cerrado tiene una curva con valor y jornada al pasar el cursor. El P/L operativo no se suma al dinero cobrado.

Estadísticas del Tracker muestra un resumen de beneficio neto real, ROI, retiradas cobradas y DD económico, calculado con los movimientos del libro.

## Verificación

- 63 pruebas del libro, analizador e importaciones CSV, incluido el ejemplo de 28 registros, 2.370,04 USD netos, 86,46 USD de comisiones y cinco jornadas.
- Cuatro pruebas directas de recursos y persistencia y un recorrido privado completo con datos sintéticos, sin escrituras de negocio en producción.
- Seis recorridos de navegador: HTML local y versión modular para compra, FondeoLab, analizador anterior y Analytics.
- Revisión visual a 390 px y comprobación de que los siete campos caben sin desbordamiento.
- Cuenta antigua: conserva ID interno, nombre, notas, fecha de compra, condiciones fondeadas e identificador fondeado anterior.

## Cloudflare

Publicado en el Worker existente `full-training-private` de la cuenta confirmada por el usuario.

- URL: https://full-training-private.sergiofamisr.workers.dev/funding.html
- Código publicado: `518c4e4`.
- Versión activa: `a2402ac2-590d-4e3d-9383-5a139bacb27d`.
- Se subieron siete recursos nuevos o modificados. Las variables, secretos y conexiones a bases coinciden con la versión anterior.
- La ruta sigue protegida por Cloudflare Access. No se ejecutaron migraciones ni escrituras sobre datos reales durante las pruebas o el despliegue.
