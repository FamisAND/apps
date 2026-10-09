# Cloudflare: estado y activacion segura

## Estado al 9 de octubre de 2026

Piloto privado: https://full-training-private.sergiofamisr.workers.dev

La copia completa esta conectada en SOLO LECTURA. No se han activado guardados
centrales ni retirado escrituras del sistema anterior. No usar los dos origenes
como escritores simultaneos. Consultar MIGRATION.md y OPERACION.md.

- RECORDS_ENABLED=true, DATA_WRITES_ENABLED=false.
- Bindings: AUTH_DB y DATA_DB; no GITHUB_TOKEN.
- Dataset complete-1614c79e9164d6c2, estado verified, 10.364 registros.
- Seis conjuntos originales, configuracion del dashboard, 539 fotos por ID y
  ajustes privados cifrados. Reconstruccion exacta, comprobada con exportacion D1.
- Version desplegada de solo lectura: 6d94e4a9-c54e-4e37-8ef7-18aee38cbbae.
- Access All traffic, Solo Sergio, ocho horas, audiencia real fijada.
- Login real de Sergio como Administrador/Activo ya comprobado por captura.
  Falta la comprobacion autentificada de los modulos con la nueva copia.
- Ningun perfil, ID de cliente, clave antigua o almacenamiento original borrado.

La D1 anterior rehearsal-b49b1b75c2a67350 se conserva como staging; tambien se
conserva complete-d765c29c63726711. La copia actualizada, sus exportaciones y su
clave de recuperacion estan fuera de este repositorio, en .full-training-backups.
Nunca publicar sus archivos ni perder la clave que descifra sus ajustes.

## Guardado Preparado

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
Las llamadas estan bloqueadas mientras DATA_WRITES_ENABLED sea false.
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

## Condiciones Antes Del Corte

1. Backup final de Chrome cerrado y remoto; comparar pendientes de cada equipo.
2. Prueba autentificada de solo lectura de los modulos desde Chrome.
3. Pausa de todos los escritores y permiso especifico para archivar appdata
   como mecanismo reversible de solo lectura. Cerrar pestanas no basta.
4. Definir copias independientes y comprobar restauracion; nunca restaurar el
   JSON entero sobre cambios nuevos.
5. Activar una unica autoridad y comprobar guardado/reapertura en dos equipos.

El usuario anadio un menu y una medicion en Consulta antigua / GitHub DESPUES
de la copia anterior. Ya se respaldaron y verificaron: 85 clientes, siete
mediciones de octubre, ningun cliente anterior alterado ni eliminado. El piloto
de solo lectura apunta a esta copia actualizada. No activar la copia anterior.
El usuario confirma los HTML cerrados, pero el sistema detecta aun procesos
Chrome y el backup final NO se ha realizado; no se forzaron cierres. Pendientes:
backup consistente, prueba autentificada de modulos y permiso para archivar
appdata. Mantener DATA_WRITES_ENABLED=false.

## Verificacion

72 tests Node; 23 regresiones legacy; 16 comprobaciones reales de IndexedDB aislado, incluido archivado
y recuperacion exacta; cinco HTML con datos del respaldo en RAM, cero errores JS,
cero peticiones GitHub, guardado/reapertura y recuperacion offline de Consulta.
Exportacion D1 reconstruida en RAM: 10.364 registros y hashes iguales, con siete
mediciones de octubre. Los cinco HTML se reensayaron con esta copia, incluida
igualdad completa de los datos de Consulta al arrancar. No certifica todos los formularios ni la
latencia/CPU reales de Workers Free.

La lista explicita de assets excluye backups, Excel, datos, Git y service workers
antiguos. Los 38 assets se compararon con las claves privadas conocidas: ninguna
aparece publicada. Las mutaciones requieren identidad Access firmada, sesion
HttpOnly y permisos comprobados de nuevo en cada peticion.

Los permisos son por modulo, NO por paciente. Consulta comparte todo su conjunto
entre usuarios autorizados. No dar ese permiso a clientes finales. Usar perfiles
de Chrome separados en ordenadores compartidos; cerrar sesion no borra datos.

Referencias:
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/workers/platform/limits/
