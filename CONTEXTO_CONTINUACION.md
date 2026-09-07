# Handoff integral — Terra App / Agente de WhatsApp

> Documento técnico autocontenido para continuar el proyecto con otra cuenta.
> Preparado el **7 de septiembre de 2026** a partir de la carpeta de trabajo y
> su código fuente. No contiene secretos, mensajes de clientes ni valores de la
> base de datos.

## 1. Resumen ejecutivo

**Terra App** es una aplicación Next.js que opera un número de WhatsApp Business
por la API oficial de Meta Cloud API. Tiene un dashboard web para revisar
conversaciones y alternar cada una entre respuesta automática por OpenAI y
atención humana. La persistencia es SQLite local.

El proyecto está especializado en la campaña del **Sillón Giratorio Lounge
Confort**. Automatiza la creación de un pedido, elección de color, confirmación,
solicitud de ubicación nativa de WhatsApp, envío de QR de pago alojado en
Supabase y recepción de un comprobante de pago.

No utiliza WhatsApp Web, Baileys, Twilio, Redis, Prisma, WebSockets, ni un bot
separado. El dashboard consulta el servidor cada dos segundos.

### Estado de la carpeta al crear este documento

- Ubicación: `E:\Terra App\01`.
- No hay carpeta `.git`; **no es actualmente un repositorio Git**.
- Node instalado en esta máquina: `v24.19.0`; npm: `11.17.0`.
- El proyecto declara Node `>=20.9.0`, recomienda Node 22 (`.nvmrc`) y el
  despliegue fija Node 22.
- Existen `.env.example` y `.env.local`; este último fue detectado pero no se
  leyó ni se documentan sus valores.
- Existe almacenamiento local `data/messages.db` junto con los archivos SQLite
  `messages.db-wal` y `messages.db-shm`. No se inspeccionaron sus registros para
  no exponer datos de clientes.
- Verificaciones ejecutadas en esta máquina el 7 de septiembre de 2026:
  `npm run lint` y `npx tsc --noEmit` terminaron correctamente. No se ejecutó un
  `npm run build` adicional durante la creación de este documento.
- No se encontró una lista formal de tareas pendientes ni historial Git. El
  próximo objetivo de producto debe definirse explícitamente.

## 2. Tecnologías y dependencias

| Categoría | Tecnología / versión declarada | Uso |
| --- | --- | --- |
| Framework | Next.js `^16.0.0` | App Router, rutas de API y renderizado. |
| UI | React y React DOM `^19.0.0` | Dashboard y pantalla de configuración. |
| Lenguaje | TypeScript `^5.7.2`, modo estricto | Código servidor y cliente. |
| Base local | `better-sqlite3` `^13.0.3` | Conversaciones, mensajes, pedidos e idempotencia. |
| IA | `openai` `^6.0.0` | Responses API oficial. |
| Storage | `@supabase/supabase-js` `^2.115.0` | Bucket privado y URLs firmadas de QR. |
| Estilos | Tailwind CSS `^4.0.0` | Dashboard; la landing estática tiene CSS propio. |
| Calidad | ESLint `^9.17.0`, `eslint-config-next` `^16.0.0` | Lint. |

Scripts definidos en `package.json`:

```powershell
npm run dev       # next dev
npm run build     # next build
npm run start     # next start
npm run lint      # eslint .
npx tsc --noEmit  # verificación adicional de TypeScript
```

## 3. Restricción importante de Next.js

`AGENTS.md` contiene una regla obligatoria: este proyecto usa una versión de
Next.js con cambios incompatibles respecto a versiones anteriores. **Antes de
escribir o modificar código relacionado con Next.js**, leer la guía pertinente
en `node_modules/next/dist/docs/` desde esta carpeta y atender sus avisos de
deprecación. `CLAUDE.md` únicamente remite a `AGENTS.md`.

## 4. Inventario completo de archivos relevantes

