# Terra: correcciones para prueba controlada en producción

Fecha: 12 de septiembre de 2026. Autorización: el usuario pidió completar el
respaldo, las correcciones y la liberación para probar el agente real.

## Alcance

Servicio exclusivo: `agentevps / agente`.
Fuente confirmada en EasyPanel: `terracolchones/terra-colchones`, rama
`agent-production`, build path `/`, Nixpacks 1.41.0; comandos npm ci/build/start.
No se cambia el catálogo, la app Meta, WABA, números, credenciales ni suscripciones.
No se envían mensajes de prueba por cuenta del asistente.

Base de producción/remoto antes de liberar: `7577b5d31b854b9f5bbedd18ca73ef8959c426e9`.
Pruebas previas guardadas: `21d2630f13fb6830d219145323517b17fd67fc62`.
Nueva rama de trabajo: `codex/agent-fixes-20260912`, en
`E:\Terra App\agent-local-sim-20260912`.
Punto de seguridad adicional: `codex/safety-agent-fixes-20260912` en `21d2630`.

## Respaldo verificado antes del despliegue

- Fuentes base y pruebas: ZIP/Git descritos en `2026-09-12-simulacion-local.md`.
- Copia consistente SQLite creada dentro del volumen privado de producción:
  `/app/data/.safety-before-fixes-F50e5G/messages.db`.
- Origen abierto en modo readonly y copiado mediante `better-sqlite3.backup`.
- Resultado observado: 38 páginas, cero páginas restantes, 155648 bytes.
- Copia reabierta en modo readonly: `quick_check` dio `ok`.
- Destino exclusivo creado con `mkdtemp` y umask `077`; archivo con permisos `0600`.
- No se consultaron registros de clientes, no se mostraron conversaciones ni se
  descargó la base. Las conexiones de respaldo/verificación quedaron cerradas.
- La consola recibió inicialmente una instrucción incompleta; causó errores de
  sintaxis/referencia antes del backup, sin ejecutar una copia parcial. Se
  corrigió la entrada y se verificó el resultado final anterior.

Es un punto de recuperación de SQLite en el mismo volumen/servidor, no un respaldo
externo frente a pérdida del disco ni una restauración funcional completa. No se
copiaron secretos o archivos externos de Supabase. No hubo pausa/reinicio para el
backup. La liberación no migra esquema ni modifica estos archivos directamente.

