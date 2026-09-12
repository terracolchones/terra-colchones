# Liberación del comportamiento — 12 de septiembre de 2026

## Alcance y autorización

El usuario autorizó completar las fases, realizar pruebas controladas, respaldar
y desplegar cuando las verificaciones sean satisfactorias. El objetivo incluye
el editor visible del System Prompt, conocimiento aprobado y recorridos distintos
para orientación y pedido confirmado. Se mantiene literalmente el acceso a asesor.

Servicio verificado en EasyPanel: `agentevps / agente`. Origen Git:
`terracolchones/terra-colchones`, rama `agent-production`, directorio `/`.
Despliegue automático habilitado: subir ramas `codex/` no libera el servicio.

## Respaldos verificados

- Respaldo inicial solicitado **angenteterra 1**:
  `E:\Terra App\backups\angenteterra 1\angenteterra-1.bundle`.
  SHA256 `C155FB76157EBEFC5B53EBCF08B68597D5A2BAE87EC81227959AEC0DBFBFB849`.
  Código y Git; no contiene secretos ni datos operativos.
- Versión productiva antes de esta liberación, comprobada en Git remoto y
  despliegues de EasyPanel: `bc550620295816b1b9d7f4fe563b3a72a4aff0b0`.
- Referencia local y remota recuperable:
  `codex/safety-angenteterra-1-production-20260912`.
- Copia SQLite consistente mediante `better-sqlite3.backup()` en el volumen
  persistente `agente-data`, montado en `/app/data`:
  `/app/data/backups/angenteterra-1-2026-09-12T17-42-28-819Z/`.
  Su `manifest.json` conserva fecha, versión, archivo y hash SHA256. La copia de
  `messages.db` devolvió `integrity_check: ok`. No se mostraron registros.
  La base de comportamiento aún no existía en esa versión. Directorio privado
  y archivos con permisos restringidos. Esta copia está en el mismo servidor;
  protege la reversión del despliegue, no la pérdida completa del volumen.
- Respaldo local final del código y las tres referencias de recuperación:
  `E:\Terra App\backups\angenteterra 1\angenteterra-1-release-20260912-010331f.bundle`.
  Historial completo comprobado mediante `git bundle verify`. SHA256
  `47084FDC68EE76E92EBEA9F054E38AFF04D900438C12A73AF856FEC8400174BE`.
  El manifiesto adyacente `release-20260912-010331f.json` registra su alcance.

## Verificación de comportamiento

- Casos de intención corregidos: negación de compra, respuestas afirmativas con
  historial, menciones informativas de asesor y solicitudes explícitas de atención.
- Una pregunta sobre aprobación del pago consulta el estado conocido del pedido;
  un comprobante recibido sigue en revisión y jamás se aprueba automáticamente.
- Evaluación reproducible: `scripts/eval-agent-behavior.mjs`, 14 escenarios y
  25 turnos con datos ficticios, handler y recuperación puros compartidos.
  El dry-run completo no presenta fallos técnicos. No demuestra calidad del modelo.
- El proveedor real comprobado es OpenRouter y el modelo configurado es
  `google/gemini-2.5-flash-lite`; se conserva esa configuración. La evaluación
  real utiliza exclusivamente su endpoint configurado de Responses, sin Meta,
  clientes reales, datos operativos ni lectura de archivos de credenciales.
- Evaluación real ejecutada desde el candidato `e43753d` en `/tmp`, con 12
  llamadas, 11.423 tokens de entrada y 360 de salida. Los 210 controles de los
  14 escenarios y 25 turnos pasaron. Se leyeron todas las respuestas para revisar
  memoria, precisión respecto a fuentes ficticias, objeciones, aprobación de pago,
  acceso humano, ausencia de insistencia y efecto visible del prompt actualizado.
  La marca de estilo publicada en memoria apareció en la siguiente respuesta.
  La evidencia completa y hashes de los módulos ejecutados se conservaron como
  `model-evaluation.json` junto al respaldo SQLite del servidor.
  Es una evaluación acotada con datos ficticios, no una promesa de respuestas
  perfectas en todos los casos ni una prueba de entrega real de WhatsApp.
- Diagnóstico previo por el dominio HTTPS del agente: HTTP 200, conexión
  `connected`, calidad `GREEN` y webhook `reachable`. Se imprimieron únicamente
  esos indicadores, sin teléfono ni otros datos de la cuenta.

## Estado de liberación

La revisión amplió las protecciones del QR manual: usa la misma reserva que el
automático, valida el pedido actual y conserva una reserva incierta para evitar
duplicados. En HUMANO se pueden registrar silenciosamente confirmación, GPS y
comprobante del único pedido asociado, sin generar respuestas automáticas.
Las consultas SQL reales se probaron con SQLite en memoria: siete escenarios.

La sonda de conocimiento detectó dos documentos publicados, dos fragmentos y
seis productos en el proyecto usado realmente por el agente. La búsqueda Edge
`rag-search` devolvió 401, mientras las lecturas REST y la búsqueda FTS respondieron
200. FTS no recuperó resultados para cuatro consultas naturales. No se cambiaron
credenciales ni se redujo la autenticación. Se agregó recuperación directa de
versiones publicadas y catálogo como respaldo, con caché limitada, invalidación
al publicar y espera entre intentos semánticos fallidos. La revisión independiente
detectó y solicitó corregir el título mutable de un borrador y la pérdida de
paráfrasis semánticas por filtrado léxico.

