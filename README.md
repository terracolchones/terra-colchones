# Agente de WhatsApp

Dashboard local para un número real de WhatsApp conectado mediante la API oficial de Meta Cloud API. Guarda las conversaciones en SQLite y responde con la API oficial de OpenAI cuando cada conversación está en modo **IA**. En modo **HUMANO**, un operador puede responder desde el dashboard.

No usa QR, WhatsApp Web, Baileys, Twilio, Redis, Prisma, WebSockets ni un proceso bot separado.

Si conectas un proceso externo que sí genere códigos QR, el proyecto puede guardarlos en
Supabase Storage mediante el endpoint privado `POST /api/qr`. Esto no cambia la conexión
oficial de Meta Cloud API de esta aplicación.

## Requisitos

- Node.js 22 o superior (el proyecto incluye `.nvmrc` con 22).
- Una app de Meta con el producto WhatsApp configurado.
- Una clave de API de OpenAI con créditos.
- Un dominio HTTPS público para recibir webhooks en producción. Para desarrollo local, ngrok o Cloudflare Tunnel.

## Inicio rápido

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Copia el archivo de variables y complétalo. En PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Inicia el dashboard:

   ```bash
   npm run dev
   ```

4. Abre [http://localhost:3000](http://localhost:3000). Si falta algo, aparecerá la pantalla **Configura tu API de WhatsApp** y cambiará automáticamente al dashboard apenas la configuración sea válida.

5. En otra terminal, expón el servidor durante el desarrollo:

   ```bash
   ngrok http 3000
   ```

   Copia la URL HTTPS entregada por ngrok y registra `https://TU_URL/api/webhook` en el panel de Meta.

## Variables de entorno

```dotenv
# Meta WhatsApp Cloud API
META_ACCESS_TOKEN=EAAG...
META_PHONE_NUMBER_ID=1234567890
META_WABA_ID=1234567890
META_APP_SECRET=abcdef...
META_VERIFY_TOKEN=elige-un-token-aleatorio
META_GRAPH_VERSION=v25.0
# URL HTTPS del agente (dashboard y /api/webhook)
PUBLIC_APP_URL=https://agente.tu-dominio.example
# URL HTTPS canónica del catálogo que se envía a clientes
CATALOG_PUBLIC_URL=https://tu-dominio.example

# OpenAI API oficial
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.6-luna

# Almacenamiento privado de QR en Supabase
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_QR_BUCKET=chatbot-qr
SUPABASE_PAYMENT_QR_PATH=payment-qr.jpeg
QR_UPLOAD_TOKEN=token-aleatorio-largo-compartido-con-el-generador-qr
ORDER_FLOW_TOKEN=token-aleatorio-largo-compartido-con-el-catalogo
```

- `META_ACCESS_TOKEN` debe ser un **System User Token permanente**. Los tokens de prueba de Meta duran 24 horas y no sirven para producción.
- `META_PHONE_NUMBER_ID` identifica el número desde el que se envían los mensajes.
- `META_WABA_ID` se conserva como referencia de la cuenta de WhatsApp Business; esta primera versión no necesita usarlo en requests.
- `META_APP_SECRET` está en **App Dashboard → Settings → Basic** y es obligatorio para validar cada webhook.
- `META_VERIFY_TOKEN` lo eliges tú. Debe coincidir exactamente con el valor configurado en Meta al crear el webhook.
- `META_GRAPH_VERSION` está en `v25.0`, la versión ofrecida actualmente por el panel de pruebas de Meta. Revisa las versiones admitidas por Meta periódicamente.
- `PUBLIC_APP_URL` es la URL HTTPS permanente del agente; Meta debe usar `${PUBLIC_APP_URL}/api/webhook` como callback.
- `CATALOG_PUBLIC_URL` permite que el agente envíe el catálogo público aunque esté alojado en un dominio distinto. Si se omite, se conserva el destino histórico `${PUBLIC_APP_URL}/catalogo`.
- El catálogo toma el número de compra del número activo que devuelve Meta para `META_PHONE_NUMBER_ID`, para que no se desvíe de un Test Number. `TERRA_WHATSAPP_PHONE` es solo un respaldo opcional si ese diagnóstico no puede consultar Graph; debe contener únicamente dígitos con código de país. La antigua variable `NEXT_PUBLIC_TERRA_WHATSAPP_PHONE` se admite por compatibilidad, pero no se recomienda porque queda incorporada al bundle al compilar.
- `OPENAI_API_KEY` es la clave de la API oficial de OpenAI; nunca la expongas al navegador ni la subas a Git.
- `OPENAI_MODEL` por defecto es `gpt-5.6-luna`, adecuado para alto volumen y coste contenido. Puedes establecer `gpt-5.6-terra` si prefieres mayor calidad. Consulta los [modelos de OpenAI](https://developers.openai.com/api/docs/models) para comparar capacidades y precios.
- `SUPABASE_SECRET_KEY` es una clave secreta de servidor: no la expongas al navegador, no la envíes por chat y no la subas a Git. Es distinta de la clave publicable.
- `QR_UPLOAD_TOKEN` protege el endpoint de carga. Usa un valor aleatorio largo distinto de las demás claves.
- `DASHBOARD_BASIC_AUTH_USER` y `DASHBOARD_BASIC_AUTH_PASSWORD` protegen el dashboard de operadores y `/catalogo-admin` mediante HTTP Basic Auth. Usa una contraseña aleatoria de al menos 32 caracteres y no reutilices ninguna otra clave. Si falta cualquiera de las dos, esas rutas quedan cerradas con `503`; `/api/webhook` no usa Basic Auth para que Meta pueda verificarlo y enviar eventos firmados.

## QR en Supabase Storage

1. Crea o selecciona un proyecto en Supabase y, en **Storage**, crea el bucket privado `chatbot-qr` (no actives la opción pública).
2. En **Connect** o **Settings → API Keys**, copia la URL del proyecto y crea/copia una **Secret key** (`sb_secret_...`). Guárdalas en las variables anteriores junto con un `QR_UPLOAD_TOKEN` aleatorio.
3. Comprueba la conexión con `GET /api/qr`. Debe responder `{"configured":true,"reachable":true,"bucket":"chatbot-qr"}`.

Para subir el QR de cobro que el operador enviará mediante el botón **Enviar QR de pago** en una conversación en modo HUMANO:

```bash
curl -X POST "$APP_URL/api/qr" \
  -H "Authorization: Bearer $QR_UPLOAD_TOKEN" \
  -F "kind=payment" \
  -F "file=@qr-de-cobro.jpeg;type=image/jpeg"
```

Un proceso que genere un QR PNG dinámico puede actualizar el código de una sesión así:

```bash
curl -X POST "$APP_URL/api/qr" \
  -H "Authorization: Bearer $QR_UPLOAD_TOKEN" \
  -F "sessionId=principal" \
  -F "file=@qr.png;type=image/png"
```

La respuesta devuelve una URL firmada válida por cinco minutos. Los QR se sobrescriben por sesión, se mantienen privados y no se guardan en el navegador. Al enviar un QR de pago, WhatsApp descarga esa URL temporal directamente desde Supabase; el dashboard solo conserva el registro “QR de pago enviado”.

## Confirmación desde el catálogo

El servidor del catálogo crea el pedido en `POST /api/catalog-orders` del agente,
autenticado con `X-Terra-Order-Token`. Recibe un código público opaco y abre
WhatsApp con `Hola Terra, confirmo mi pedido #T-7Q4K-8M2P`. El webhook firmado del
cliente confirma y vincula el pedido antes de solicitar GPS y después enviar QR.
El enlace privado conserva la asociación cuando la compra comenzó por chat.

Desde esta liberación, `POST /api/order-confirmations` está retirado: devuelve
`410 Gone` a los consumidores autenticados y no lee datos del cliente, abre
SQLite ni envía mensajes. La autenticación histórica sigue fallando cerrada si
falta `ORDER_CONFIRMATION_TOKEN`; no hace falta crear esa variable para la
integración actual. Se conservan las tablas y reservas históricas.

## Configuración de Meta

1. Entra a [Meta for Developers](https://developers.facebook.com/) y crea una app de tipo Business.
2. Agrega el producto **WhatsApp** y vincula/registra tu número.
3. Copia Phone Number ID, WABA ID y App Secret a `.env.local`.
4. Desde Business Settings genera un **System User Token** permanente con los permisos necesarios para WhatsApp y cópialo como `META_ACCESS_TOKEN`.
5. En WhatsApp → Configuration, registra la URL `https://TU_DOMINIO/api/webhook` y el mismo valor de `META_VERIFY_TOKEN`.
6. Suscribe el webhook al campo `messages`.

El dashboard también comprueba que `PUBLIC_APP_URL/api/webhook` sea alcanzable públicamente, sin enviar el `META_VERIFY_TOKEN` real. Si aparece una alerta de webhook, crea o recupera un dominio HTTPS activo, actualiza `PUBLIC_APP_URL` y registra la misma URL en Meta antes de probar mensajes entrantes. Si el catálogo vive en otro dominio, configura también `CATALOG_PUBLIC_URL`.

La verificación inicial de Meta usa:

```text
GET /api/webhook?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
```

La aplicación devuelve el `hub.challenge` como `text/plain`, tal como exige Meta.

## Funcionamiento

- `POST /api/webhook` valida `X-Hub-Signature-256` mediante HMAC SHA-256 calculado sobre el body crudo.
- Responde `200` inmediatamente para evitar reintentos por timeout de Meta y procesa el evento de forma asíncrona.
- Cada mensaje se deduplica por su `wa_message_id` antes de llamar a OpenAI o responder a WhatsApp.
- Los saludos y solicitudes de catálogo reciben el CTA. Una consulta concreta, aunque sea el primer mensaje, puede responderse con conocimiento aprobado sin exigir una compra.
- Las conversaciones y pedidos viven en `data/messages.db`. La configuración editable usa `data/agent-behavior.db` (o `TERRA_BEHAVIOR_DB_PATH`), también con SQLite y modo WAL.
- En modo **IA**, se minimizan los últimos 20 mensajes y se consulta la [Responses API](https://developers.openai.com/api/reference/responses/create) con la versión publicada del prompt, el contexto comercial y las fuentes recuperadas. Las respuestas se solicitan con `store: false`.
- En modo **HUMANO**, el dashboard envía el texto directamente a Graph API y conserva un mensaje con icono de error si el envío falla.

Personaliza el comportamiento en `/comportamiento`: guardar conserva un borrador;
publicar activa su versión para la siguiente consulta al modelo. Las instrucciones
iniciales viven en `src/lib/system-prompt.ts`; las protecciones de transporte,
HUMANO y pagos permanecen en código. El simulador está identificado como ficticio.

## Límite de 24 horas de WhatsApp

WhatsApp permite texto libre únicamente dentro de las 24 horas posteriores al último mensaje del cliente. Si un operador intenta contestar fuera de esa ventana, Graph API puede devolver el error `131047`. El dashboard muestra el aviso correspondiente y deja el mensaje local marcado como no enviado.

Las plantillas preaprobadas de WhatsApp quedan fuera del alcance de esta versión.

## Desarrollo y comprobaciones

```bash
npx tsc --noEmit
npm run build
npm run dev
```

Para probar el handshake sin Meta, visita:

```text
http://localhost:3000/api/webhook?hub.mode=subscribe&hub.verify_token=TU_TOKEN&hub.challenge=prueba
```

Debe devolver `prueba` como texto plano. Un `403` significa que el `META_VERIFY_TOKEN` no coincide. Un `401` al recibir un POST normalmente indica que `META_APP_SECRET` es incorrecto o que alguien cambió el body antes de calcular la firma.

## Despliegue en EasyPanel

El proyecto incluye `Procfile`, `nixpacks.toml` y `.nvmrc` para una única aplicación Next.js:

```text
web: npm run start
```

- Configura todas las variables de entorno en EasyPanel.
- Agrega un volumen persistente montado en `/app/data`; allí viven `messages.db` y `agent-behavior.db`. Respalda ambas con un método consistente con SQLite/WAL y comprueba restauración; un respaldo de Git no contiene estos datos.
- Activa HTTPS antes de registrar el webhook: Meta no acepta URLs HTTP públicas.
- El build usa `npm ci --include=dev` y el arranque usa `npm run start`.

## Seguridad

El webhook está protegido por firma HMAC. El dashboard de operadores y sus APIs sensibles usan HTTP Basic Auth configurado con `DASHBOARD_BASIC_AUTH_USER` y `DASHBOARD_BASIC_AUTH_PASSWORD`, además de una comprobación dentro de cada API sensible. Mantén esas credenciales sólo en el gestor de secretos del servidor, usa HTTPS y añade Cloudflare Access o una capa equivalente cuando sea posible. El webhook `/api/webhook` queda deliberadamente fuera de Basic Auth porque Meta debe poder verificarlo y enviar eventos firmados.

## Mejoras pendientes

- Cola persistente y workers separados para cargas altas.
- Plantillas de WhatsApp para reabrir conversaciones fuera de la ventana de 24 horas.
- Soporte para audio, imágenes, documentos, ubicaciones y grupos.
- Autenticación y auditoría de operadores del dashboard.
