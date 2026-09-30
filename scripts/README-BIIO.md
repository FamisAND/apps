# Verificación de BIIO y Opciones

Requisitos: Node, Python con openpyxl; para navegador, Playwright, pdf-lib y Microsoft Edge.
Los Excel originales se mantienen fuera del control de versiones.

Desde la raíz:

```sh
python scripts/import_biio.py RUTA_EXCEL biio-source.js
node scripts/check-biio-options.cjs RUTA_SALIDA/templates.json
python scripts/compare_biio.py RUTA_EXCEL RUTA_SALIDA/templates.json
node scripts/check-migration.cjs RUTA_COPIA_PRIVADA.json
python -m http.server 8765
```

En otra terminal, definir BIIO_TEST_OUTPUT como una carpeta existente fuera del repositorio y ejecutar `node scripts/browser-check.cjs` y `node scripts/audit-browser.cjs`.
Las pruebas de navegador usan un perfil aislado y bloquean la sincronización externa. Nunca usan el perfil ni los registros personales del navegador.
El test de migración lee una exportación de Consulta, no escribe en ella ni publica datos. Verifica identidades, resultados, mediciones, otras propiedades, copia original e idempotencia.

El DTE usa diferencia de fechas de calendario y una valoración explícita. Nueva York es la convención predeterminada de esta app; no se ha acreditado que represente el corte de sesión de Tastytrade. 2026-10-16 menos 2026-09-26 son 20 días; menos 2026-09-25 son 21. La comparación con el bróker requiere igual fecha efectiva e instrumento.

Los porcentajes, textos y rangos son literales del Excel. La capacidad para registrar series variables no convierte “?” en una prescripción. Las coincidencias ambiguas en la migración se conservan en sesiones y copia anterior, con informe descargable.
Los campos PDF tienen validación JavaScript para lectores compatibles. La importación aplica siempre la validación numérica antes de guardar, también si el lector ignora JavaScript.