Ambos hallazgos quedaron corregidos y aprobados por revisión independiente en
`415849fc0ee1861a9f6b4211cfe3c33e39e0b0fd`: el respaldo usa una etiqueta estable,
consulta solo contenido versionado publicado y conserva coincidencias semánticas.
La versión pasó **339 pruebas en 26 archivos**, TypeScript y build local. Lint
no tiene errores; conserva una advertencia anterior en el export del worker Deno.
También pasaron siete escenarios de SQL nativa en memoria y las sondas ficticias
de conocimiento FTS y semántico.

La comprobación real del respaldo publicado se completó en una copia temporal
privada del servidor, sin publicar código adicional ni alterar la aplicación
activa. Los hashes SHA256 de la sonda y de los módulos RAG modificados coinciden
con `415849f`. Las cuatro consultas terminaron: pagos y dirección recuperaron
versiones publicadas; precio recuperó productos publicados. La pregunta sobre
garantía no obtuvo evidencia suficiente y mantiene la respuesta prudente del
agente. No se aprobaron ni inventaron condiciones comerciales.

La prueba con semántica reprodujo un único 401 y comprobó que la espera entre
intentos evita repetirlo en los siguientes turnos. La prueba independiente con
FTS y recuperación publicada completó todas sus solicitudes con HTTP 200 y sin
infraestructura inaccesible. Los informes sin contenido se conservaron junto al
respaldo operativo como `knowledge-after-semantic.json` y
`knowledge-after-fts.json`. No se enviaron mensajes por WhatsApp ni se escribieron
datos en Supabase. La función semántica externa permanece sin corregir.

## Despliegue completado y verificación posterior

Después de informar que el repositorio de despliegue es público, el usuario
respondió «súbelo a producción quiero ver el comportamiento». La publicación
autorizada se realizó con un avance Git normal y atómico de las ramas de trabajo
y producción a `ecef880498012a981bd8514dca7ee296c7515e38`, sin forzar historial.
Se verificaron otra vez servicio, repositorio y rama en EasyPanel. El despliegue
automático de `agentevps / agente` terminó correctamente (55 segundos).
El catálogo no se desplegó.

La revisión automática había bloqueado inicialmente publicar código en un repo
público; la confirmación específica del usuario resolvió ese bloqueo. También
bloqueó renovar la copia de conversaciones por la restricción de AGENTS.md.
Se conservó la copia consistente existente de las 17:42 UTC, comprobando su
presencia y el manifiesto de integridad, y el respaldo Git final. No se creó otra
copia de conversaciones ni se restauraron datos. La reversión prevista es de
código y conserva los pedidos posteriores al respaldo.

Comprobaciones finales por el dominio HTTPS real, entre las 18:40 y 18:41 UTC
del 12 de septiembre (14:40–14:41 en Bolivia):

- Panel `/comportamiento`: HTTP 200 y título correcto con autenticación.
- Acceso anónimo a `/api/behavior`: HTTP 401 y desafío Basic.
- Lectura de configuración: HTTP 200, `no-store` y versión activa válida.
- Simulación con origen ajeno: HTTP 403. Con el origen HTTPS correcto: HTTP 200,
  una respuesta sintética, fuente de conocimiento y texto del editor utilizado.
  La simulación conservó revisión, versión activa y borrador.
- Configuración en `/app/data/agent-behavior.db`, dentro del volumen persistente
  `agente-data`; comprobación de integridad `quick_check: ok`. No se abrió la base
  operativa de conversaciones para estas verificaciones.
- Hashes del procesador, RAG, prompt y documento de liberación del contenedor
  coinciden con la revisión desplegada. El informe posterior es adicional al
  documento contenido en esa imagen.
- Diagnóstico de WhatsApp: HTTP 200, `connected`, calidad `GREEN` y webhook
  `reachable`. Esto no acredita una entrega nueva de WhatsApp: no se enviaron
  mensajes de prueba a clientes.

Las evidencias sin contenido se guardaron junto al respaldo operativo como
`production-ui-checks-ecef880.json` y `production-runtime-checks-ecef880.json`.
El navegador integrado rechazó abrir el dominio con `ERR_BLOCKED_BY_CLIENT`;
el acceso autenticado por HTTPS se verificó directamente. Se proporciona el
enlace para abrir el panel en el navegador habitual con su acceso existente.

La búsqueda semántica externa mantiene el fallo de autenticación identificado;
la recuperación alternativa de contenido publicado sí quedó verificada. La
pregunta de garantía continúa sin evidencia suficiente y requiere información
comercial aprobada. No se inventaron políticas para superar esa comprobación.
La evaluación del tono real está documentada arriba; el simulador visible del
panel sigue usando datos ficticios y no demuestra la respuesta de la IA real.

Para una reversión de código, preparar una rama de liberación desde la referencia
de seguridad, verificar otra vez el servicio y actualizar su rama de despliegue
con control de concurrencia. Conservar los datos posteriores al respaldo; no
restaurar toda la base automáticamente ni sobrescribir archivos de configuración.