```text
E:\Terra App\01
├── src
│   ├── app
│   │   ├── page.tsx                             # entrada: ConnectionGate
│   │   ├── layout.tsx                           # idioma es, metadatos globales
│   │   ├── globals.css                          # Tailwind y estilos mínimos globales
│   │   ├── privacy/page.tsx                     # política de privacidad estática
│   │   ├── productos/sillon-lounge/page.tsx     # redirección de ruta heredada
│   │   └── api
│   │       ├── connection/status/route.ts       # diagnóstico Meta/configuración
│   │       ├── conversations/route.ts           # listado de conversaciones
│   │       ├── conversations/[conversationId]/route.ts # eliminación
│   │       ├── messages/[conversationId]/route.ts      # lectura y envío humano
│   │       ├── mode/[conversationId]/route.ts   # cambia IA/HUMANO
│   │       ├── webhook/route.ts                 # webhook de Meta
│   │       ├── qr/route.ts                      # comprobación/carga QR Supabase
│   │       ├── payment-qr/[conversationId]/route.ts # envío manual de QR
│   │       ├── orders/[orderId]/confirm/route.ts # confirmación desde landing
│   │       ├── orders/[orderId]/continue/route.ts # dispara GPS nativo
│   │       └── order-confirmations/route.ts     # confirmación externa protegida
│   ├── components
│   │   ├── ConnectionGate.tsx                   # decide config o dashboard
│   │   ├── ConfigScreen.tsx                     # guía visual de configuración
│   │   ├── Dashboard.tsx                        # lista/panel y polling
│   │   ├── DashboardHeader.tsx                  # estado del número Meta
│   │   ├── ConversationList.tsx                 # listado de chats
│   │   ├── ConversationPanel.tsx                # mensajes, modo y QR manual
│   │   ├── MessageBubble.tsx                    # burbujas y fallo de envío
│   │   ├── ModeToggle.tsx                       # selector IA/HUMANO
│   │   ├── ProductLanding.tsx                   # compatibilidad, redirige a landing.html
│   │   └── types.ts                             # tipos consumidos en el cliente
│   └── lib
│       ├── db.ts                                # SQLite, esquema y operaciones
│       ├── openai.ts                            # cliente y Responses API
│       ├── system-prompt.ts                     # instrucciones comerciales de Terra
│       ├── catalog.ts                           # producto/colors permitidos
│       ├── order-location.ts                    # envío idempotente de solicitud GPS
│       ├── payment-qr.ts                        # envío del QR de pago a WhatsApp
│       ├── supabase-qr.ts                       # storage QR privado Supabase
│       └── meta
│           ├── client.ts                        # Graph API: mensajes y estado número
│           ├── handler.ts                       # procesador de webhooks y flujos
│           └── verify.ts                        # HMAC SHA-256 de Meta
├── public
│   ├── landing.html                             # landing/checkout estático actual
│   └── productos
│       ├── sillon-lounge-amarillo.jpg
│       ├── sillon-lounge-gris.jpg
│       └── sillon-lounge-azul.jpg
├── data
│   ├── messages.db                              # SQLite, datos operativos
│   ├── messages.db-wal                          # WAL activo
│   └── messages.db-shm                          # memoria compartida WAL
├── README.md                                    # instalación y operación detallada
├── .env.example                                 # nombres/plantilla de variables
├── .env.local                                   # configuración secreta local; NO compartir
├── .gitignore                                   # excluye data, env locales, .next, node_modules
├── .nvmrc                                       # 22
├── package.json / package-lock.json             # dependencias bloqueadas
├── next.config.ts                               # externaliza better-sqlite3 del bundle
├── eslint.config.mjs                            # reglas Next/core web vitals/TS
├── postcss.config.mjs                           # Tailwind 4
├── tsconfig.json                                # strict, bundler, alias @/* => src/*
├── Procfile                                     # web: npm run start
├── nixpacks.toml                                # compilación de EasyPanel/Node 22
└── AGENTS.md                                    # regla de documentación Next.js
```

Directorios generados que no deben transferirse en un commit: `node_modules/`,
`.next/` y `tsconfig.tsbuildinfo`. `.gitignore` ya los excluye junto a `data/`,
`.env.local`, `.env` y archivos de depuración npm.

## 5. Arquitectura y límites de ejecución

```text
Cliente WhatsApp
      │ webhook HTTPS
      ▼
Meta Cloud API ── POST /api/webhook ──► handler.ts
      ▲                                      │
      │ Graph API                             ├── SQLite local (datos y estados)
      │                                      ├── OpenAI Responses API (modo IA)
      │                                      └── Supabase Storage (QR firmado)
      │
Dashboard web ◄── rutas /api/* ─────── Next.js (runtime Node.js)
```

- Todas las rutas de API son `dynamic = "force-dynamic"` y `runtime = "nodejs"`.
- `better-sqlite3` está declarado en `serverExternalPackages` dentro de
  `next.config.ts`; no puede ejecutarse en Edge Runtime.
- SQLite se abre de forma diferida al atender la primera solicitud, se crea en
  `process.cwd()/data/messages.db`, usa `busy_timeout = 5000`, `foreign_keys =
  ON` e intenta activar WAL.
- La aplicación mantiene una instancia de SQLite por proceso Node. Es apropiada
  para una sola instancia con volumen persistente; varias réplicas no deben
  compartir el mismo archivo SQLite en una red sin diseñar una estrategia de
  concurrencia distinta.
