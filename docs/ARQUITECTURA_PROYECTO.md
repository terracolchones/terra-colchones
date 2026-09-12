# Arquitectura operativa de Terra

## Propósito

Este documento evita que se confundan el catálogo público y el agente real de
WhatsApp. Describe la estructura comprobada el 9 de septiembre de 2026 y no
contiene secretos, datos de clientes ni configuración privada.

## Dos servicios, una experiencia de compra

| Servicio | EasyPanel | Responsabilidad | Dominio | Código de trabajo |
| --- | --- | --- | --- |
| Catálogo | `terra-catalogo / catalogo` | Productos, variantes, precios, página pública y confirmación del producto. | `terracolchonesymuebles.online` | `E:\Terra App\01` |
| Agente | `agentevps / agente` | Webhook Meta, mensajes, OpenAI/RAG, GPS, QR, comprobantes, pedidos y panel de operadores. | `agente.terracolchonesymuebles.online` | `E:\Terra App\agent-production-worktree` |

El catálogo se despliega desde `main`. El agente se despliega desde
`agent-production`; ambas ramas fueron confirmadas en **EasyPanel → Source** el
9 de septiembre de 2026.

## Qué no se debe confundir

- El panel del agente real está en `agente.terracolchonesymuebles.online`.
- La ruta `/panel-agente` del catálogo no es una fuente válida para diagnosticar
  el estado del agente; solo remite al panel real.
- Cada servicio puede estar desplegado con su propio volumen y su propia copia
  de código. Un cambio en el catálogo no modifica automáticamente el webhook ni
  la SQLite del agente.

## Flujo objetivo de compra

```text
Bienvenida Terra → Ver catálogo → producto, variante exacta (opción + color) → Confirmar pedido

Llegada desde WhatsApp:
  enlace privado al catálogo → pedido vinculado al mismo chat → Confirmar pedido abre WhatsApp

Llegada directa al catálogo:
  Confirmar pedido crea el pedido y abre WhatsApp directamente con:
  “Hola Terra, confirmo mi pedido #T-7Q4K-8M2P”

Agente:
  GPS nativo → ubicación → QR de pago → comprobante → en revisión
```

El cliente nunca debe ver UUIDs, IDs de producto o de variantes. El código corto
del pedido solo vincula la conversación con un pedido ya registrado.

## Contrato implementado entre servicios

El catálogo valida producto, variante, color y precio contra su fuente propia. Un
producto es la familia que conserva categoría, descripción y detalles técnicos.
Cada versión es una ficha pública propia con enlace, nombre, precio, código,
color y/o texto selector y galería opcional. Al elegirla, cambia la URL, el
nombre, el precio, el código y la galería; si no cargó fotos, conserva como
respaldo las fotos generales de la familia.
Después llama desde el servidor a `POST /api/catalog-orders` del agente. El agente crea
un pedido con un código público como `T-7Q4K-8M2P`; el navegador no conoce IDs
internos, teléfonos ni acceso a SQLite.

- En el catálogo: `ORDER_FLOW_AGENT_URL` apunta al agente y `ORDER_FLOW_TOKEN`
  es privado.
- En el agente: el mismo `ORDER_FLOW_TOKEN` protege la creación de pedidos.
- No se deben configurar como `NEXT_PUBLIC_*` ni incluir en enlaces, mensajes o
  repositorios.
- El agente añade un token opaco de duración limitada al CTA del catálogo para
  reconocer el chat de origen, pero el GPS solo sale al recibir la confirmación
  corta desde WhatsApp.

## Propiedad de los datos

- El catálogo obtiene productos y variantes desde su almacenamiento de catálogo.
- El agente conserva la conversación, el pedido asociado, las transiciones de
  estado y los envíos de WhatsApp.
- El QR se almacena de forma privada y se envía desde el agente.
- La comunicación entre servicios debe ser de servidor a servidor y validada.
  El navegador no recibe secretos ni acceso a la base del agente.

## Operación y recuperación

### Corrección del destino comercial y disponibilidad — 12 de septiembre de 2026

- Servicio comprobado en EasyPanel: `terra-catalogo / catalogo`, repositorio
  `terracolchones/terra-colchones`, rama `main`, Nixpacks. Base remota comprobada:
  `643856d80b3d2e5e5efa78695e5022de6ee3d139`.
- Respaldo: `codex/safety-before-catalog-checkout-20260912` sobre esa base.
  Implementación aislada: `codex/catalog-checkout-official-20260912`, worktree
  `E:\Terra App\catalog-checkout-20260912`.
