# Bienvenida y reactivación controlada de messages

Fecha: 12 de septiembre de 2026.
Servicio exclusivo: `agentevps / agente`; fuente EasyPanel verificada:
`terracolchones/terra-colchones`, rama `agent-production`, ruta `/`.

## Hallazgo confirmado y alcance autorizado

La prueba sin respuesta reveló una precondición operativa omitida: el campo
`messages` del objeto WhatsApp Business Account estaba en **No suscritos**.
Se verificó directamente en Meta y en la tarea `API AGENTE (2)`, donde se había
pausado intencionalmente. La salud HTTP y un build correcto no prueban recepción
de WhatsApp. No se atribuye esta falta de respuesta a un nuevo baneo.

El usuario autorizó completar/desplegar la frase de atención humana, comprobar
que la cuenta esté activa y después reactivar únicamente `messages`.
No se autorizan cambios de número, cuenta, portfolio, token, variables, base,
otros campos de webhook ni mensajes de prueba enviados por el asistente.

## Comparación con el cambio anterior

`890f45b` no es ancestro de la release anterior `0e904e6`, pero su filtro por
`phone_number_id` ya tiene una implementación equivalente en esa release:
rechazo antes de deduplicación/escrituras cuando la metadata no coincide con
la configuración. Se preserva esa implementación y todas las demás guardas.
No es necesario fusionar el commit antiguo completo.

La única modificación funcional nueva es añadir a la bienvenida existente:
`Si prefieres atención humana, escribe "asesor".`
La detección de la solicitud y el modo HUMANO ya existían. Se conserva el saludo
seguido del CTA y no se resetean conversaciones para forzar la bienvenida.

## Recuperación y validación local

- Base recuperable: `0e904e6e6b955565629125cd27e44a1c365396fe`.
- Rama de respaldo: `codex/safety-before-welcome-reactivation-20260912`.
- Rama de trabajo: `codex/agent-welcome-reactivation-20260912`.
- Worktree: `E:\Terra App\agent-local-sim-20260912`.
- Pruebas aisladas: 129/129, 15 archivos, sin servicios ni datos reales.
- Prueba adicional: literal `asesor`, replay y segundo mensaje; una transición
  HUMANO y un solo acuse, sin llamadas RAG, CTA, GPS o QR adicionales.
- TypeScript, lint de src/scripts/configuración y build local Webpack: aprobados.
- Los errores preexistentes del lint completo en funciones Supabase siguen
  fuera de este alcance; no se afirma haberlos corregido.
- La regeneración de next-env.d.ts por el build se revierte únicamente en este
  worktree aislado; los cambios de otros worktrees se preservan.

## Verificaciones previas a reactivar

La WABA operativa se identificó por su ID en Meta y su resumen mostró
**Estado de la cuenta: Aprobada**. Esto no garantiza ausencia de futuras
restricciones. Antes de activar `messages` se debe confirmar la release efectiva,
el callback del servicio correcto y volver a comprobar el estado del campo.

La evidencia final de despliegue y de la suscripción se registra por separado en
`E:\Terra App\backups\agente-local-sim-20260912\REACTIVACION-MESSAGES.md`.
Este documento no declara por anticipado que la suscripción ya esté activada.

## Prueba y límites

Con cuenta habilitada y modo IA, el usuario envía un único `Hola` y espera.
Si el chat ya tiene historial, puede recibir solo el CTA; no se debe borrar
historial para simular un cliente nuevo. Ante ausencia de respuesta, error o
restricción, detener la prueba y revisar metadatos sanitizados.

No se demuestra que las correcciones hayan eliminado el origen de los baneos.
Se mantienen los límites documentados de concurrencia, cola, trazabilidad y
otros pendientes de la auditoría integral. Para revertir solo el texto, usar un
commit de reversión; no restaurar SQLite. Una nueva pausa de `messages` es una
operación de Meta distinta del código y debe quedar explícitamente registrada.