- No hay autenticación de usuario para el dashboard ni sus rutas internas. Esto
  es deliberadamente un límite de la primera versión, no una protección.

## 6. Configuración y variables de entorno

Nunca copies valores de `.env.local` a un chat, repositorio, imagen ni este
archivo. Para un entorno nuevo, copiar `.env.example` a `.env.local` y completar
los secretos por un canal seguro.

| Variable | Obligatoria / valor por defecto | Función |
| --- | --- | --- |
| `META_ACCESS_TOKEN` | Obligatoria | Token de System User de Meta para Graph API. |
| `META_PHONE_NUMBER_ID` | Obligatoria | Identificador del número WhatsApp usado en Graph API. |
| `META_WABA_ID` | Opcional, referencial | ID de la cuenta WhatsApp Business; hoy no se usa en requests. |
| `META_APP_SECRET` | Obligatoria | Verifica firma HMAC de webhooks. |
| `META_VERIFY_TOKEN` | Obligatoria | Token elegido para el handshake GET de Meta. |
| `META_GRAPH_VERSION` | `v25.0` | Versión de Graph API. |
| `PUBLIC_APP_URL` | Necesaria para ofrecer la landing | URL pública HTTPS base; sin ella no se genera el CTA de compra. |
| `OPENAI_API_KEY` | Obligatoria | API key usada solo en servidor. |
| `OPENAI_MODEL` | `gpt-5.6-luna` | Modelo de Responses API. Se puede usar `gpt-5.6-terra` para mayor calidad. |
| `OPENAI_BASE_URL` | Opcional, no aparece en plantilla | Base URL alternativa para el cliente OpenAI. |
| `SUPABASE_URL` | Necesaria para QR | URL del proyecto Supabase. |
| `SUPABASE_SECRET_KEY` | Necesaria para QR | Secret key de servidor, nunca la clave publicable. |
| `SUPABASE_QR_BUCKET` | `chatbot-qr` | Bucket Supabase privado. |
| `SUPABASE_PAYMENT_QR_PATH` | `payment-qr.jpeg` | Ruta relativa PNG/JPEG del QR de cobro. |
| `QR_UPLOAD_TOKEN` | Obligatoria para `POST /api/qr` | Bearer token que permite cargar QR. |
| `ORDER_CONFIRMATION_TOKEN` | Obligatoria para confirmación externa | Bearer token de `POST /api/order-confirmations`. |

La pantalla de configuración exige específicamente las primeras cinco variables
de Meta/OpenAI: `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_APP_SECRET`,
`META_VERIFY_TOKEN` y `OPENAI_API_KEY`. Tras encontrarlas, consulta a Meta el
número, nombre verificado y calidad del número.

## 7. Rutas de interfaz web

| Ruta | Comportamiento |
| --- | --- |
| `/` | Muestra `ConnectionGate`: mientras valida, pantalla de carga; si falta configuración o falla Meta, pantalla de ayuda; si conecta, dashboard. |
| `/privacy` | Política de privacidad estática, actualizada el 6 de septiembre de 2026. |
| `/landing.html?order=TERRA-...` | Landing estática vigente para color y confirmación. |
| `/productos/sillon-lounge?order=...` | Ruta heredada; redirige a `/landing.html`. |

### Dashboard

- Tiene cabecera con número, nombre verificado, calidad y botón **Probar conexión**.
- Lista conversaciones por actividad. Consulta `/api/conversations` cada 2
  segundos y selecciona la primera si no hay selección válida.
- El panel consulta los mensajes de la conversación actual cada 2 segundos y
  hace scroll al final cuando cambian.
- Cada conversación se puede poner en **IA** o **HUMANO**. Solo en HUMANO se
  habilita el cuadro de texto y el botón de QR de pago.
- Los mensajes humanos que no llegaron a WhatsApp permanecen en SQLite sin
  `wa_message_id` y se muestran con `⚠ No enviado`.
- El botón borrar pide confirmación del navegador y llama a `DELETE
  /api/conversations/:id`.

## 8. Contrato de rutas API

Las rutas de dashboard no tienen autenticación. Deben exponerse únicamente tras
un control de acceso externo (por ejemplo Cloudflare Access o Basic Auth en el
proxy).

