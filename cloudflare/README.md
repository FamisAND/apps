# Cloudflare: estado y activacion segura

## Estado al 9 de octubre de 2026

Piloto privado: https://full-training-private.sergiofamisr.workers.dev

El corte tecnico esta completado. Cloudflare es la unica autoridad de guardado;
GitHub appdata esta archivado, privado y con toda su historia conservada.
Los HTML antiguos muestran acceso de solo lectura y enlace al origen privado.
Consultar MIGRATION.md y OPERACION.md para las pruebas y los limites pendientes.

- RECORDS_ENABLED=true, DATA_WRITES_ENABLED=true.
- Bindings: AUTH_DB y DATA_DB; no GITHUB_TOKEN.
- Dataset complete-1614c79e9164d6c2, estado active, 10.364 registros.
- Seis conjuntos originales, configuracion del dashboard, 539 fotos por ID y
  ajustes privados cifrados. Reconstruccion exacta, comprobada con exportacion D1.
- Version desplegada activa: 31935f52-439a-4b92-b8d3-fa3e15284350.
- Access All traffic, Solo Sergio, ocho horas, audiencia real fijada.
- Login real de Sergio como Administrador/Activo ya comprobado por captura.
  No se ha repetido una comprobacion interactiva autentificada de los modulos
  despues del corte: Chrome esta cerrado y no disponible para automatizacion.
- Ningun perfil, ID de cliente, clave antigua o almacenamiento original borrado.

La D1 anterior rehearsal-b49b1b75c2a67350 se conserva como staging; tambien se
conserva complete-d765c29c63726711. La copia actualizada, sus exportaciones y su
clave de recuperacion estan fuera de este repositorio, en .full-training-backups.
Nunca publicar sus archivos ni perder la clave que descifra sus ajustes.

## Guardado Activo

Cambios por registro con version esperada, transaccion completa, recibos
idempotentes, historial inmutable y retirada recuperable. El cliente conserva
primero un checkpoint IndexedDB y verifica la confirmacion antes de anunciar exito.
Los HTML no ejecutan semillas ni descargan datos encima de un pendiente.
Los endpoints legacy de JSON completo quedan desactivados en modo records.

Las fotos se cargan bajo demanda. El catalogo conserva sus IDs originales;
quitar una referencia no destruye la imagen central. El navegador no descarga
las 539 imagenes al abrir cada modulo ni guarda todas como copias completas.

La IA usa un proxy con endpoints fijos, sesion/permisos, Origin exacto y limite
temporal por usuario. Las claves se descifran solo en el Worker. El navegador
recibe disponibilidad, modelos y reglas, nunca las claves guardadas. Cambiar
ajustes requiere administrador, version esperada y confirmacion del servidor.
Desactivar DATA_WRITES_ENABLED bloquea guardados y llamadas a proveedores.
Las pruebas usan respuestas simuladas: no se han enviado datos de pacientes
ni realizado llamadas facturables para validar este despliegue.

El respaldo conserva cifrados tambien los ajustes legacy no utilizados. No hay
proveedores financieros configurados en la fuente examinada; su futura activacion
requiere adaptar su intermediario, no entregar claves al frontend.

## Espacio Local

Copias y espacio muestra cuota estimada y tamano del historial. Deduplicacion
de cargas/borradores identicos, aviso de cuota baja y solicitud opcional de
almacenamiento persistente. El navegador puede rechazar dicha solicitud.

El archivado NO es automatico: exportar, seleccionar el archivo descargado,
verificar contenido/usuario y confirmar. Solo se retiran versiones historicas
del NUEVO almacen que constan exactamente en ese archivo. Se conservan heads,
bases y pendientes; una carrera con otra pestana aborta el archivado completo.
La recuperacion del archivo vuelve a anadir historial sin cambiar el head ni D1.
Los almacenes antiguos no se limpian. Si falta espacio no se presenta un falso
guardado: exportar y conservar la ventana; tras recuperar espacio, Reintentar.

## Corte Y Copias

El usuario autorizo terminar el corte sin mas preguntas y forzar el cierre de
Chrome si era necesario. El backup final verifica 63 archivos de almacenamiento
local; tambien conserva mirrors, historia Git y ZIP exacto del remoto. La
comparacion completa del origen GitHub, fotos y ajustes coincide con la fuente
seleccionada: 85 clientes y siete mediciones de octubre, incluido el ultimo
menu anadido. Las dos mediciones que faltaban por introducir no se inventaron.

Las copias mas antiguas de file:// se conservan separadas, sin mezclarlas ni
sobrescribirlas. No se pudo inspeccionar almacenamiento de otros ordenadores;
el usuario confirmo cerrados sus escritores. appdata archivado impide que un
cliente antiguo vuelva a subir un snapshot sobre la base nueva.

Paquete final privado: ../../.full-training-backups/20261009-204525-cutover-final-0837a97d.
Exportaciones activas de negocio y acceso, informe de reconstruccion y clave de
recuperacion: ../../.full-training-backups/20261009-active-cutover-verified.
La exportacion activa se reconstruyo en RAM y coincide campo a campo y por hash.
No hay un calendario automatico de backups configurado. Un rollback despues de
nuevos guardados exige pausar, exportar y reconciliar, nunca reabrir el JSON viejo.

## Verificacion

76 tests Node; 23 regresiones legacy; 16 comprobaciones reales de IndexedDB aislado, incluido archivado
y recuperacion exacta; cinco HTML con datos del respaldo en RAM, cero errores JS,
cero peticiones GitHub, guardado/reapertura y recuperacion offline de Consulta.
Exportacion D1 reconstruida en RAM: 10.364 registros y hashes iguales, con siete
mediciones de octubre. Los cinco HTML se reensayaron con esta copia, incluida
igualdad completa de los datos de Consulta al arrancar. No certifica todos los formularios ni la
latencia/CPU reales de Workers Free ni una prueba en dos ordenadores del usuario.

Seis HTML antiguos probados con sus valores locales intactos, escrituras y
sincronizacion bloqueadas, exportacion y capturas de escritorio/movil.
Protocolo repetido contra D1 real en dataset sintetico separado: cambios de dos
sesiones, rechazo atomico de conflictos y reintento idempotente tras perder una
respuesta. Dataset de prueba retirado; cero escrituras sobre clientes reales.
Cuatro rutas privadas desplegadas redirigen a Access sin credenciales.

La lista explicita de assets excluye backups, Excel, datos, Git y service workers
antiguos. Los 39 assets se compararon con las claves privadas conocidas: ninguna
aparece publicada. Las mutaciones requieren identidad Access firmada, sesion
HttpOnly y permisos comprobados de nuevo en cada peticion.

Los permisos son por modulo, NO por paciente. Consulta comparte todo su conjunto
entre usuarios autorizados. No dar ese permiso a clientes finales. Usar perfiles
de Chrome separados en ordenadores compartidos; cerrar sesion no borra datos.

Referencias:
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/workers/platform/limits/
