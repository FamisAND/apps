# Full Training: funcionamiento y recuperacion

## Estado real al 9 de octubre de 2026

La migracion NO esta activada. Los HTML actuales siguen usando GitHub.
Cloudflare contiene un piloto privado de sesiones y una copia de negocio
verificada, aislada y en staging. No se han borrado los originales.

El nuevo guardado por registros esta implementado y probado localmente.
No afirmar que todos los modulos estan migrados hasta superar el corte final.
El piloto recibio una correccion del acceso el 9 de octubre. Sergio confirmo
con captura el panel real: Administrador y Activo. En Chrome se puede guardar como marcador
`https://full-training-private.sergiofamisr.workers.dev/session-admin.html`.
Ese panel es distinto de Manage Account / Members de la cuenta de Cloudflare.

## Que papel tendra cada sistema

| Sistema | Funcion despues del corte |
| --- | --- |
| GitHub apps | Codigo de los HTML e historial de cambios del programa. Publicar codigo no restaura ni reemplaza datos de pacientes. |
| GitHub appdata | Archivo privado de recuperacion del sistema anterior. Dejara de recibir guardados normales; se conserva su historia. |
| Cloudflare Access | Identificar cada persona mediante su correo autorizado. No basta conocer la URL. |
| Worker y base de sesiones | Aplicar permisos, sesiones, revocacion y validacion de cada peticion. |
| D1 de negocio | Fuente central de clientes, mediciones, anamnesis, menus, gestion, facturas, patrimonio, opciones y catalogo. Cambios por registro, con version e historial. |
| Navegador | Formulario abierto y copias locales por usuario. Un borrador no equivale a un guardado central. |
| Backups independientes | Recuperacion cuando el historial no basta o hay una incidencia del proveedor. No sustituyen la confirmacion de cada guardado. |

Las fotos guardadas solo en el navegador requieren su propio traslado. No
estan incluidas automaticamente por copiar el catalogo o los clientes.
Las claves de IA/finanzas se conservaran privadas y no se expondran por la API
de datos. Sus intermediarios siguen pendientes; no activar sin resolverlos.

## Como se guardara

1. Al abrir un modulo se verifican sesion, permisos y una copia completa.
   Si falla la lectura, no se inicia una base vacia ni se ejecutan semillas.
2. Al aceptar un cambio se conserva un borrador local y se verifica su escritura.
3. Se envian los registros modificados con sus versiones esperadas y un ID de
   solicitud. No se sube el archivo entero de todos los clientes.
4. El servidor aplica todos los cambios del guardado juntos o ninguno.
5. Solo tras verificar el recibo central y conservarlo localmente se presenta
   el guardado como confirmado. Un formulario sin guardar se avisa por separado.

En el nuevo origen habra Exportar copia, Reintentar y Comparar versiones.
No cerrar a la fuerza una ventana con cambios pendientes o error.

## Incidencias

| Situacion | Comportamiento y respuesta |
| --- | --- |
| Otro ordenador modifica un registro distinto | Ambos cambios pueden permanecer sin sustituir el conjunto completo. |
| Dos personas editan el mismo registro o lista | El guardado antiguo se rechaza entero. Se conserva el borrador para comparar; no se elige ganador por fecha. |
| Se pierde la conexion o la respuesta | Queda pendiente. Al reabrir se recupera la misma solicitud y su reintento no duplica el cambio. No esta garantizado continuar trabajando sin conexion indefinidamente. |
| Falta espacio local | No se afirma exito ni se envia sin la copia requerida. Exportar y conservar la ventana; no limpiar el almacenamiento como solucion automatica. |
| Falla el archivo de copias | Se intenta exportar el borrador y formulario en memoria. El archivo indica que es incompleto/no verificado. No confundirlo con backup verificado. |
| Sesion caducada o permiso retirado | Se bloquean nuevas operaciones. Las copias no se borran; autentificarse con la misma cuenta o exportarlas antes de continuar. |
| Registro eliminado por error | El historial permite una recuperacion controlada como nueva version, manteniendo cambios posteriores. La API existe; falta una interfaz de restauracion guiada. No restaurar todo el JSON. |
| Error de codigo | Detener escrituras si procede, conservar copias y corregir o volver al codigo anterior. El rollback del programa no debe ejecutar un rollback ciego de datos. |
| Caida de Cloudflare o limite del plan | No marcar el guardado como confirmado. Conservar pendientes y exportar. Nunca activar GitHub como segundo escritor automatico. |

Cloudflare no garantiza por si solo ausencia de perdidas. El protocolo evita
sobrescrituras antiguas y falsos exitos, pero un fallo de disco o un cierre
forzado antes de conservar el borrador puede perder lo que solo esta en memoria.

D1 Free ofrece 7 dias de Time Travel; no es un archivo a largo plazo.
Definir y probar copias privadas independientes antes del uso definitivo.
Todavia no hay un calendario automatico de backups configurado.
Referencia: https://developers.cloudflare.com/d1/platform/limits/

## Administracion

Sergio ya ha verificado su login real como administrador. Podra crear cuentas,
elegir modulos, desactivar usuarios y revocar sesiones. Tambien hay que permitir
sus correos en Access. No compartir tokens GitHub ni la cuenta del administrador.

Los permisos actuales son por modulo completo, NO por paciente. Un colaborador
con acceso a Consulta puede ver todos sus clientes. No dar ese permiso a clientes
finales. Usar perfiles de navegador separados en ordenadores compartidos.

## Condiciones del cambio definitivo

- Login del administrador ya comprobado; faltan pruebas autentificadas de solo lectura de los modulos.
- Exportar y comparar todos los perfiles/ordenadores, incluidas fotos y pendientes.
- Resolver secretos, configuracion del dashboard y formularios aun no ensayados.
- Acordar una pausa de edicion y generar un backup final verificable.
- Revisar automatizaciones y retirar escritura del token legacy con confirmacion.
- Confirmacion explicita de Sergio antes de activar una unica fuente central.
- Probar un guardado y su lectura desde dos ordenadores; verificar recuperacion
  en otra base y establecer backups independientes.

Mientras falte una condicion, conservar el sistema anterior y no ejecutar el
corte. No volver al JSON antiguo sin reconciliar los cambios posteriores a D1.
