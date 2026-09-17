# Comprobantes y GPS de WhatsApp reutilizables con Shopify

Fecha: 17 de septiembre de 2026.
Estado: decisión de diseño y plan; integración aún no implementada ni activada.

## Decisión

Implementar una sola captura y consulta de los datos recibidos por WhatsApp.
El panel del agente y el acceso desde Shopify utilizarán la misma ficha privada
del pedido. Shopify será la fuente comercial de productos, inventario y pedidos
cuando se active la integración. El agente conservará el chat y sus evidencias.

El cliente seguirá comprando con el botón Comprar por WhatsApp, sin formularios
adicionales ni obligación de pasar por el checkout de Shopify. El usuario debe
enviar el mensaje prellenado para confirmar desde WhatsApp.

## Qué existe y qué falta

- El panel local mejorado está en `codex/agent-panel-chat-20260917`, con base
  `7994c2e`. Su demo usa datos ficticios y no representa una conexión Shopify.
- El agente guarda GPS dentro del flujo de un pedido elegible. No cualquier
  ubicación entrante debe modificar un pedido.
- La recepción actual de imágenes registra el aviso de comprobante y el ID del
  mensaje, pero no descarga ni conserva el archivo recibido. Hay que ampliar esa
  recepción para poder mostrar imágenes reales; un cambio visual no lo resuelve.
- El QR de cobro enviado por Terra es un recurso diferente del comprobante
  enviado por el cliente. Mantener ambos separados.
- El nombre de perfil de WhatsApp no demuestra el nombre completo del comprador
  ni el del titular que pagó. Conservar campos distintos y su procedencia; solicitar
  el nombre por el mismo chat cuando falte, sin inventarlo ni darlo por verificado.
- Existe un prototipo local de reservas Shopify en
  `E:\Terra App\agent-shopify-reservation-local`, commit `a1b5092`, documentado en
  `docs/SHOPIFY_RESERVAS.md`. Está inactivo y procede de una base anterior.
  Reutilizar las partes compatibles mediante revisión; no reemplazar el agente
  vigente ni fusionar esa rama antigua completa sin analizar diferencias.

## Una ficha, dos puntos de acceso

| Información | Propietario al activar Shopify | Presentación |
| --- | --- | --- |
| Productos, variantes, precios e inventario | Shopify | Tienda y pedido Shopify |
| Pedido comercial | Borrador/pedido Shopify vinculado de forma persistente | Shopify y resumen en el panel |
| Mensajes, GPS y comprobantes recibidos | Agente y almacenamiento privado | Una ficha autenticada compartida |
| Nombre aportado por el cliente | Ficha con procedencia y confirmación | Ficha; sincronización al pedido cuando corresponda |
| Validación del pago | Equipo autorizado; estado comercial en Shopify | Estado de pago separado de recepción del comprobante |

Primera interfaz recomendada: desde el pedido o borrador Shopify, un enlace estable
«Ver comprobante y ubicación» abre la misma ficha autenticada que utiliza Terra.
Así no hace falta construir otra bandeja de revisión ni una app incrustada en
Shopify para empezar. La imagen se conserva una sola vez. El enlace no contiene
teléfono, coordenadas, secretos ni acceso público al archivo; requiere sesión
de operador y autorización sobre el pedido. No promete inicio de sesión único.

Shopify admite notas y campos adicionales en borradores. La integración debe
usar un campo propio para el enlace, sin sobrescribir notas del equipo, y comprobar
su acceso desde el administrador durante la prueba en tienda de desarrollo.
No insertar datos privados en atributos que puedan aparecer en el escaparate,
notificaciones o documentos del cliente. Al convertir un borrador en pedido,
conservar y comprobar expresamente la relación y el enlace; no asumir su copia.

## Implementación prevista

### Envío de archivos desde el panel

Requisito añadido por el usuario: además de recibir y consultar archivos, debe
existir la posibilidad de enviarlos. La maqueta incorpora **Adjuntar** para
imágenes JPG/PNG y documentos PDF, con destinatario visible, vista previa, mensaje
opcional y acción explícita de envío. Conserva el botón dedicado al QR de Terra.
La maqueta solo usa muestras; no selecciona, lee, sube ni envía archivos reales.

Al implementar el transporte real, conservar las restricciones del modo HUMANO
para adjuntos manuales y el flujo existente del QR, validar archivos en servidor,
y registrar adjuntos salientes separados de comprobantes entrantes. Mostrar
envío pendiente, fallo y confirmación según evidencia del proveedor, sin duplicar
un envío cuyo resultado sea incierto. Reutilizar el almacenamiento privado y la
consulta de medios de la ficha compartida. Esta función requiere ampliar el
envío del agente; no se obtiene solo con modificar su interfaz.