Método de referencia: [SQLite Online Backup](https://www.sqlite.org/backup.html)
y [better-sqlite3 backup](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backupdestination-options---promise).

## Correcciones

1. **Canal receptor:** solo admite exactamente `metadata.phone_number_id` igual
   al configurado. Configuración/metadata ausentes, mal tipadas o de otro canal
   no reservan WAMID, guardan conversaciones ni disparan respuestas.
2. **Aceptación frente a persistencia:** un fallo local posterior a la aceptación
   del CTA/texto/GPS/QR no dispara mensajes alternativos o reintentos inmediatos.
   Un transporte incierto tampoco se interpreta como rechazo seguro.
3. **Control HUMANO:** imagen/ubicación se registran pasivamente sin avanzar el
   pedido ni enviar ACK/QR; las respuestas demoradas vuelven a consultar modo.
   Se conserva la confirmación de la solicitud explícita de asesor y el QR manual.
4. **QR demorado:** el envío automático comprueba modo antes y después de obtener
   la URL firmada. Un cambio a HUMANO cancela el envío que todavía no comenzó.
5. **Reservas actuales GPS/QR:** `sending` ya no caduca a los 300 segundos. La edad
   no demuestra que Meta no aceptó el mensaje; se conserva pendiente hasta revisión.
   El mensaje visible dice pendiente de confirmación, no que el envío esté ocurriendo.
6. **Diagnóstico sanitizado:** eventos de recepción, duplicados, canal, modo,
   intento, aceptación, rechazo, incertidumbre y estados; campos cerrados y códigos
   numéricos. Sin cuerpos, teléfonos, coordenadas, enlaces privados ni errores crudos.
   Referencias HMAC con sal efímera permiten vincular aceptación/estado en el mismo
   proceso. Se mantiene el aviso del código `131047` y la detección de token vencido.

No se eliminó el saludo separado ni el CTA, no se cambió el enlace privado del
catálogo y no se aprueban pagos automáticamente. Son correcciones de fiabilidad;
NO se demuestra con ellas la causa del baneo ni se garantiza evitar otro bloqueo.

## Validación previa

- Suite aislada completa: **128/128 casos**, 15 archivos, sin llamadas reales a
  Meta/OpenAI/Supabase ni base operativa. Las cinco caracterizaciones de defectos
  anteriores se convirtieron en regresiones de la conducta segura.
- TypeScript: sin errores.
- ESLint de src/scripts/configuraciones: sin errores. Los dos errores de lint
  completo en funciones Supabase previamente documentados no se modificaron.
- Build local Webpack: completado con entorno filtrado y red bloqueada.
  No equivale a comprobar el runtime Linux/Node de producción.
- Turbopack local no se considera validado: el bloqueo total de sockets interfiere
  con su IPC; la compilación de producción se debe comprobar en EasyPanel.
- Webhook público antes de liberar: GET con token ficticio devuelve 403/forbidden.
- Revisión cruzada: corregidas también dos regresiones detectadas antes de liberar
  (pérdida de aviso outside24h y retención del error privado como cause del QR).

## Límites que siguen abiertos

- No hay cola duradera del webhook ni serialización de entradas distintas por chat.
  Dos saludos con WAMID distintos siguen pudiendo producir dos CTA. No se descartan
  entradas legítimas para ocultar ese comportamiento.
- Una caída antes de enviar puede dejar `sending` pendiente: requiere revisión
  humana, no un desbloqueo automático. No se reclasificaron registros `failed`
  históricos ni se ofrece un botón nuevo de reconciliación.
- La ruta legacy `/api/order-confirmations` conserva su contrato y su reserva
  histórica distinta; no afirmar que todo envío de todos los endpoints quedó
  unificado. No usar esa ruta en esta primera prueba del flujo actual.
- No se revoca una petición a Meta que ya haya empezado cuando cambia el modo.
- No se implementó todo el plan integral de privacidad/RAG, revisión de adjuntos,
  precios, asociación de pedidos y seguridad HTTP. Su auditoría sigue vigente.
- Las referencias de diagnóstico no sobreviven reinicios ni enlazan por sí solas
  una entrada con todas sus salidas. Aceptación HTTP no equivale a entrega.
- La prueba real y el estado actual de restricciones de Meta necesitan comprobación
  aparte; una compilación correcta o una respuesta 403 del webhook no lo certifican.

## Liberación y reversión

Liberar únicamente si el remoto sigue en la base esperada, mediante avance normal
(sin force push) a `agent-production`, conservando las ramas de seguridad.
EasyPanel tiene auto deploy activado; no disparar otro build si el push ya lo inició.
Comprobar estado final del build, instancia nueva, huellas de fuentes y salud HTTP.

No restaurar SQLite para revertir un cambio de código: se perderían datos nuevos.
Una reversión de código debe ser otro commit explícito y despliegue verificado;
no `reset --hard`, no sobrescribir el volumen y no asumir que revierte una sanción.
El rollback que recupera la política antigua puede reactivar reservas envejecidas:
si hubo envíos inciertos, revisar antes de volver a esa política.

## Primera prueba del usuario, cuando se confirme el despliegue

1. Solo si Meta muestra la cuenta activa: escribir **un único Hola** al número
   conectado y esperar, sin ráfagas ni reintentos.
2. Comprobar la respuesta. Un chat nuevo conserva bienvenida + CTA; uno existente
   puede recibir solo CTA o continuar su pedido. No crear pedidos/pagos para esta
   primera comprobación.
3. Ante error, ausencia de respuesta o restricción: detener la prueba y revisar
   metadatos sanitizados. No cambiar de número/WABA para eludir una restricción.
4. Una prueba correcta no demuestra ausencia futura de baneo. Las siguientes
   pruebas funcionales se hacen de una en una después de revisar la primera.

El resultado efectivo del despliegue se registra por separado en el manifiesto
local de esta liberación, sin datos privados de chats.
