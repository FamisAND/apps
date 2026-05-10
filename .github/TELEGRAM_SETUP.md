# 🔔 Telegram bot — setup

Cómo activar las notificaciones diarias por Telegram. Sigue los 4 pasos:

## 1. Crear el bot en Telegram

1. Abre Telegram y busca **@BotFather**
2. Mándale `/newbot`
3. Te pide un nombre (ej: `Mis Dashboards`) y un username (ej: `misdashboards_bot`)
4. Te devuelve un **token** tipo `123456789:ABCdef-GHIjkl...`. Cópialo, lo necesitarás.

## 2. Conseguir tu chat_id

1. En Telegram, busca **@userinfobot**
2. Mándale `/start`
3. Te devuelve tu `Id: 123456789`. Cópialo.

## 3. Configurar en Mis Dashboards

1. Abre https://famisand.github.io/apps/
2. Pulsa **🔔 Notificaciones** en el menú
3. Primera vez: te pide crear una **contraseña maestra** (mínimo 6 caracteres). Solo tú la sabrás. Si la pierdes, se recupera editando `data.json` en GitHub manualmente y borrando `__security.notif_pwd`.
4. Tras la contraseña, pega el **bot token** y el **chat_id**
5. Selecciona la **hora del resumen diario** (default 09:00 Madrid/Andorra)
6. Pulsa **⚡ Probar envío** — deberías recibir un mensaje "¡Funciona!" en Telegram
7. Pulsa **💾 Guardar**

## 4. Permitir que el GitHub Action acceda a `appdata`

El workflow vive en el repo público `famisand/apps`, pero los datos están en `famisand/appdata` (privado). Necesita un Personal Access Token para leer `data.json`.

1. Abre https://github.com/settings/personal-access-tokens
2. Pulsa **Generate new token** → **Fine-grained token**
3. **Token name**: `mis-dashboards-telegram`
4. **Expiration**: lo más largo posible (1 año)
5. **Resource owner**: `famisand`
6. **Repository access** → **Only select repositories** → marca `famisand/appdata`
7. **Repository permissions**: **Contents: Read-only**
8. Genera el token. Cópialo.
9. Ve a https://github.com/famisand/apps/settings/secrets/actions
10. **New repository secret**:
    - Name: `APPDATA_PAT`
    - Value: pega el token
11. Guardar

## 5. Verificar

- Workflow se ejecuta automáticamente cada hora (a y :15) y comprueba si la hora de Madrid coincide con la configurada → solo envía 1 vez al día.
- Para forzar un envío inmediato sin esperar:
  - Ve a https://github.com/famisand/apps/actions/workflows/telegram-daily.yml
  - **Run workflow** → marca **force=true** → ejecuta
  - El run aparece en lista, espera ~30s, debería completar OK
  - Comprueba Telegram: deberías recibir el resumen

## 🧯 Problemas frecuentes

**"403 forbidden" al ejecutar el workflow**
- El PAT no tiene acceso a `appdata`. Revisa permisos del token.

**"chat not found" de Telegram**
- chat_id incorrecto. Asegúrate de copiarlo de @userinfobot exactamente.
- Asegúrate de haber **iniciado conversación** con tu bot (mándale `/start` desde tu cuenta).

**No recibo nada a la hora configurada**
- Comprueba en https://github.com/famisand/apps/actions si el workflow se está ejecutando.
- Cada run muestra "Hora Madrid X != notif.time Y. Salida limpia." si no toca.
- Si toca y no hay error, el problema es del lado de Telegram (token/chat_id).

**Cambiar la hora**
- Vuelve a 🔔 Notificaciones en la web → ajusta la hora → guardar. Surte efecto en el siguiente run.

## 🔐 Seguridad

- El **bot token** y el **chat_id** se guardan en tu `data.json` privado (`__notif`).
- La **contraseña maestra** se guarda hasheada (SHA-256) en `__security.notif_pwd`. Bloquea el formulario de configuración para que otros usuarios con PIN de dashboard no puedan modificar tu Telegram.
- El workflow corre en el repo público `apps`, pero solo el script `telegram-summary.js` ejecuta y solo con el secret `APPDATA_PAT` configurado. Sin él, no hace nada.