| Método y ruta | Entrada | Resultado / reglas |
| --- | --- | --- |
| `GET /api/connection/status` | — | `missing_config`, `connected`, `token_expired` o `error`. Hace `GET` a Graph para estado del número cuando existe configuración. Sin caché. |
| `GET /api/conversations` | — | `{ conversations }`, ordenadas por última actividad. Sin caché. |
| `DELETE /api/conversations/:conversationId` | ID entero positivo | `400`, `404` o `{ ok: true }`. Borra mensajes y luego la conversación. |
| `GET /api/messages/:conversationId` | ID entero positivo | `{ conversation, messages }`; máximo interno de 50 mensajes por defecto. |
| `POST /api/messages/:conversationId` | JSON `{ "content": "..." }` | Requiere modo HUMANO; máximo 4096 caracteres. Guarda antes del envío. Si Meta falla responde `502`, deja el mensaje auditado y señala `outside24h` cuando detecta código `131047`. |
| `POST /api/mode/:conversationId` | JSON `{ "mode": "AI" | "HUMAN" }` | Cambia el modo de la conversación. |
| `GET /api/webhook` | Parámetros `hub.mode`, `hub.verify_token`, `hub.challenge` | Handshake de Meta: devuelve el challenge como `text/plain` si el token coincide, o `403`. |
| `POST /api/webhook` | Payload oficial Meta + `X-Hub-Signature-256` | Valida HMAC SHA-256 sobre el body crudo; devuelve `200 { ok: true }` rápido y procesa en segundo plano. `401` si firma inválida. |
| `GET /api/qr` | — | Comprueba si Supabase está configurado, el bucket existe, es alcanzable y privado. |
| `POST /api/qr` | Bearer `QR_UPLOAD_TOKEN`, `multipart/form-data` | Sube QR de `kind=session` (solo PNG + `sessionId`) o `kind=payment` (PNG/JPEG). Límite 2 MB. Devuelve ruta y URL firmada 5 min. |
| `POST /api/payment-qr/:conversationId` | ID entero positivo | Requiere modo HUMANO; obtiene URL firmada del QR y manda imagen por WhatsApp. |
| `POST /api/orders/:orderId/confirm` | JSON `{ "color": "Amarillo" | "Gris" | "Azul" }` | `orderId` debe ser `TERRA-` más 12 caracteres A–Z/0–9. Confirma color de landing e idempotentemente deja el pedido en `awaiting_location`. |
| `POST /api/orders/:orderId/continue` | Sin body | Activa una única solicitud GPS nativa asociada al pedido. Responde `404`, `409`, `202` si está enviándose, o éxito. |
| `POST /api/order-confirmations` | Bearer `ORDER_CONFIRMATION_TOKEN`; JSON `orderId`, `customerPhone`, `customerName?` | Endpoint para backend de landing/sistema externo. Reserva entrega idempotente y manda el QR de pago. Teléfono: 8–15 dígitos con país; `orderId`: 1–128 alfanumérico/`_`/`-`. |

### Ejemplos seguros de API

No poner tokens reales en terminales compartidas ni documentación pública.

```powershell
# Comprobar si el bucket QR está disponible
Invoke-RestMethod -Method Get http://localhost:3000/api/qr

# Cargar QR de pago desde un entorno confiable
curl.exe -X POST "$env:APP_URL/api/qr" `
  -H "Authorization: Bearer $env:QR_UPLOAD_TOKEN" `
  -F "kind=payment" `
  -F "file=@qr-de-cobro.jpeg;type=image/jpeg"

# Un backend confirma un pedido y provoca el envío idempotente del QR
curl.exe -X POST "$env:CHATBOT_URL/api/order-confirmations" `
  -H "Authorization: Bearer $env:ORDER_CONFIRMATION_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"orderId":"pedido-123","customerPhone":"59170000000","customerName":"Cliente"}'
```

## 9. Comunicación con Meta Cloud API

`src/lib/meta/client.ts` centraliza la comunicación con
`https://graph.facebook.com/{META_GRAPH_VERSION}/{META_PHONE_NUMBER_ID}`.

- Mensaje de texto: `POST /messages`, `type: text`, sin previsualización URL.
- CTA a landing: mensaje interactivo `cta_url` con botón **Ver producto**.
- Selector de color nativo: tres botones `Amarillo`, `Gris`, `Azul`. Se conserva
  por compatibilidad con mensajes heredados.
- Confirmación nativa: botones **Confirmar pedido** y **Cambiar color**; también
  es compatibilidad con el flujo anterior.
- Solicitud GPS: tipo interactivo `location_request_message`, acción
  `send_location`; no abre un navegador ni un `wa.me`.
- QR de pago: mensaje tipo `image` con una URL HTTPS firmada por Supabase y una
  leyenda de pago.
- Diagnóstico: consulta `display_phone_number`, `verified_name` y
  `quality_rating`.
- Los errores de Graph se encapsulan en `MetaGraphError` e incluyen HTTP status
  y código de Meta si existe. Un mensaje se trata como fallo por ventana de 24 h
  cuando su texto contiene el código Meta `131047`.

### Webhook

1. Meta llama `POST /api/webhook`.
2. La ruta lee el texto crudo y valida `X-Hub-Signature-256` comparando HMAC
   SHA-256 en tiempo constante con `META_APP_SECRET`.
