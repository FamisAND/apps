# ICNS Recipes Scraper

Script Node que descarga las recetas detalladas de tu cuenta ICNS (foto, ingredientes con cantidades, instrucciones, tiempos, raciones) a partir de la lista de URLs.

## Requisitos

- Node.js 18 o superior
- Cuenta activa de ICNS con sesión válida

## Uso

```bash
cd scripts/icns-scraper
npm install
```

### Paso 1: Obtén tu cookie de sesión

1. Abre <https://icns.software> y haz login normal.
2. Abre DevTools (F12) → pestaña **Network**.
3. Recarga la página (F5).
4. Click en cualquier request a `icns.software` → **Headers**.
5. Busca la sección **Request Headers** → línea **`Cookie:`**.
6. Copia **todo el valor** después de `Cookie:`.

### Paso 2: Guarda la cookie

Crea el archivo `.icns-cookie.txt` (en esta carpeta) con la cookie pegada en una sola línea. **No subas este archivo a git** (ya está en `.gitignore`).

Alternativa: exporta como variable de entorno antes de ejecutar.

```bash
export COOKIE="tu_cookie_aqui"
```

### Paso 3: Pon el JSON de URLs

Copia tu archivo `recetas_urls_hasta_pX.json` (de ICNS) en:

```
scripts/icns-scraper/input/urls.json
```

O pásalo como flag:

```bash
node scrape.js --urls=/ruta/a/recetas_urls.json
```

### Paso 4: Lanza

```bash
npm start
```

El resultado se va guardando incrementalmente en `output/recetas-detalladas.json`. Si te corta a mitad, puedes reanudar con `--resume`:

```bash
node scrape.js --resume
```

## Opciones

| Variable / Flag | Default | Descripción |
|---|---|---|
| `COOKIE` | (archivo) | Cookie de sesión. Si no está, lee `.icns-cookie.txt` |
| `CONCURRENCY` | 2 | Peticiones en paralelo. Sé amable con el servidor. |
| `DELAY_MS` | 300 | Pausa entre requests por worker. |
| `LIMIT` | (sin límite) | Procesa solo las N primeras URLs (útil para probar) |
| `--urls=path` | `input/urls.json` | Ruta al JSON de URLs |
| `--out=path` | `output/recetas-detalladas.json` | Ruta al JSON de salida |
| `--resume` | `false` | Omite recetas ya extraídas con éxito |

## Ejemplo: prueba con 5 recetas primero

```bash
LIMIT=5 npm start
```

Mira el JSON resultante para verificar que los campos se extraen bien. Si los selectores no encajan con tu HTML, edita `parseRecipeHtml` en `scrape.js`.

## Formato de salida

Por receta:

```json
{
  "id": "87362",
  "nombre": "Bocados de chocolate y arroz inflado",
  "url": "https://icns.software/receta_87362",
  "foto": "https://icns.software/...",
  "fotos": ["..."],
  "raciones": 4,
  "tiempoTotal": "15 min",
  "tiempoElaboracion": "10 min",
  "momentos": [],
  "ingredientes": [
    { "raw": "100 g de arroz inflado", "cantidad": 100, "unidad": "g", "nombre": "arroz inflado" }
  ],
  "instrucciones": ["Mezclar...", "..."],
  "autor": "",
  "comentarios": "",
  "tags": []
}
```

Las recetas con error de fetch quedan como `{ id, nombre, url, _error: "..." }` para reintentar luego.

## Importar el resultado en la app

Cuando tengamos el JSON de salida, la app (`tob-menus → Recetas`) tendrá un importador equivalente al de ingredientes. Pendiente de la siguiente fase.

## Troubleshooting

- **"HTTP 204"** o **"Sesión caducada"**: la cookie ya no vale. Renuévala.
- **Demasiados fallos**: baja `CONCURRENCY` a 1 y sube `DELAY_MS` a 1000.
- **Faltan ingredientes en algunas recetas**: el HTML de ICNS no es uniforme. Mira el HTML crudo de la receta problemática y ajusta los selectores en `parseRecipeHtml`.
