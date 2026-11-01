# Tracker de Fondeo: compra sencilla y analizador completo

Actualizado el 2 de noviembre de 2026.

El alta y la edición de una evaluación muestran siete campos:

1. Identificador de cuenta.
2. Empresa.
3. Precio.
4. Objetivo de profit.
5. Consistencia (%).
6. DD máximo.
7. DLL.

Hay un único identificador visible por cuenta. Las referencias antiguas de evaluación y fondeada siguen conservadas en el libro y en las revisiones; los CSV anteriores siguen reconociéndose. No se pide un identificador de fondeada ni se muestran sus normas en la compra.

Las compras nuevas usan la fecha del día y la divisa del libro, indicadas en pantalla. Las fechas históricas se conservan al editar. Los movimientos mantienen su editor para corregir fechas y registrar gastos, retiros o divisas distintas cuando corresponda. Identificador, empresa y precio son obligatorios al crear; las cuatro normas pueden quedar pendientes. Consistencia y DLL aceptan 0 cuando no existen.

Editar el precio corrige el evento de compra inicial, conserva su versión anterior y su cambio de divisa, y actualiza el precio de las condiciones. No se pierden notas, nombres antiguos, CSV, otras normas ni registros posteriores.

## Analizador de rentabilidad

El analizador completo conserva sus formularios, supuestos y cálculos anteriores. Sigue permitiendo evaluar las fases de evaluación y fondeada, el primer retiro, los costes, el ROI, las simulaciones, las plantillas y la comparación de resultados. La simplificación de siete campos se aplica solamente al formulario para comprar o editar una evaluación. Las configuraciones y análisis guardados mantienen sus datos.

Analytics y el calendario CSV permanecen separados del dinero cobrado en el libro económico. El P/L operativo importado no se suma a las retiradas reales.

## Verificación

- 60 pruebas del libro, el analizador completo y las importaciones CSV: todas pasan. Incluyen el CSV local de 28 registros, 2.370,04 USD netos, 86,46 USD de comisiones y cinco jornadas.
- 6 pruebas de acceso, recursos y persistencia: todas pasan.
- Seis recorridos de navegador: HTML autónomo y versión modular, cada uno con el formulario de siete campos, el analizador completo y Analytics.
- Revisión visual en 390 px: los siete campos caben en el formulario, sin desbordamiento horizontal.
- Prueba de cuenta antigua: conserva ID interno, nombre, notas, fecha de compra, normas antiguas de evaluación, condiciones fondeadas e identificador fondeado anterior. Cambiar el precio deja la revisión del coste inicial.

## Cloudflare

Publicado en el Worker existente `full-training-private` de la cuenta del proyecto confirmada por el usuario.

- URL: https://full-training-private.sergiofamisr.workers.dev/funding.html
- Código publicado: `1d97662`.
- Versión activa: `114e58cc-5a7a-4898-904f-08f05243b9cc`.
- Cloudflare sustituyó únicamente los dos recursos del analizador al restaurar su interfaz y sus cálculos. No se ejecutó ninguna migración de datos.
- Variables, nombres de secretos y enlaces a bases idénticos a la versión anterior.
- Las rutas privadas siguen protegidas por Cloudflare Access.

La comprobación de formularios y guardados se hizo con datos sintéticos y perfiles aislados. La verificación de publicación confirmó la versión activa y la protección de acceso; no creó operaciones ni cuentas en los datos reales del usuario.