3. Si es válido, devuelve `200` inmediatamente y ejecuta
   `processWebhookPayload(...)` sin esperar a terminar.
4. El handler procesa solamente el objeto `whatsapp_business_account`, los
   cambios `messages` y tipos `text`, `interactive`, `location` e `image`.
5. Los eventos se deduplican con `processed_webhook_messages.wa_message_id`.
   Los status de entrega se escriben solo en consola.

Meta debe tener registrado `https://TU_DOMINIO/api/webhook`, suscrito al campo
`messages`, con HTTPS público y el mismo `META_VERIFY_TOKEN` usado localmente.

## 10. Respuestas de IA y reglas comerciales

`src/lib/openai.ts` usa la **Responses API** con:

- modelo `OPENAI_MODEL` o `gpt-5.6-luna`;
- instrucciones en `src/lib/system-prompt.ts`;
- últimos 20 mensajes de la conversación;
- `max_output_tokens: 220`;
- `reasoning: { effort: "none" }`;
- `store: false`.

Antes de reutilizar el historial, descarta respuestas de asistente que parecen
haber expuesto razonamiento interno (patrones como `<think>` o “reasoning
process”).

El system prompt presenta a Terra como asesor comercial de Importadora Terra:

- debe dirigir el chat a venta, reserva, cotización o atención humana;
- vende colchones brasileños, somieres, almohadas, juegos de living, comedores y
  cocinas modulares; entrega en Santa Cruz y envía a Bolivia;
- debe ser breve, evitar inventar precios/stock/plazos y hacer una pregunta por
  vez;
- para el Sillón Lounge debe orientar a la oferta y color;
- nunca puede confirmar manualmente un pedido, pedir GPS/QR/pago por iniciativa
  propia ni aprobar comprobantes;
- debe devolver exclusivamente el texto final para el cliente, sin razonamiento.

El handler añade defensas: si la respuesta de IA menciona GPS, ubicación, pago,
transferencia, comprobante o QR, no la envía y vuelve al flujo controlado de
producto.

## 11. Flujo completo de conversación y pedido

### Flujo vigente: landing desde WhatsApp

```text
Cliente escribe / llega desde campaña
       │
       ▼
Modo IA + primer mensaje, saludo o intención de compra
       │
       ▼
Se crea/reutiliza pedido draft y se envía CTA "Ver producto"
       │
       ▼
/landing.html?order=TERRA-XXXXXXXXXXXX
       │ color elegido + POST .../confirm
       ▼
Pedido awaiting_location (aún sin GPS enviado)
       │ cliente pulsa "Volver al chat" + POST .../continue
       ▼
Solicitud GPS nativa de WhatsApp (una sola vez)
       │ cliente comparte ubicación
       ▼
Pedido awaiting_payment + QR de pago por WhatsApp
       │ cliente envía una imagen
       ▼
Pedido payment_proof_received + mensaje "en revisión"
```

Detalles del flujo:

1. `handleTextMessage` guarda el texto entrante y, en modo IA, detecta primer
   mensaje, saludos de campaña, intención de producto, confirmación escrita o
   mensajes cortos. En esos casos manda la landing sin llamar al modelo.
2. `sendProductLanding` recupera un pedido `draft` existente o crea uno nuevo:
   `TERRA-` + 12 caracteres hexadecimales en mayúscula derivados de UUID. Para
   abrir la oferta requiere que `PUBLIC_APP_URL` empiece con `https://`.
3. La landing estática muestra las tres fotos locales, permite escoger color y
   llama al endpoint `confirm`. No tiene precio, carrito ni datos personales.
4. Tras confirmar, la landing muestra el pedido y el botón **Volver al chat**.
   Este dispara `continue` mediante `sendBeacon`, o `fetch(..., keepalive)` como
   alternativa, antes de cerrar o volver atrás. Nunca usa `wa.me`.
5. `dispatchOrderLocationRequest` reserva la entrega de GPS en una transacción.
   Si otro toque llega durante cinco minutos devuelve “in_progress”; si el GPS
   ya fue enviado devuelve “already_sent”.
6. La ubicación solo se acepta si existe un pedido `awaiting_location` con
   `location_requested = 1`. Entonces se guardan coordenadas/nombre/dirección y
   el pedido pasa a `awaiting_payment`.
7. Después se intenta mandar QR automáticamente. Si Supabase o Graph falla, se
   conserva `awaiting_payment` y se informa que un asesor enviará los datos.
8. Una imagen recibida mientras hay pedido `awaiting_payment` pasa este a
   `payment_proof_received`; la imagen en sí no se descarga ni se almacena y el
   pago no se aprueba automáticamente.

