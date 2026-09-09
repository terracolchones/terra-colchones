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
Bienvenida Terra → Ver catálogo → producto y variante → Confirmar pedido

Llegada desde WhatsApp:
  enlace privado al catálogo → pedido vinculado al mismo chat → Volver a WhatsApp

Llegada directa al catálogo:
  pedido pendiente → WhatsApp: “Hola Terra, confirmo mi pedido #T-7Q4K-8M2P”

Agente:
  GPS nativo → ubicación → QR de pago → comprobante → en revisión
```

El cliente nunca debe ver UUIDs, IDs de producto o de variantes. El código corto
del pedido solo vincula la conversación con un pedido ya registrado.

## Propiedad de los datos

- El catálogo obtiene productos y variantes desde su almacenamiento de catálogo.
- El agente conserva la conversación, el pedido asociado, las transiciones de
  estado y los envíos de WhatsApp.
- El QR se almacena de forma privada y se envía desde el agente.
- La comunicación entre servicios debe ser de servidor a servidor y validada.
  El navegador no recibe secretos ni acceso a la base del agente.

## Operación y recuperación

Antes del siguiente desarrollo se crearon estos puntos Git locales:

| Área | Punto de restauración | Commit protegido |
| --- | --- | --- |
| Catálogo | `codex/safety-before-order-flow-catalog-3a846b4` | `3a846b4` |
| Agente | `codex/safety-before-order-flow-agent-c5a0672` | `c5a0672` |

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