- El número comercial se comprobó mediante una consulta de solo lectura a Meta
  desde `agentevps / agente`: respuesta 200, nombre Terra y calidad GREEN.
  No se consultaron conversaciones ni la base SQLite.
- El catálogo tenía configurado un número de prueba. Se sustituyó únicamente
  `TERRA_WHATSAPP_PHONE` por el número comercial verificado y EasyPanel confirmó
  `Env updated`. Los números y credenciales no se copian a esta documentación.
- El 12 de septiembre de 2026 el usuario autorizó expresamente publicar las
  correcciones y desplegar únicamente `terra-catalogo / catalogo`, después de
  que la revisión automática pidiera esa confirmación. El número guardado en
  EasyPanel se aplica con ese despliegue; no se modifica el servicio del agente.
- El código del catálogo toma el destino de `TERRA_WHATSAPP_PHONE` (o de la
  variable pública anterior por compatibilidad); ya no consulta Meta desde el
  catálogo ni utiliza un número fijo de respaldo. La configuración inválida
  desactiva la compra en vez de enviarla a otro canal.
- La disponibilidad de la versión seleccionada se utiliza tanto en la interfaz
  como al validar el pedido. La disponibilidad de familia solo se usa si no hay
  versión. No se puede omitir una variante activa para saltar su validación.
- Se conservan Comprar rojo y Confirmar pedido verde. Las opciones Próximamente
  o agotadas explican su estado y desactivan Comprar antes de intentar el pedido.
  No se ha alterado stock en Supabase.
- En la web pública se observaron un producto con nombre de prueba y descripción
  Lorem Ipsum en Prince 3P. Son contenido de catálogo pendiente de revisión
  comercial; no se inventaron descripciones ni existencias.
- Validación: 30 pruebas en 7 archivos, ESLint, TypeScript y build de Next.js
  16.3.4 aprobados. La compilación final usa dependencias locales independientes;
  Turbopack no aceptaba el enlace inicial de dependencias entre worktrees.
  Se probó el flujo rojo/verde y el reinicio al cambiar de variante en navegador,
  además del aviso y botón desactivado para Próximamente a 390 × 844. Solo se
  utilizaron datos de demostración locales y mocks para crear pedidos; no se
  enviaron mensajes ni se generaron pedidos reales durante la verificación.

Antes del siguiente desarrollo se crearon estos puntos Git locales:

| Área     | Punto de restauración                                     | Commit protegido                           |
| -------- | --------------------------------------------------------- | ------------------------------------------ |
| Catálogo | `codex/safety-before-order-flow-catalog-3a846b4`          | `3a846b4`                                  |
| Agente   | `codex/safety-before-order-flow-agent-c5a0672`            | `c5a0672`                                  |
| Catálogo | `codex/safety-before-qr-recovery-catalog-e1083cd`         | `e1083cd`                                  |
| Agente   | `codex/safety-before-qr-recovery-agent-99a8441`           | `99a8441`                                  |
| Catálogo | `codex/safety-before-desktop-layout-cabd77b`              | `cabd77b`                                  |
| Agente   | `codex/safety-before-rag-scale-agent-1f675ba`             | `1f675baa1078b0f247dbd7016433d659723ba731` |
| Catálogo | `codex/backup-catalog-storage-20260910`                   | `0f372a0`                                  |
| Catálogo | `codex/catalog-before-color-swatches-20260910`            | `fd01c40`                                  |
| Catálogo | `codex/catalog-before-variant-galleries-20260910`         | `d98e53e`                                  |
| Catálogo | `codex/catalog-before-simplified-variant-editor-20260910` | `dfe6bd9`                                  |
| Catálogo | `codex/catalog-before-public-variant-pages-20260910`      | `3b065c4`                                  |

Las ramas de trabajo son `codex/order-flow-catalog` y
`codex/order-flow-agent`. Los cambios locales no confirmados ajenos a esta tarea
se conservan intactos y no forman parte de los puntos de restauración.

Para cualquier cambio delicado:

1. Confirmar el servicio propietario de la función.
2. Revisar estado Git y crear un punto de restauración específico.
3. Cambiar ambos servicios solo si la función cruza catálogo y agente.
4. Ejecutar pruebas, TypeScript, lint y build en cada servicio afectado.
5. Verificar la fuente de EasyPanel antes de desplegar; nunca desplegar desde el
   servicio equivocado.
