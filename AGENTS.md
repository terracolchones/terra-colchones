<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Terra: arquitectura y reglas operativas

## Servicios reales

Terra opera dos aplicaciones Next.js separadas. Nunca diagnosticar ni modificar
el agente desde el catálogo, ni asumir que una ruta visual del catálogo representa
el servicio de WhatsApp.

| Servicio | EasyPanel | Dominio y función | Copia local | Línea de despliegue |
| --- | --- | --- | --- |
| Catálogo | `terra-catalogo / catalogo` | Sitio público, catálogo y confirmación de producto. `https://terracolchonesymuebles.online` | `E:\Terra App\01` | `main` |
| Agente | `agentevps / agente` | Webhook Meta, WhatsApp, OpenAI/RAG, GPS, QR, comprobantes y panel real. `https://agente.terracolchonesymuebles.online` | `E:\Terra App\agent-production-worktree` | Baseline local: `agent-production`; comprobar el campo **Source** de EasyPanel antes de desplegar. |

La ruta `/panel-agente` del catálogo solo dirige al panel real; no es una copia
válida para diagnosticar la operación del agente.

## Trabajo seguro

- Antes de cambiar código, inspeccionar `git status`, la rama y `git worktree
  list`; comprobar qué servicio posee cada responsabilidad.
- Trabajar en ramas `codex/` separadas para catálogo y agente. No desarrollar
  directamente sobre una rama configurada para producción.
- Antes de una modificación delicada, crear un punto Git recuperable en la rama
  correspondiente y anotar su nombre en la documentación. Nunca incluir, borrar
  ni sobrescribir cambios locales ajenos para crear ese respaldo.
- Guardar cada avance funcional en un commit enfocado y actualizar
  `docs/ARQUITECTURA_PROYECTO.md` cuando cambie la relación entre servicios,
  despliegues o el flujo de compra.
- No desplegar, no cambiar variables de EasyPanel y no modificar Meta, Supabase o
  producción sin una solicitud explícita del usuario y una verificación final del
  servicio correcto.
- No pedir al usuario datos que puedan verificarse en el repositorio, Git, los
  worktrees, la configuración disponible o las fuentes ya documentadas. Registrar
  decisiones y supuestos comprobables para que el siguiente agente no repita el
  análisis.

## Frontera entre catálogo y agente

- El catálogo muestra productos y recoge la confirmación; no debe intentar
  escribir directamente en la SQLite local del agente.
- El agente es dueño del chat de WhatsApp, pedidos vinculados al cliente, estados
  de GPS/pago/comprobante y los mensajes enviados por Meta.
- Cualquier flujo entre ambos servicios debe usar una comunicación de servidor
  validada y con identificadores opacos; nunca UUIDs, identificadores internos o
  secretos visibles para el cliente.

## Flujo de pedido acordado

1. Bienvenida breve de Terra y CTA **Ver catálogo**.
2. El cliente elige producto y variante y confirma desde el catálogo.
3. Si llegó desde WhatsApp, el enlace privado vincula la confirmación a su chat.
   Si llegó directamente al sitio, WhatsApp abre con el mensaje corto
   `Hola Terra, confirmo mi pedido #T-7Q4K-8M2P`.
4. El agente registra el pedido, envía una única solicitud GPS nativa, recibe la
   ubicación, envía el QR y deja el comprobante en revisión. Nunca aprueba el pago
   automáticamente.
5. El agente solo pasa el chat a HUMANO cuando el cliente lo solicita de forma
   explícita. El interruptor manual del panel se conserva para el equipo.

## Privacidad y verificación

- Nunca leer, mostrar, modificar ni versionar `.env.local`, secretos, teléfonos,
  coordenadas, conversaciones, comprobantes ni la base `data/messages.db`.
- Probar cambios con pruebas unitarias, TypeScript, lint y build en cada servicio
  afectado. Las integraciones reales de Meta y Supabase se verifican sin exponer
  credenciales.
