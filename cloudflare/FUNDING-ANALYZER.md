# Ampliación de Tracker de Fondeo — 1 de noviembre de 2026

## Entrega y estado

Integrada en el Tracker existente, conservando Cuentas, Movimientos, Dashboard, importación/exportación y almacenamiento. No es una segunda aplicación. El mismo código modular se empaqueta en el HTML local autocontenido.

El HTML local y su ZIP están actualizados. El build del panel privado está preparado y las pruebas de su persistencia pasan. **El despliegue de Cloudflare no está publicado**: Wrangler rechazó el comando por ausencia de `CLOUDFLARE_API_TOKEN` o sesión de autenticación utilizable. No se usó una cuenta temporal ni se cambiaron los datos de negocio.

## Funcionalidades implementadas

- Analizador independiente de las compras: cinco indicadores estructurales, límites inclusivos/exclusivos, franjas orientativas editables, Sin DLL, DLL blando y Sin consistencia diferenciados.
- Configuraciones personales: crear, guardar, cargar, modificar con revisiones, duplicar y eliminar lógicamente. Ningún catálogo automático por nominal o firma. Eliminado el relleno inicial de la primera compra con firma, fecha y precio de ejemplo.
- Importación manual de JSON de FondeoLab: se conserva el documento original dentro de la configuración. Se copian únicamente equivalencias conocidas; las condiciones ambiguas requieren completar. No se importan ventajas artificiales ni tasas manuales.
- Copia individual de normas de evaluación y fondeada al comprar; precio pagado en el evento de compra; correcciones de condiciones registradas en revisiones. Configuración, análisis, cuenta, compra, intentos, gastos y retiradas tienen referencias explícitas.
- Ratios beneficio:riesgo independientes por fase, acceso rápido a 1:1, 1:1,5, 1:2, 1:3 y 1:4, y valores personalizados. Riesgo monetario fijo, % DD o % DLL.
- Simulación neutral reproducible, fases condicionales, pendientes separados de pérdidas, desglose ruina/vencimiento, rachas, tiempos condicionados al éxito e intervalos Wilson del 95%.
- Comparación de ratios de evaluación manteniendo el ratio fondeado y las demás condiciones; sensibilidad a riesgo y horizonte en ambas fases. Cálculo en Web Worker para no bloquear la interfaz.
- Renovaciones y resets opcionales con sus costes; vencimiento y definición de tocar/superar límites explícitos.
- Primer retiro: beneficio mínimo, porcentaje retirable, buffer, límite por solicitud, mínimos de jornadas rentables, reparto porcentual o tramos progresivos, activación y comisiones.
- Economía separada en cuenta que retira, coste por aprobada/primer retiro y lote. Activación cobrada al aprobar o descontada al retirar: contabilizada una sola vez. Costes de las cuentas fallidas incluidos.
- Estadísticas reales por cohorte de fecha original de compra, con estados, gastos, primeros cobros y posteriores por separado; ROI de primeros cobros y ROI total; media, mediana, n, mínimo y máximo de tiempos.
- Agrupación por cinco indicadores, drawdown, DLL, firma, programa, mes de compra y modalidad. Tasas con intervalos de incertidumbre; cuentas abiertas señaladas como provisionales.
- Comparación de estimaciones guardadas con compras vinculadas. Diferencias porcentuales mostradas a partir de 20 compras, umbral de presentación, no garantía de significación estadística. Puede revisarse por cohorte temporal usando los filtros.
- Eventos adicionales: inicio de evaluación, aprobación de retirada y suspensión explícita de fondeada. Un cierre antiguo sin motivo no se interpreta como suspensión. Una retirada aprobada o solicitada no se considera cobro.

## Archivos

- `funding-analysis.js`: motor puro, indicadores, escenarios, cohortes, importador de FondeoLab y migración aditiva.
- `funding-analysis-ui.js`: formularios, configuraciones, comparación, condiciones individuales y estadísticas.
- `funding-model.js`: tipos adicionales, validación de la extensión y fusión por ID sin duplicados.
- `funding.js`, `funding.html`, `funding.css`: integración en navegación, formularios, historial y diseño existente.
- `scripts/build-funding-standalone.cjs`: empaquetado del HTML local con el mismo motor, conservando su IndexedDB y flujo de JSON. También evita que los patrones `$&` del código se interpreten al insertar scripts en el HTML.
- `scripts/funding-analysis.test.cjs`, `scripts/funding-browser.test.cjs`: pruebas nuevas.
- `cloudflare/src/policy.mjs`, `cloudflare/test/funding.test.mjs`: recursos nuevos bajo el permiso de fondeo y prueba de conservación en el almacenamiento central.
- `Tracker de Fondeo - Local.html`, copia de la carpeta `Tracker-de-Fondeo-Local` y ZIP: distribución local actualizada.

## Esquema y migración

Se conserva `schemaVersion: 1` del libro, sus IDs, importes en céntimos, cuentas y eventos. La ampliación tiene su propia versión:

```
analysis: { version: 1, templates: [...], saved: [...] }
account.conditions: copia independiente de la configuración
account.analysisId: análisis guardado de origen, cuando exista
account.revisions: estado anterior y fecha de cada corrección
```

Las cuentas antiguas no se reescriben al cargar. Si carecen de `conditions`, se presentan como desconocidas. La extensión vacía se crea en memoria y se guarda por el canal existente en la siguiente operación explícita. No se crean fechas ni eventos retroactivos. La fecha inicial sigue siendo el evento de compra, incluso después de resets. Los intentos mantienen los IDs del evento de compra/reset.

