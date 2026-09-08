# Regreso con WhatsApp Personal y Business

**Estado:** PENDIENTE  
**Fecha:** 2026-09-07

## Objetivo

Evitar que un cliente que empezó el pedido en una edición de WhatsApp vuelva a
la otra edición cuando tiene WhatsApp Messenger y WhatsApp Business instalados
en el mismo dispositivo.

La lógica actual del pedido y del GPS está vinculada al número que inició la
conversación. El problema se limita al enlace genérico `wa.me`: Android decide
qué aplicación compatible lo abre y la landing no recibe una señal fiable que
identifique la aplicación de origen.

## Implementación prevista

- Mantener sin cambios los pedidos, la base de datos, el webhook, la
  confirmación y el envío idempotente del GPS.
- Mantener el `POST /api/orders/:orderId/continue` y esperar su respuesta antes
  de ofrecer el regreso al chat.
- Después de una respuesta exitosa, no redirigir automáticamente a `wa.me`.
- En Android mostrar siempre la pregunta “¿En cuál WhatsApp comenzaste esta
  conversación?” y dos enlaces de toque directo:
  - **WhatsApp personal**, dirigido al paquete `com.whatsapp`.
  - **WhatsApp Business**, dirigido al paquete `com.whatsapp.w4b`.
- Construir ambos destinos con un URI `intent:` que abra
  `whatsapp://send?phone=<numero-terra>` en el paquete elegido. El número se
  extraerá únicamente después de validar el `chatUrl` recibido del servidor.
- Conservar un tercer enlace secundario `wa.me` como apertura automática de
  respaldo.
- Si la aplicación elegida no se abre, mantener visible la landing y permitir
  probar la otra edición o el enlace de respaldo.
- En iPhone y escritorio mostrar el enlace oficial genérico, porque el
  direccionamiento Android mediante `package` no aplica en esas plataformas.
- No recordar la elección: se preguntará en cada pedido para no fallar cuando
  la misma persona alterne entre sus dos cuentas.

El segundo toque del cliente es deliberado. Los navegadores Chromium pueden
bloquear un `intent:` si se intenta abrir automáticamente después de esperar
una solicitud asíncrona; el enlace debe activarse mediante un gesto directo.

## Interfaces y alcance

- No se prevén migraciones ni cambios de base de datos.
- No cambia el contrato público de `/continue`; seguirá devolviendo el
  `chatUrl` validado.
- El cambio se limitará a la etapa final de `public/landing.html`.
- No se modificarán imágenes, selección de color, confirmación del pedido,
  contenido de mensajes ni pasos posteriores al GPS.

## Pruebas de aceptación

- Iniciar el flujo desde WhatsApp Personal, elegir Personal y comprobar que se
  abre el mismo chat de Terra con la solicitud GPS visible.
- Repetir desde WhatsApp Business y elegir Business.
- Probar en un teléfono Android físico con Chrome y Samsung Internet.
- Probar con ambas aplicaciones instaladas y con una sola aplicación.
- Elegir una aplicación ausente y comprobar que se puede usar la otra o el
  enlace genérico.
- Comprobar el regreso genérico en iPhone y escritorio.
- Verificar errores y timeout de `/continue` sin abandonar la landing.
- Repetir el toque y confirmar que `already_sent` no duplica el mensaje GPS.
- Ejecutar lint, comprobación TypeScript y build; después revisar el diff
  completo y repetir el flujo de compra existente.

## Condición para cerrarlo

El plan solo pasará a `COMPLETADO` después de validar los dos destinos en el
Samsung real. Los identificadores de paquete son oficiales, pero Meta publica
como contrato general el enlace `wa.me`, no un enlace web específico para la
edición Business.

## Referencias

- [Enlaces profundos y selección de aplicaciones en Android](https://developer.android.com/training/app-links/create-deeplinks)
- [Android Intents desde Chrome](https://developer.chrome.com/docs/android/intents)
- [WhatsApp Messenger en Google Play](https://play.google.com/store/apps/details?id=com.whatsapp)
- [WhatsApp Business en Google Play](https://play.google.com/store/apps/details?id=com.whatsapp.w4b)
