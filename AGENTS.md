<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Terra: servicio del agente de WhatsApp

Este repositorio corresponde al agente real de EasyPanel `agentevps / agente`:
webhook de Meta, WhatsApp, OpenAI/RAG,
GPS, QR, comprobantes y panel de operadores. Su dominio operativo es
`https://agente.terracolchonesymuebles.online`.

El catálogo público vive en un servicio distinto, `terra-catalogo / catalogo`,
con copia local en `E:\Terra App\01` y despliegue desde `main`. Nunca usar la
ruta o el panel del catálogo para diagnosticar este agente.

## Reglas de trabajo

- Antes de cambios delicados, comprobar rama, worktree y estado Git; crear un
  punto recuperable `codex/safety-*` sin incluir cambios locales ajenos.
- Trabajar en ramas `codex/`; no modificar directamente la línea de despliegue.
- Este servicio es dueño de las conversaciones, los pedidos vinculados a chats,
  GPS, QR y comprobantes. El catálogo solo puede comunicarse con él mediante una
  interfaz de servidor validada; nunca mediante su SQLite local.
- El modo HUMANO automático solo se activa cuando el cliente lo pide
  explícitamente. El equipo conserva el control manual del panel.
- No leer ni exponer `.env.local`, datos de `data/`, teléfonos, ubicaciones o
  comprobantes. No desplegar ni cambiar Meta, EasyPanel o Supabase sin petición
  explícita y verificación final.
- Actualizar `E:\Terra App\01\docs\ARQUITECTURA_PROYECTO.md` cuando una
  modificación afecte el contrato entre catálogo y agente.

## Lectura mínima de estabilidad

Antes de modificar el agente, leer
[docs/GUIA_MINIMA_REESTRUCTURACION_AGENTE.md](docs/GUIA_MINIMA_REESTRUCTURACION_AGENTE.md).
No es obligatorio leer el contrato extenso ni todas las auditorías: consultar
solo los apartados relevantes cuando haga falta contexto. Se protegen conductas,
no archivos ni la arquitectura anterior. Una reestructuración autorizada puede
reimplementar las protecciones con pruebas equivalentes o mejores; no debilitarlas
silenciosamente ni eliminar su cobertura. Las mejoras editoriales no autorizan
cambios de transporte/estado ni operaciones en producción. La guía no garantiza
inmunidad frente a baneos.
