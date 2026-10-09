# Cloudflare: estado y activacion segura

## Estado actual

Actualizacion de migracion: ver `MIGRATION.md` y la guia `OPERACION.md`.
Hay motor por registros, versiones, recibos idempotentes, historial y adaptador
de los HTML, con ensayo exacto de los seis conjuntos compartidos y prueba de
guardado, cierre y recuperacion offline de Consulta. La copia real esta verificada en
staging; no esta conectada al Worker ni a los HTML, ni admite edicion.
El piloto GitHub anterior no debe confundirse con el sistema final.

Piloto desplegado en `https://full-training-private.sergiofamisr.workers.dev`.
Version inicial: `8abb2e3d-d5c2-4094-999a-8ce4b1b63ed1`. Se ha creado la base NUEVA
`full-training-auth` y sus tablas de acceso. Version anterior del piloto:
`cc81b9fc-6cac-4a81-ad1b-c81e8ac718c7`, con TEAM_DOMAIN y POLICY_AUD reales.
Version actual: `f4fb2e2a-7cfa-4ed6-a1f2-b9010bba38c7`, publicada el 2026-10-09
con el adaptador inactivo, la correccion del bucle de acceso descrita abajo y
mensajes de sesion/permisos mas claros. La correccion de acceso se publico
primero en `4b4edb0e-ca85-4fdf-b73c-64a8624110ee`.
El primer AUD facilitado por el usuario corresponde a la app self-hosted previa;
al activar Access para todo el Worker se creo otra audiencia. La audiencia
efectiva se verifico contra la firma de los metadatos publicos de Cloudflare,
el dominio de equipo fijado y el hostname exacto; el Worker se alineo con ella.
RECORDS_ENABLED=false y DATA_WRITES_ENABLED=false;
solo AUTH_DB esta vinculado. No se han cambiado perfiles ni el origen de trabajo
actual. Publicar el codigo en GitHub no activa el adaptador ni la base de negocio.
Verificado desde fuera tras activar Access: administracion, sesion y registros
redirigen al inicio de sesion del equipo fulltraining. Antes de activar Access,
las peticiones sin identidad y con cabeceras falsas devolvian 403 del Worker.
El usuario configuro All traffic, politica Solo Sergio y duracion de ocho horas.
El 2026-10-09 el usuario envio una captura del panel real con Sergio,
su correo, rol Administrador, estado Activo y listado de sesiones. La entrada
autentificada del administrador queda comprobada; no valida aun los modulos.
El administrador configurado es `sergiofamisr@gmail.com`.

Incluye identidad verificada con Cloudflare Access, sesiones con cookie HttpOnly,
usuarios habilitados explicitamente, permisos por modulo, revocacion de sesiones,
administracion y un intermediario para el repositorio privado. El token GitHub
del intermediario nunca se entrega al navegador. Las escrituras estan desactivadas
por defecto (`DATA_WRITES_ENABLED=false`).

Los permisos son por MODULO, no por cliente. Un usuario autorizado para Consulta
accede a todo el conjunto compartido de Consulta. No asignar ese permiso a clientes
finales ni a colaboradores que deban ver solamente algunos pacientes.

## Condiciones pendientes: no activar escrituras todavia

1. Acceso autentificado del administrador comprobado por captura. La proteccion de todo el
   Worker ya redirige al login; dominio y AUD efectivo configurados. El usuario
   ha asociado una politica Allow solo para su correo, sin ampliar permisos.
2. El origen anterior en GitHub Pages y el repositorio publico siguen fuera de
   esta proteccion. Acordar su cierre/proteccion y revisar datos semilla publicados,
   sin borrar archivos ni historia automaticamente. Un Worker no protege otro origen.
3. La configuracion privada `__ia_config` y `__fin` no se expone por la nueva API.
   Falta un intermediario para IA y proveedores financieros y sus pruebas antes
   del cambio definitivo de origen. No copiar sus claves al frontend nuevo.
4. Ensayar la entrada desde un perfil nuevo de Chrome y comparar todos los modulos,
   catalogos, menus y resultados con el respaldo. La prueba de compatibilidad local
   de Consulta compara todos los campos, pero no reemplaza una prueba integral.
5. Medir CPU y limites reales: el nuevo adaptador descarga registros paginados y
   el Worker no reconstruye el JSON de 10 MB en cada guardado. Esto reduce la
   carga respecto al gateway legacy, pero no certifica aun rendimiento en Free.
6. Confirmacion del administrador antes de habilitar escrituras, cambiar origen
   o modificar los mecanismos actuales de acceso y almacenamiento.

## Recursos nuevos y copia aislada

- Worker `full-training-private`: un hostname `workers.dev` sirve para el piloto.
- D1 `full-training-auth`: usuarios, sesiones y auditoria. No contiene menus,
  clientes, mediciones, patrimonio ni opciones. IDs de acceso nuevos no sustituyen
  IDs de clientes o perfiles del sistema existente.
- D1 `full-training-data`: copia staging autorizada y verificada, 9.820 registros.
  Esta aislada y no se usa para trabajo. El respaldo original sigue intacto.
- Secret `GITHUB_TOKEN`: no configurado. El gateway GitHub es legacy; no activar
  acceso/escritura de snapshots enteros como sustituto del traslado por registros.