### Flujo heredado de botones nativos

El código soporta botones enviados por versiones anteriores:

- `color:TERRA-...:Amarillo|Gris|Azul` guarda el color y manda confirmación.
- `confirm:TERRA-...` confirma y solicita GPS nativo.
- `colors:TERRA-...` vuelve al selector.

El flujo nuevo inicia por landing, por lo que estas funciones se conservan para
no dejar inservibles mensajes ya enviados a clientes.

### Comportamientos de protección

- Un texto como “sí”, “confirmar” o “listo” no equivale a presionar una
  confirmación nativa.
- Con pedido `draft` activo, todo texto devuelve al CTA de landing; no cae a IA.
- Con pedido `awaiting_location`, recuerda volver a la landing o compartir GPS
  solo después de que se mandó el botón.
- Con pedido `awaiting_payment`, pide comprobante; con `payment_proof_received`,
  informa que está en revisión.
- El comando “Nueva demo”, “Reiniciar” y variantes fuerza un nuevo pedido
  `draft` sin tocar el anterior.

### Endpoint de confirmación externa

`POST /api/order-confirmations` es un flujo independiente pensado para una
landing o backend externo que ya confirmó un pago. No cambia la tabla `orders` a
`payment_confirmed`; usa la tabla `payment_qr_deliveries` para reservar y evitar
duplicar el envío de QR según el `orderId` que entregue ese sistema. Crea o
recupera una conversación por el teléfono indicado y envía el QR.

## 12. Modelo de datos SQLite

Archivo: `data/messages.db`. Las marcas de tiempo están en segundos Unix. Se
inicializa el esquema automáticamente y existe una migración que agrega
`orders.location_requested` si falta en una base creada antes.

### `conversations`

| Columna | Tipo / restricción | Uso |
| --- | --- | --- |
| `id` | INTEGER PK autoincremental | Identificador local. |
| `phone` | TEXT único, no nulo | Teléfono WhatsApp sin formato adicional. |
| `name` | TEXT nullable | Nombre de perfil de Meta. |
| `mode` | `AI` o `HUMAN`, default `AI` | Quién responde. |
| `last_message_at` | INTEGER nullable | Actividad para ordenar. |
| `created_at` | INTEGER, default `unixepoch()` | Fecha de creación. |

### `messages`

| Columna | Tipo / restricción | Uso |
| --- | --- | --- |
| `id` | INTEGER PK autoincremental | Identificador local. |
| `conversation_id` | FK a `conversations` | Dueño de mensaje. |
| `role` | `user`, `assistant` o `human` | Cliente, IA u operador. |
| `content` | TEXT no nulo | Texto/auditoría del evento. |
| `wa_message_id` | TEXT nullable, único cuando existe | Id de Meta; null indica envío local no confirmado. |
| `created_at` | INTEGER | Fecha. |

Índice: `idx_messages_conv(conversation_id, created_at)` e índice único parcial
`idx_messages_wa_id(wa_message_id)` cuando no es nulo.

### `processed_webhook_messages`

| Columna | Uso |
| --- | --- |
| `wa_message_id` (PK) | Reserva/deduplicación de eventos entrantes de Meta. |
| `processed_at` | Fecha de procesamiento. |

### `orders`

| Columna | Uso |
| --- | --- |
| `id` (PK) | Pedido interno como `TERRA-XXXXXXXXXXXX`. |
| `conversation_id` (FK) | Chat de origen. |
| `product_slug`, `product_name` | Producto elegido. |
| `color` | `Amarillo`, `Gris`, `Azul` o null. |
| `status` | `draft`, `awaiting_location`, `awaiting_payment`, `payment_proof_received`, `payment_confirmed`. |
| `location_requested` | 0/1; solo 1 después de enviar con éxito GPS nativo. |
| `latitude`, `longitude`, `location_name`, `location_address` | Datos de entrega, nullable. |
| `created_at`, `updated_at` | Auditoría temporal. |

Índice: `idx_orders_conversation(conversation_id, created_at DESC)`.

El valor `payment_confirmed` está declarado en el tipo y restricción de SQLite,
pero el código actual no lo asigna a ningún pedido.

### `payment_qr_deliveries`

Reserva el envío externo del QR usando `order_id` como clave primaria. Guarda
`phone`, estado `sending|sent|failed`, `wa_message_id`, cantidad de intentos y
fecha. Una reserva `sending` con menos de 300 segundos se considera en proceso;
si falla puede reservarse otra vez.

### `location_request_deliveries`

Una fila por pedido (`order_id` es PK y FK a `orders`) para evitar repetir el
botón GPS. Guarda estado `sending|sent|failed`, id del mensaje Meta, intentos y
fecha. También aplica una ventana de cinco minutos para un envío en curso.

