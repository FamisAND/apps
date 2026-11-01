# Tracker de Fondeo: formulario simplificado y publicación

Actualizado el 2 de noviembre de 2026.

El alta y la edición de una evaluación muestran siete campos:

1. Identificador de cuenta.
2. Empresa.
3. Precio.
4. Objetivo de profit.
5. Consistencia (%).
6. DD máximo.
7. DLL.

Hay un único identificador visible. Las referencias antiguas de evaluación y fondeada siguen conservadas en el libro y en las revisiones; los CSV anteriores siguen reconociéndose. No se pide un identificador de fondeada ni se muestran formularios de sus normas.

Las compras nuevas usan la fecha del día y la divisa del libro, indicadas en pantalla. Las fechas históricas se conservan al editar. Los movimientos mantienen su editor para corregir fechas y registrar gastos, retiros o divisas distintas cuando corresponda. Identificador, empresa y precio son obligatorios al crear; las cuatro normas pueden quedar pendientes. Consistencia y DLL aceptan 0 cuando no existen.

Editar el precio corrige el evento de compra inicial, conserva su versión anterior y su cambio de divisa, y actualiza el precio de las condiciones. No se pierden notas, nombres antiguos, CSV, otras normas ni registros posteriores.

## Analizador de evaluación

El analizador utiliza únicamente empresa, precio y las cuatro normas de evaluación. El cálculo y la comparación de ratios no requieren completar una fase fondeada ni estiman retiradas o ROI de esa fase. Las plantillas y análisis anteriores siguen guardados.

Los supuestos del escenario quedan recogidos en un apartado opcional. Al empezar una configuración nueva se usa riesgo del 10% del DD por jornada, ratio 1:1 y horizonte de 60 jornadas. Se conservan los valores de riesgo y ratio de las configuraciones existentes.

Cuando falta una norma detallada, el modelo usa DD fijo, suspensión al tocar el límite, DLL duro, consistencia inclusiva y ausencia de días mínimos o vencimiento. Se explica en pantalla que son supuestos del cálculo. No se escriben como si fueran normas contractuales conocidas. Las condiciones históricas explícitas, como trailing, DLL blando o consistencia estricta, se respetan.

El motor completo anterior se conserva para compatibilidad y sus pruebas siguen pasando. Analytics y el calendario CSV mantienen la separación entre operativa y dinero cobrado.

## Verificación

- 64 pruebas del libro, analizador, importaciones CSV y cálculo de evaluación: todas pasan. Incluyen el CSV local de 28 registros, 2.370,04 USD netos, 86,46 USD de comisiones y cinco jornadas.
- 6 pruebas de acceso, recursos y persistencia: todas pasan.
- Seis recorridos de navegador: HTML autónomo y versión modular, cada uno con formulario mínimo, analizador y Analytics.
- Revisión visual en 390 px: los siete campos caben en el formulario, sin desbordamiento horizontal.
- Prueba de cuenta antigua: conserva ID interno, nombre, notas, fecha de compra, normas antiguas de evaluación, condiciones fondeadas e identificador fondeado anterior. Cambiar el precio deja la revisión del coste inicial.

## Cloudflare

Publicado en el Worker existente `full-training-private` de la cuenta del proyecto confirmada por el usuario.

- URL: https://full-training-private.sergiofamisr.workers.dev/funding.html
- Código publicado: `59d3569`.
- Versión nueva: `daaca711-9494-4856-bbf5-d0f0bdb001a8`.
- Versión anterior: `478055f6-ec8b-42b0-8ac0-ee39dbbcbd0b`.
- Cloudflare confirmó la subida de los ocho recursos modificados y la activación de la nueva versión.
- Comparación posterior: variables, nombres de secretos y enlaces a bases idénticos a la versión anterior. No se ejecutaron migraciones ni escrituras de datos de negocio durante el despliegue.
- Las rutas de HTML, analizador y CSV siguen redirigiendo a Cloudflare Access cuando se consultan sin sesión.

La comprobación de formularios y guardados se hizo con datos sintéticos y perfiles aislados. La verificación de publicación confirmó versión activa y protección de acceso; no creó operaciones ni cuentas en los datos reales del usuario.