Se pidió aclarar si el destino de los archivos será el cliente, el encargado de
revisión o ambos. La maqueta actual representa el envío al cliente; un reenvío a
terceros no está configurado ni autorizado por una muestra visual. El acceso a la
ficha desde Shopify sigue siendo una consulta privada, distinta de enviar archivos.

### Secuencia de integración

1. **Captura y almacenamiento común en el agente.** Registrar una referencia
   persistente al medio entrante, descargarlo mediante el proveedor y guardarlo
   en almacenamiento privado. Asociar mensaje, archivo y GPS al pedido correcto.
   Eliminar duplicados de forma persistente y conservar todos los comprobantes
   relevantes sin sobrescribir el anterior. Si la asociación es ambigua, mantener
   la evidencia pendiente de vinculación y pedir revisión.
2. **Consulta compartida.** Una API autenticada y una ficha reutilizable muestran
   imagen, nombre disponible, ubicación y estado de revisión. Servir la imagen
   mediante acceso autorizado; un enlace temporal vencido debe poder renovarse
   desde la ficha. El GPS no se convierte automáticamente en dirección postal.
3. **Conector Shopify.** Vincular de forma persistente la referencia pública del
   pedido con el borrador Shopify, el pedido final y el chat. Adaptar el prototipo
   de reservas al formato vigente de referencias y al flujo de confirmación.
   Validar variantes y precios en servidor. Registrar la sincronización pendiente,
   reintentar sin duplicar pedidos y reconciliar respuestas inciertas antes de
   volver a crear. Un fallo de Shopify no debe perder una evidencia ni bloquear
   la atención del chat.
4. **Revisión en Shopify.** El encargado abre la ficha desde el pedido, revisa el
   comprobante y registra el pago solo después de verificarlo. La mera llegada
   de una imagen deja el comprobante en revisión. Leer el cambio comercial de
   Shopify mediante eventos autenticados e idempotentes, manteniendo separados
   pago confirmado, comprobante recibido y entrega. Evitar dos botones de aprobación
   independientes con estados contradictorios.
5. **Prueba integral.** Primero datos ficticios y proveedores simulados en local;
   después, conexión a tienda de desarrollo cuando corresponda. No activar servicios
   reales, cambiar variables, desplegar ni enviar datos reales en esta etapa.

La captura, la consulta y la ficha se implementarán una vez. El adaptador transforma
esos datos al contrato de Shopify sin copiar reglas de recepción en la interfaz.
Esto reduce el trabajo de migración, pero no elimina el mantenimiento futuro de
APIs ni la prueba real necesaria para declarar la integración compatible.

## Comprobaciones de aceptación

- Imagen repetida: un solo archivo registrado y ningún pedido duplicado.
- GPS y comprobante conservan su asociación; nunca aparecen en otro cliente.
- Archivo fallido o enlace vencido: aviso recuperable, nunca imagen ficticia
  presentada como comprobante real ni aprobación de pago.
- Múltiples pedidos posibles: no adivinar el destino de la evidencia.
- Nombre ausente: mostrar pendiente; no usar el nombre de perfil como verificado.
- Acceso sin autorización: no devuelve archivo, coordenadas ni datos del cliente.
- Shopify caído, respuesta incierta y evento repetido: recuperación sin duplicados.
- Paso de borrador a pedido: se conserva la ficha y se refleja el pago confirmado
  por el encargado, sin volver a solicitar GPS ni reenviar QR automáticamente.
- Mantener las pruebas actuales del chat, modo HUMANO, deduplicación y envíos.
- Adjuntos salientes: destinatario correcto, cancelación sin envío, restricciones
  del modo HUMANO, validación del archivo y recuperación ante resultados inciertos.
- Ejecutar pruebas, TypeScript, lint y build antes de entregar código funcional.

## Fuentes y límites verificados

Revisadas el 17 de septiembre de 2026:

- [DraftOrder](https://shopify.dev/docs/api/admin-graphql/latest/objects/DraftOrder):
  pedidos borrador para ventas por chat y relación con el pedido completado.
- [DraftOrderInput](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/DraftOrderInput):
  admite notas y metafields; validar permisos y presentación al conectar la tienda.
- [Archivos Shopify](https://help.shopify.com/en/manual/shopify-admin/productivity-tools/file-uploads):
  Content > Files está destinado a contenido público. No usarlo para los
  comprobantes privados de clientes.
- [Timeline](https://help.shopify.com/en/manual/shopify-admin/productivity-tools/timeline):
  permite adjuntar archivos manualmente a comentarios. Esto no demuestra una API
  para automatizar esos adjuntos; el diseño inicial no depende de esa capacidad.

Este documento no modifica el contrato en ejecución entre catálogo y agente.
Cuando se implemente su evolución, actualizar también
`E:\Terra App\01\docs\ARQUITECTURA_PROYECTO.md`. No se modificó código, configuración,
datos operativos ni servicios externos durante esta definición.
