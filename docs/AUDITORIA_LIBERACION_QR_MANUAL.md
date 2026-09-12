# QR manual: revisión previa a liberación

Fecha: 12 de septiembre de 2026. Cambios preparados localmente, pendientes de la
verificación y liberación conjunta.

## Comportamiento del botón

**Enviar QR de pago** requiere una conversación en HUMANO y un pedido del
catálogo confirmado con ubicación registrada. El panel envía el código público
del pedido que muestra; el servidor rechaza una selección que quedó antigua.
Si todavía no hay pedido o GPS, devuelve un mensaje explicativo sin enviar QR.
Esta condición es un cambio intencional: se cierra el envío de QR sin pedido
asociado, que podía duplicar un intento automático o manual anterior.

El operador conserva el botón y el modo HUMANO. El botón comparte con el
despacho automático la reserva persistente `catalog_order_payment_qr_deliveries`.
Dos solicitudes concurrentes para un pedido no abren dos intentos. Después de
una aceptación, una solicitud repetida devuelve `409` y explica que el QR ya fue
aceptado; esa aceptación no significa entrega al destinatario ni pago aprobado.

Una reserva en curso o un resultado de transporte incierto permanece bloqueado,
sin reapertura por tiempo. Si Meta aceptó y falló la persistencia final, se
conserva igualmente la reserva. Solo se libera ante un fallo demostrado de
preparación o una cancelación antes de llamar a Meta.

La ruta exige autenticación y origen del panel. Se vuelve a comprobar HUMANO
después de obtener la URL del QR. Los errores devueltos no incluyen respuestas
del proveedor, URLs firmadas ni detalles de SQLite. No se borraron tablas,
reservas, pedidos ni historial. No hay migración destructiva ni aprobación de
pagos en este cambio.

## Verificación

- 27 pruebas dirigidas aprobadas entre la nueva ruta manual, el despachador del
  catálogo y el proveedor de QR. Incluyen dos solicitudes concurrentes,
  automático seguido de manual, reserva automática pendiente, cambio de modo
  durante una espera, resultado incierto, aceptación seguida de fallo local,
  preparación fallida, autenticación, origen y selección antigua.
- TypeScript aprobado.
- Se ejecutó el código actual de `db.ts` con SQLite nativa exclusivamente en
  memoria, bloqueando sus escrituras de directorio y sustituyendo el constructor
  para que ningún archivo operativo pudiera abrirse. Se verificaron el requisito
  de confirmación/GPS, reserva duplicada, transición a `awaiting_payment` y
  resultado `already_sent` después de esa transición.

Los adaptadores externos de las pruebas están simulados. La prueba nativa verifica
SQL y estado en memoria; no certifica por sí sola persistencia entre reinicios,
montaje del volumen, comportamiento de Meta ni restricciones de cuenta.

FIN-06 queda atendido para las rutas actuales: la confirmación externa heredada
fue retirada y el botón manual comparte la reserva del pedido. Esto no reconcilia
automáticamente intentos históricos ambiguos ni recupera eventos anteriores.

## Continuidad mientras atiende una persona

El alcance autorizado para esta liberación distingue recibir hechos del cliente
de responder automáticamente. En HUMANO, el webhook puede registrar silenciosamente:

- El mensaje **exacto y afirmativo** de confirmación del catálogo. La operación de
  vinculación sigue rechazando un código que pertenece a otro chat. No se envían
  confirmación automática ni solicitud GPS.
- Una ubicación nativa de WhatsApp, con coordenadas válidas, para el único pedido
  activo de ese chat cuando ya está confirmado y espera ubicación. La escritura
  comprueba otra vez asociación, estado, HUMANO y unicidad en SQL. No sobrescribe
  una ubicación existente ni marca una solicitud GPS como enviada. El operador
  puede coordinar que el cliente comparta su ubicación por el chat y después
  utilizar el botón de QR.
- La llegada de una imagen en el único pedido activo que espera comprobante.
  Solo cambia a **comprobante recibido/en revisión**; no aprueba el pago ni envía
  un acuse automático. Se conserva la limitación previa de clasificación de
  imágenes y del acceso revisable al adjunto; no se afirma que esta captura
  verifique el contenido del comprobante.

Si no hay pedido apropiado, hay varios pedidos activos o la asociación es dudosa,
se conserva la entrada pasiva y no se adivina a qué pedido pertenece. En todos
estos recorridos HUMANO se mantienen **cero llamadas a Meta y cero llamadas al
modelo**. Continúan las barreras de firma, receptor y deduplicación del webhook.

Esta decisión reemplaza para el código nuevo las aserciones históricas D3/D4 de
«no guardar GPS/no marcar comprobante en HUMANO» del contrato de estabilidad.
El contrato describe la liberación histórica y no se reescribió. Las pruebas
equivalentes ahora verifican recepción asociada y silencio del agente; se
conservaron las pruebas de envíos aceptados, inciertos, duplicados y cambios de
modo durante esperas. La nueva regla permite completar una compra atendida por
una persona sin tener que reactivar respuestas automáticas.

Para reproducir las comprobaciones de SQL sin abrir ningún archivo operativo:

```powershell
node scripts/verify-human-order-facts.mjs
```

El script ejecuta siete escenarios con el `db.ts` actual y SQLite nativa en
memoria: cero/uno/varios pedidos, confirmación previa, otro chat, cambio a IA,
ubicación ya registrada, recepción de comprobante y reserva compartida del QR.
