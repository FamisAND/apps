# ICNS Browser Scraper

Scrapea **todas las recetas detalladas** (foto · ingredientes · cantidades · instrucciones · tiempos · raciones) directamente desde el navegador en `icns.software`, **sin instalar nada**. Usa tu sesión activa.

## Uso

### 1. Abre ICNS y haz login

Ve a <https://icns.software> y entra normalmente.

### 2. Abre la consola del navegador

En la misma pestaña: **F12** → pestaña **Console**.

### 3. Pega el script

Abre `scrape.js` en esta carpeta, copia **TODO el contenido**, pégalo en la consola y pulsa **Enter**.

Aparece un panel en la esquina inferior derecha.

### 4. Carga tu JSON de URLs

Click en **"Elegir archivo"** → selecciona `recetas_urls_hasta_pX.json` (el que ya tienes con la lista de URLs de tus recetas).

El panel confirma cuántas URLs cargó.

### 5. (Opcional) Prueba con 1 receta primero

Pulsa **🧪 Probar 1**. Mira el log: te dice si encontró foto, ingredientes e instrucciones. Si el resultado se ve mal, dime y ajusto los selectores. (También queda guardado en `window._icnsLastTest` para inspección).

### 6. Lanza el scraping completo

Pulsa **▶ Start**. Verás progreso en tiempo real:
- Barra de progreso
- Contador `done / total · ✓éxito ✗fallos`
- Log de las últimas operaciones

Puedes **⏸ Pausar** o **⏹ Detener** en cualquier momento. Lo descargado hasta ahí sigue siendo válido.

### 7. Descarga el JSON

Cuando termine pulsa **⬇ Descargar JSON**. Te llega `recetas-detalladas_YYYY-MM-DD.json`.

### 8. Reintenta los fallos (si los hay)

Si la sesión caducó a mitad o alguna URL falló, pulsa **↻ Retry fallos** — solo reintenta esas. Vuelve a guardar el JSON resultante.

### 9. Importa en la app

En tu app (tab **Menús → 🍳 Recetas**) → **⬆ Importar JSON** → selecciona el archivo descargado.

Las recetas se cruzan automáticamente con la BD de ingredientes (match por nombre, parcial incluido). Las que no encuentren match quedan con `_nombreFallback` y las puedes editar manualmente.

## Opciones avanzadas

En el panel puedes ajustar antes de **Start**:

| Campo | Default | Para qué |
|---|---|---|
| Concurrencia | 2 | Cuántas peticiones en paralelo. 1 = secuencial, 5 = más rápido pero más agresivo |
| Delay ms | 300 | Pausa entre peticiones por worker. Súbelo a 1000+ si ves errores de servidor |
| Limit | (∞) | Procesa solo las N primeras URLs (útil para probar) |

## Si los selectores no encajan con ICNS

El HTML de ICNS puede variar. El script usa **múltiples estrategias** (varias clases CSS, regex, headers H1-H4 con palabras como "ingredientes" / "elaboración") y fallbacks. Pero si una receta no se extrae bien:

1. Pulsa **🧪 Probar 1** con esa receta primero.
2. En la consola, ejecuta `window._icnsLastTest` para ver el HTML crudo y el parsing.
3. Pásame los resultados y ajusto los selectores.

## Troubleshooting

| Síntoma | Solución |
|---|---|
| "HTTP 204" o "Redirige a login" | Tu sesión caducó. Recarga ICNS, vuelve a hacer login, pega el script otra vez |
| Muchos fallos / lentitud | Baja concurrencia a 1 y sube delay a 1000ms |
| Foto vacía en todas | Posiblemente las imágenes requieren otra cookie/header. Inspecciona `window._icnsLastTest.html` |
| Ingredientes sin cantidades | El parser sacó el texto pero el regex de cantidad falló. La cantidad sigue en el campo `raw` |
| El panel no aparece | ¿Pegaste TODO el archivo? Cierra y vuelve a pegar. Verifica que no haya bloqueador de scripts |
