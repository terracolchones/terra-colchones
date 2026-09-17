# Panel local: comprobantes, GPS y archivos

Fecha: 17 de septiembre de 2026. Servicio: agente `agentevps / agente`.
Rama: `codex/agent-panel-chat-20260917`.
Respaldo anterior a esta ampliación: `codex/safety-before-panel-media-20260917`
en `35b7ef4`. No se modificó ni desplegó producción.

## Resultado

Se mantienen las tres zonas de la propuesta: conversaciones, chat y ficha del
pedido. Se utilizan verde #008069, burbujas #d9fdd3 y fondo #efeae2. En móvil la
ficha se abre con «Ver pedido» y vuelve al mismo chat. El panel conserva los
controles de comportamiento, conocimiento, IA/HUMANO y envío del QR de Terra.

La corrección de historial de `88e8415` sigue activa: paginación estable,
conservación del mensaje visible, avisos de novedades y regreso voluntario al
final. Además, un chat oculto por la ficha móvil ya no interpreta sus dimensiones
cero como estar al final cuando llegan mensajes.

La ficha muestra producto, variante, importe, estado, nombre completo aportado
por el cliente, archivos entrantes vinculados y ubicación GPS. El nombre se
introduce explícitamente; no se deduce del perfil ni de la imagen. Las imágenes
se amplían y descargan; los PDF se descargan. El mapa abre el punto recibido,
sin inventar una dirección postal. Los archivos de otro cliente o pedido se
rechazan en el repositorio.

«Adjuntar» permite seleccionar JPG, PNG o PDF de hasta 5 MB, ver el destinatario,
previsualizar y añadir un mensaje. Solo envía al cliente de ese chat en HUMANO.
El envío usa una solicitud persistente para impedir duplicados al reintentar.
Un resultado incierto exige revisar el envío; no dispara reenvíos automáticos.
La aceptación de Meta no se presenta como entrega o lectura confirmadas.

## Implementación y separación de responsabilidades

- Nuevas tablas auxiliares `panel_assets`, `panel_order_details` y `panel_sends`,
  creadas de forma aditiva y diferida sobre la conexión del agente. No cambian el
  contrato del catálogo, su confirmación, precios ni las reglas del asistente.
- Captura complementaria de imagen, documento y GPS en el webhook existente,
  después de sus controles de canal y deduplicación. Su fallo no impide el acuse
  existente de comprobante. Se conserva el comportamiento IA/HUMANO y la revisión
  del pago; recibir una imagen nunca lo aprueba. Los documentos se registran como
  archivos, sin introducir una nueva aprobación ni respuesta automática.
- Asociación de evidencias solo cuando hay un pedido activo inequívoco. En caso
  de ambigüedad el archivo permanece en su chat, sin adjudicarlo a otro pedido.
- Descarga autenticada de Meta hacia `data/panel-media/`, con identificadores
  opacos, escritura temporal y renombrado. Nunca se guardan en `public/` ni en
  archivos públicos de Shopify. Solo JPG/PNG/PDF, comprobación de firma del tipo,
  límite de 5 MB y tiempos máximos de transporte. No es un antivirus.
- `/api/panel/assets/:id`: consulta privada, recuperación y descarga.
  Autenticación existente del panel, `private, no-store`, `nosniff`, sin referrer
  y PDF como descarga. No se devuelve la referencia privada del proveedor.
- `/api/panel/orders/:conversationId`: ficha y edición del nombre con control de
  pertenencia al pedido. `/api/panel/attachments/:conversationId`: envío manual,
  validación y comprobación de HUMANO antes y después de subir a Meta.
- `/pedidos/:publicCode` y `/api/panel/dossier/:publicCode`: misma ficha privada
  por código público, incluyendo pedidos anteriores. Requieren autenticación.
- Mutaciones nuevas con cabecera propia y comprobación de origen. Las rutas
  mantienen autorización interna además de la barrera inicial del proxy.

## Tienda actual y Shopify

El catálogo actual sigue utilizando las mismas APIs y códigos públicos del
agente. Esta fase no necesita Shopify ni añade formularios al comprador.

Existe almacenamiento de la relación con un borrador o pedido de Shopify y una
URL estrictamente validada a su administrador. El botón «Ver pedido en Shopify»
solo aparece si esa relación existe. Mientras tanto se identifica como pedido
de la tienda actual de Terra.

**No hay sincronización Shopify activa.** Falta adaptar el conector de reservas
al contrato vigente, crear/vincular pedidos desde Shopify, escribir el enlace a
la ficha en su administrador y procesar sus cambios autenticados de pago. La
misma recepción de medios, almacenamiento y ficha se reutilizan en esa etapa.
El prototipo antiguo no se fusionó ni se activó. No hay dos aprobaciones de pago
independientes. No se enviaron archivos a revisores externos.

## Pruebas y límites de operación

- Suite aislada: **597 pruebas correctas en 39 archivos**. Incluye SQLite en
  memoria, captura en webhook, archivos cruzados, reintentos, HUMANO durante
  subida, fallo después de aceptación, autenticación, origen, límites de tamaño
  y transporte Meta simulado sin filtrar credenciales a otros dominios.
- TypeScript y build Next.js con webpack, sin red externa: correctos.
- ESLint: cero errores; un aviso previo en
  `supabase/functions/rag-index/index.ts:28`, archivo no modificado.
- Navegador con componentes reales y datos ficticios: 75 mensajes nuevos
  conservaron el mensaje 136 a -53,5 px del contenedor y `scrollTop` 3494; se
  añadieron páginas antiguas sin eliminar las ya cargadas. Se comprobó adjunto
  sintético, vista previa, envío simulado, edición del nombre y ampliación de
  comprobante. En móvil, volver de la ficha conserva el historial.
- Mensaje recibido con la ficha móvil abierta: el historial pasó de 50 a 51
  mensajes y conservó `scrollTop` 5250 al volver al chat.
- Vista de 320 px sin desbordamiento horizontal; 1024 px con tres columnas,
  chat de 480 px y ficha de 287 px. Consola sin errores ni advertencias.

La demostración se abre con `npm run preview:chat` en
`http://127.0.0.1:3191/preview/chat`. Usa memoria del navegador; recargar restablece
los ejemplos. Ningún archivo seleccionado sale hacia Meta. Las APIs operativas
del servidor local permanecen bloqueadas. No se utilizaron credenciales, bases
ni conversaciones de producción para estas verificaciones.

Los avisos históricos de imagen no contienen el archivo ni su ID de medio; no
pueden reconstruirse automáticamente. Una recuperación nueva depende de que
Meta todavía conserve el medio. Los archivos sin asociación inequívoca siguen
consultables en el chat; todavía no hay una herramienta para vincularlos a mano.

Antes de publicar se debe verificar la versión vigente del agente, el origen
detrás del proxy, volumen persistente y respaldo privado de `data/`, permisos y
una prueba controlada de Meta. La eliminación de conversaciones revoca el acceso
por cascada de metadatos; la purga física de binarios huérfanos y su retención
requieren una política operativa antes de activar el almacenamiento en producción.
No se ha construido una cola para recuperar procesos caídos entre reserva y
captura; una solicitud saliente interrumpida queda sin reenvío automático.

Esta evidencia comprueba el código y la interfaz locales; no constituye una
prueba en el VPS, una conexión real Shopify ni autorización para desplegar.