JSON conserva condiciones, plantillas, análisis y revisiones. Las importaciones antiguas siguen aceptándose; los conflictos de un mismo ID detienen la importación en lugar de sobrescribir. No se ha modificado ningún almacén personal del navegador durante las pruebas. Antes de reemplazar los archivos se guardaron copias en `work/funding-before-nov01` del espacio de trabajo.

## Auditoría de FondeoLab v11 y cambios del modelo

Referencia revisada: `Downloads/fondeolab_simulador_v11.html`, especialmente `rng`, `passRule`, `ddAdvance`, `simulateOne`, el coste de activación y la fase de primer payout.

Se conserva el generador Mulberry32 y el enfoque de secuencias con pérdidas y recuperaciones. Se elimina del escenario neutral la ventaja ajustable, probabilidades manuales, reinversión, múltiples payouts, escalado de contratos y recorte preventivo del riesgo. El riesgo de cada fase queda fijo: cambiar el ratio modifica la ganancia, no la pérdida. Esta simplificación es deliberada y está etiquetada como modelo por jornadas.

La probabilidad neutral es `R/(B+R)`; por ello `p·B − (1−p)·R = 0`. El objetivo no se reduce a una racha perfecta. Como comprobación independiente, con barreras simétricas de ±200, pasos de ±100, p=0,5 y cuatro jornadas, las probabilidades exactas son aprobar 3/8, perder 3/8 y pendiente 1/4. La prueba compara Monte Carlo con esas cantidades, verifica reproducibilidad y conservación de población entre fases.

Para la rentabilidad:

- `q = aprobadas/N`, `s = requisitos de retiro/N`; `s = q × P(retiro | aprobada)`.
- Ingreso esperado: `s × (bruto tras reparto − comisión − otras tarifas del retiro)`.
- Gasto esperado: coste medio de compra/reset/renovación más activación ponderada por `q` si se paga al aprobar, o por `s` si se paga al retirar.
- Beneficio: ingreso menos gasto. El neto de la cuenta ganadora es informativo y no vuelve a usarse restando una segunda activación.
- Ejemplo de control: 1.500 × 80% − 139 − 50 = 1.011.

## Pruebas ejecutadas

- 25 pruebas anteriores del modelo de libro: todas pasan.
- 18 pruebas nuevas matemáticas, financieras, de migración y relaciones: todas pasan.
- 6 pruebas de Cloudflare, recursos y acceso: todas pasan, incluida reapertura tras pérdida de recibo con condiciones y configuración personal conservadas.
- Dos recorridos Playwright independientes: HTML autocontenido y versión modular con almacén de prueba. Guardar, calcular, guardar análisis, comprar, cambiar plantilla sin alterar compra, duplicar, segunda compra con reglas y precio distintos, corregir cuenta con historial, eliminar plantilla, recargar y comparar datos exactamente.
- Revisión de estadísticas y captura en 390 px; sin desbordamiento horizontal de página. Las tablas extensas tienen desplazamiento interno. Sin errores JavaScript en esos recorridos.
- Build de la lista explícita de recursos privados: correcto; no incluye Excel, datos personales, copias, secretos ni historial Git.

## Límites y comprobaciones manuales

1. No es una probabilidad real de una estrategia ni una predicción de la firma. Es un escenario binario neutral con supuestos explícitos. Los intervalos cuantifican error de simulación, no incertidumbre sobre las normas o el modelo.
2. Una jornada contiene un resultado. No hay excursiones intradía. El trailing intradía se aproxima con cierres y puede sobreestimar la supervivencia frente a la regla real. No se modelan bloqueos especiales del trailing ni cambios contractuales escalonados salvo el reparto configurado.
3. DLL blando termina la sesión; no elimina la cuenta ni recorta ficticiamente la pérdida observada. Con una operación diaria, puede coincidir con ausencia de DLL.
4. El calendario comienza en un lunes convencional y distribuye el número elegido de jornadas semanales; no conoce festivos ni calendarios particulares. Las renovaciones siguen el periodo de compra; los resets no inventan una nueva fecha original.
5. Llegar al primer retiro significa cumplir los requisitos económicos para solicitarlo. El ROI supone que se paga: no se inventan demoras, rechazo administrativo ni insolvencia de la firma.
6. Las restricciones adicionales en texto se guardan para consulta, pero no se interpretan automáticamente. Revisar manualmente noticias, límites de contratos, horarios, cláusulas específicas y si los tramos son progresivos antes de usar un resultado.
7. Los gastos generales sin cuenta se mantienen en el Dashboard, pero se muestran como no asignados en cohortes. No se reparten arbitrariamente. Las comisiones ya descontadas del neto son informativas.
8. Los tiempos de eventos completados excluyen cuentas pendientes y fechas ausentes; no representan la espera esperada de todas las compras. No se sustituye activación desconocida por aprobación ni cobro desconocido por solicitud.
9. Las configuraciones importadas de FondeoLab pueden requerir completar reparto, topes, plazo y semántica de límites. El JSON original permanece guardado y los archivos de Descargas no se modifican.
10. Falta confirmar el despliegue privado con una credencial de Cloudflare válida. Las pruebas centrales fueron sobre una base sintética en memoria, no sobre datos de producción ni una sesión autenticada del usuario.

Los cambios no ejecutan operaciones de compra, pago o retirada: solo registran hechos y calculan escenarios.