### Operaciones importantes de `db.ts`

- Conversaciones: `getOrCreateConversation`, `getConversationById`,
  `listConversations`, `setMode`, `deleteConversation`.
- Mensajes: `insertMessage`, `updateMessageWaId`, `getMessages` (1–200; ruta usa
  50), `getRecentHistory` (1–100; IA usa 20).
- Webhooks: `wasMessageProcessed`, `markMessageProcessed` (`INSERT OR IGNORE`).
- Pedidos: crear draft, color, confirmar, pedir GPS, guardar ubicación y marcar
  comprobante.
- Idempotencia: reservas/complete/fail separadas para QR y ubicación.

## 13. QR de Supabase

- El bucket debe ser privado. `GET /api/qr` falla si Supabase indica que es
  público.
- Los QR de sesión se guardan en `sessions/{sessionId}.png`, donde `sessionId`
  tiene 1–64 caracteres alfanuméricos, `_` o `-`.
- El QR de pago se sobrescribe en `SUPABASE_PAYMENT_QR_PATH` (por defecto
  `payment-qr.jpeg`).
- Tamaño máximo: 2 MB. QR de sesión: solo PNG; QR de pago: PNG o JPEG.
- Después de cargar u obtener QR de pago, se genera una URL firmada válida por
  cinco minutos. La secret key de Supabase no sale del servidor.
- `sendPaymentQr` registra “QR de pago enviado.” como mensaje de rol `human`,
  luego lo envía como imagen a WhatsApp y actualiza su `wa_message_id`.
- El botón manual de dashboard requiere modo HUMANO; el flujo automático de
  pedido puede mandar QR en modo IA.

## 14. Despliegue y operación

### Desarrollo local

```powershell
npm install
npm run dev
# Abrir http://localhost:3000

# Para recibir webhooks de Meta en desarrollo
ngrok http 3000
```

Registrar después la URL HTTPS del túnel como `https://TU_URL/api/webhook` en
Meta. Para probar el handshake sin Meta:

```text
http://localhost:3000/api/webhook?hub.mode=subscribe&hub.verify_token=TU_TOKEN&hub.challenge=prueba
```

Debe responder `prueba` en texto plano. Un `403` normalmente indica que el
verify token no coincide; un `401` ante POST suele indicar secreto de app o
firma incorrecta.

### EasyPanel/Nixpacks

`nixpacks.toml` establece:

1. Node 22, npm 10, Python 3, gcc y gnumake (necesarios para módulos nativos).
2. `npm ci --include=dev`.
3. `npm run build`.
4. `npm run start`.

`Procfile` define `web: npm run start`. En EasyPanel hay que configurar todas
las variables y montar un volumen persistente en **`/app/data`**, porque allí
vive la base SQLite. Activar HTTPS antes de configurar el webhook en Meta.

### Copia/backup de la base

Para conservar conversaciones y pedidos, detener la aplicación y copiar juntos:

```text
data/messages.db
data/messages.db-wal
data/messages.db-shm
```

Copiar solo `messages.db` mientras WAL está activo puede perder cambios aún no
consolidados. Para un backup más robusto, detener el proceso antes de la copia o
usar la funcionalidad de backup SQLite. Tratar estos archivos como datos
personales y no subirlos a un repositorio público.

## 15. Seguridad, privacidad y riesgos conocidos

### Controles presentes

- Firma HMAC SHA-256 de Meta verificada en tiempo constante.
- `QR_UPLOAD_TOKEN` y `ORDER_CONFIRMATION_TOKEN` comparados en tiempo constante.
- Secreto de Supabase y clave OpenAI se utilizan solo en runtime servidor.
- QR almacenados en bucket privado y enlazados temporalmente.
- Webhooks y envíos de ubicación/QR tienen deduplicación o reservas para evitar
  duplicados comunes.
- Respuestas OpenAI se piden con `store: false`.

### Riesgos o límites que deben priorizarse

1. **Dashboard sin autenticación:** cualquier persona que alcance las rutas
   internas puede leer/borrar chats, cambiar modo y enviar mensajes. Proteger
   antes de publicar con Cloudflare Access, Basic Auth de proxy u otra capa.
2. **Datos locales personales:** SQLite contiene teléfonos, nombres, mensajes y
   posiblemente coordenadas. Definir política de retención, backups cifrados y
   procedimiento de eliminación.
3. **Borrado de chats con pedidos:** `deleteConversation` borra mensajes y luego
   intenta borrar la conversación, pero no borra los pedidos relacionados. Como
   SQLite tiene foreign keys activas y `orders.conversation_id` no usa `ON DELETE
   CASCADE`, una conversación con pedidos podría producir un error de integridad
   en lugar de borrarse. Revisar y cubrir este caso antes de depender del botón
   Borrar en producción.