- Access: permitir inicialmente solo el correo del administrador. El login del
  Worker ofrece actualmente el proveedor Cloudflare; no asumir que hay una
  casilla de correo/codigo de un solo uso. Al invitar usuarios hay que
  autorizarlos tambien en Access y acordar su proveedor de identidad.
- `TEAM_DOMAIN` e `POLICY_AUD`: dominio de equipo y audiencia reales de Access.
  JWT incorrecto, ausente o configuracion incompleta bloquean el acceso.

## Secuencia de configuracion

Ejecutar desde esta carpeta, solo tras revisar las condiciones anteriores:

```powershell
npx wrangler login --device --scopes account:read user:read workers_scripts:write d1:write
```

La base ya creada figura en `wrangler.jsonc`; no crear otra ni reutilizar otra.
La migracion de tablas de acceso ya fue aplicada solo a esa nueva base vacia.

El deploy del piloto no requiere copiar el token GitHub al servidor. Mantener
el gateway legacy sin datos mientras se termina el adaptador por registros.

```powershell
npm run build
npx wrangler deploy
```

Primer despliegue con `DATA_WRITES_ENABLED=false` y Access incompleto: el codigo
falla cerrado, no publica un acceso abierto a los HTML. Configurar la proteccion
de todo el Worker/hostname en Cloudflare, obtener audiencia y dominio, actualizar
`TEAM_DOMAIN`/`POLICY_AUD` y desplegar de nuevo. Mantener URLs de preview desactivadas.
El correo debe proceder del JWT verificado, no de una cabecera arbitraria.

La pagina `session-admin.html` permite crear usuarios, elegir modulos, desactivar
acceso y revocar sesiones. Cada peticion vuelve a comprobar permisos y revocacion.
El administrador principal no se puede expulsar desde este panel.

## Almacenamiento y recuperacion

- Se conservan todas las claves e IDs originales. No se limpian localStorage,
  IndexedDB ni formatos previos al abrir Consulta.
- Se anade IndexedDB `full-training-sync-safety-v1`, store `records`, para versiones
  verificadas y bases de comparacion. Una copia identica se deduplica por hash;
  no hay poda automatica. Si falta espacio, se bloquea la sincronizacion peligrosa.
- `__ft_session_owner` identifica el usuario que utiliza ese perfil/origen del
  navegador. No es una barrera frente a alguien con acceso fisico o DevTools.
  Usuarios distintos deben usar perfiles de Chrome distintos. Cerrar sesion NO
  borra datos locales, por la regla de conservacion del proyecto.
- GitHub sigue siendo el almacenamiento compartido de los HTML actuales. El
  Worker solo tiene vinculada la D1 de acceso; la D1 de negocio nueva conserva
  una copia staging verificada pero no participa en el trabajo ni en los guardados.
- Un origen nuevo tiene almacenamiento local distinto: no limpiar el anterior.
  Exportar y verificar primero los cambios que no esten en el remoto.
- Antes de una operacion sobre datos: respaldo verificable, plan, comparacion,
  rollback y confirmacion. Los respaldos estan fuera de este repositorio/publicacion.

Rollback: deshabilitar primero las escrituras del Worker. Conservar exportaciones
de los dos origenes y el historial remoto. Volver al codigo anterior no requiere
restaurar una version antigua de `data.json`; hacerlo podria borrar datos nuevos.
No restaurar todo el archivo ni eliminar las copias de seguridad automaticamente.

## Verificacion local

```powershell
npm ci --ignore-scripts
npm test
npm run build
npx wrangler deploy --dry-run
```

Las pruebas usan identidades/datos ficticios y SQLite temporal; no acceden a
produccion. La simulacion de identidad solo se inyecta desde tests, no se activa
mediante variables del despliegue. Los assets se construyen con una lista explicita:
no se publican Excel, respaldos, datos privados, Git ni service workers previos.

Resultado local 2026-10-08/09: 63 tests Node, 12 verificaciones de checkpoints en
navegador aislado y 19 regresiones de las protecciones existentes. Arranque real
de los cinco HTML y guardado/recuperacion de medicion en Consulta ensayados en
RAM y navegador de pruebas, sin escrituras sobre datos originales o Cloudflare.
El script `scripts/check-snapshot-concurrency.mjs` permite ensayar una copia
privada verificada exclusivamente en RAM: recibe el backup y su bundle,
sin escribir archivos ni llamar a Cloudflare. Pasaron los seis conjuntos y
9.820 registros, sin sobrescrituras entre sesiones ni cambios al original.
Consultar `MIGRATION.md`: estos ensayos no activan los HTML ni confirman el login.

Revision del acceso del 2026-10-09: el usuario encontro un bucle de redirecciones.
Se conserva el enrutado literal de los HTML (`assets.html_handling=none`) para
evitar la redireccion automatica de `/index.html` a `/`, que el Worker mapea
de nuevo a `/index.html`. La cookie de sesion usa Secure, HttpOnly y SameSite=Lax
para admitir el regreso desde Access; las mutaciones siguen requiriendo el
Origin exacto y una identidad y sesion verificadas. `/auth/complete` corta el
flujo con un error visible si falta la cookie, sin repetir el inicio de sesion.
Los assets no autenticados tampoco pueden iniciar sesiones adicionales.
La prueba aislada en Chrome reprodujo Strict bloqueado al volver desde otro
sitio y verifico Lax, recarga y rol admin ficticio. Su cierre automatizado fue
inestable en este equipo; no equivale a verificar la entrada real del usuario.

Referencias oficiales:
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/limits/