4. **No hay aprobación real de pago:** una imagen cambia el pedido a
   `payment_proof_received`; no hay interfaz ni endpoint que valide y cambie el
   pedido a `payment_confirmed`.
5. **Alto volumen:** no existen cola persistente, worker separado, reintentos
   estructurados ni observabilidad más allá de `console.log`/`console.error`.
6. **Ventana WhatsApp de 24 h:** texto libre e imágenes pueden fallar con
   `131047` fuera de la ventana. Las plantillas de Meta no están implementadas.
7. **Soporte de medios limitado:** maneja texto, botones interactivos, ubicación
   e imagen entrante como comprobante; no descarga ni interpreta las imágenes y
   no cubre audio, documentos, video, stickers o grupos.
8. **`PUBLIC_APP_URL`:** si no es HTTPS válido, el bot crea/reutiliza un pedido
   draft pero no puede enviar la landing; el cliente ve un aviso de falta de URL
   pública segura.
9. **Endpoint de confirmación externa:** depende de que el sistema llamador
   mantenga secreto su bearer token y respete idempotencia de `orderId`.

## 16. Mejoras ya mencionadas por el proyecto

El README identifica explícitamente estas mejoras futuras:

- cola persistente y workers separados para cargas altas;
- plantillas WhatsApp para reabrir conversaciones fuera de 24 horas;
- soporte de audio, imágenes, documentos, ubicaciones y grupos;
- autenticación y auditoría de operadores.

Además, por el análisis del código, faltaría diseñar la aprobación de pago y
resolver el borrado de conversaciones con pedidos antes de ampliar el uso real.

## 17. Procedimiento para continuar desde otra cuenta

1. Copiar el código completo o, preferiblemente, inicializar un repositorio Git
   privado y subirlo sin `node_modules`, `.next`, `data` ni `.env.local`.
2. En el nuevo entorno ejecutar `npm ci` (hay `package-lock.json`) y comprobar
   `npm run lint`, `npx tsc --noEmit` y `npm run build`.
3. Recrear `.env.local` desde `.env.example` por un canal seguro. No pegar
   tokens en la conversación con el agente.
4. Si hay que preservar historial, transferir la base SQLite con la aplicación
   detenida, incluidos WAL y SHM. Si no se necesita histórico, iniciar con
   `data/` vacío y dejar que la app cree el esquema.
5. Confirmar que Meta apunta al nuevo dominio HTTPS y que `PUBLIC_APP_URL`
   coincide exactamente con él.
6. Probar el handshake, `/api/connection/status`, `/api/qr`, un chat de prueba y
   el flujo completo de pedido antes de abrir al público.
7. Añadir una capa de autenticación al dashboard antes de exponerlo en Internet.
8. Rotar cualquier credencial que pueda haberse expuesto durante la migración.

## 18. Prompt listo para la nueva cuenta

Pegar este texto como primer pedido, adjuntando o dejando disponible la carpeta
del proyecto y este documento:

```text
Voy a continuar el proyecto Terra App (agente de WhatsApp) desde esta carpeta.
Lee completo CONTEXTO_CONTINUACION.md, README.md y AGENTS.md antes de actuar.
Después inspecciona el código relacionado con mi objetivo para verificar que el
estado documentado sigue siendo correcto. No muestres, modifiques, subas ni me
pidas los valores de .env.local ni los datos de data/messages.db.

Este proyecto usa Next.js 16. Antes de cambiar código de Next, consulta la
documentación local exigida por AGENTS.md. Conserva los flujos de Meta, OpenAI,
Supabase y SQLite, salvo que mi objetivo indique expresamente cambiarlos.

Mi objetivo concreto es: [ESCRIBIR AQUÍ LA PRÓXIMA TAREA].

Antes de implementar, explícame brevemente qué entendiste, qué archivos
necesitarías modificar, cómo evitarás romper el flujo de pedido y qué decisión
requeriría mi confirmación. Luego implementa, prueba con lint, TypeScript y las
verificaciones que correspondan, y entrégame un resumen con los archivos
afectados. No borres conversaciones, pedidos ni datos locales salvo que lo
solicite explícitamente.
```

Ejemplos válidos para sustituir el objetivo:

- “Añadir autenticación segura al dashboard sin bloquear el webhook de Meta.”
- “Implementar una aprobación manual de comprobantes y el estado
  `payment_confirmed`.”
- “Corregir el borrado de conversaciones que tienen pedidos, preservando la
  integridad de datos.”
- “Crear plantillas de WhatsApp para mensajes fuera de la ventana de 24 horas.”
