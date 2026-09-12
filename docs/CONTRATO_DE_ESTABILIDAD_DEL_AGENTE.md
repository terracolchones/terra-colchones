# Terra — auditoría técnica y contrato de estabilidad del agente

**Fecha documental:** 12 de septiembre de 2026.

**Servicio:** agente de WhatsApp `agentevps / agente`.

**Referencia funcional verificada:** `bc550620295816b1b9d7f4fe563b3a72a4aff0b0`.

**Finalidad:** conservar las correcciones mientras se mejora tono, conocimiento y experiencia.

**Lectura operativa actual:** basta la
[guía mínima de reestructuración](GUIA_MINIMA_REESTRUCTURACION_AGENTE.md) junto con
el AGENTS.md aplicable. Este documento conserva el detalle histórico para consulta
puntual; no se exige leerlo completo. La guía define el alcance para nuevos diseños:
se preservan conductas seguras, no archivos, arquitectura o cantidad de mensajes.
Una reimplementación dentro de una reestructuración autorizada es válida con
pruebas equivalentes o mejores; no es una excepción por cambiar la estructura.

> **REGLA OBLIGATORIA PARA DESARROLLADORES E IA:** una solicitud para mejorar el
> prompt, el tono, el conocimiento o las respuestas NO autoriza a quitar, debilitar
> o eludir las protecciones descritas en este documento. No reintroducir reenvíos
> tras aceptación/incertidumbre, no quitar el filtro del receptor, no saltarse
> HUMANO ni reabrir reservas solo por antigüedad. Ante un conflicto, conservar el
> comportamiento protegido y detener esa parte del cambio. Una excepción requiere
> autorización específica, diseño revisado y pruebas de seguridad equivalentes
> o superiores; nunca una eliminación silenciosa para hacer pasar un test.

## 1. Resumen y alcance de las afirmaciones

El usuario informa que, después de los cambios, el agente funciona correctamente
y no volvió a sufrir baneos. Se conserva expresamente esa observación. Además,
se verificaron despliegues, pruebas aisladas y una conversación real con aceptación
y lectura de ambos mensajes por Meta.

**No se demostró cuál fue el disparador interno de las inhabilitaciones anteriores.**
La ausencia de nuevos incidentes no identifica una causa única ni permite asegurar
que una futura modificación provoque necesariamente un baneo. Las protecciones
se conservan porque corrigen defectos técnicos concretos y evitan regresiones,
no porque exista una garantía de inmunidad frente a Meta.

Este documento consolida los hallazgos FIN-01 a FIN-07, BIZ-01 a BIZ-10 y SEC-01
a SEC-04, las reproducciones D1 a D5, las correcciones desplegadas y los límites
pendientes. «Corregido» describe el alcance comprobado en la referencia indicada;
no certifica cualquier modificación posterior ni todos los flujos de producción.

**La elaboración del documento no cambia código funcional, datos, Meta o producción.**
Sus reglas y enlaces en AGENTS.md son controles documentales. No instalan por sí
solos protección de ramas, CI obligatoria, permisos de archivos, alertas o bloqueo
técnico contra cambios de otros operadores.

## 2. Servicio correcto y referencias recuperables

| Elemento | Referencia |
| --- | --- |
| Agente real | EasyPanel `agentevps / agente` |
| Dominio operativo | `https://agente.terracolchonesymuebles.online` |
| Callback verificado durante la liberación | `https://agente.terracolchonesymuebles.online/api/webhook` |
| Fuente de despliegue comprobada | `terracolchones/terra-colchones`, rama `agent-production`, ruta `/` |
| Base de la auditoría original | `7577b5d31b854b9f5bbedd18ca73ef8959c426e9` |
| Copia de la auditoría original | `E:\Terra App\agent-production-worktree` |
| Copia que contiene las correcciones verificadas y este contrato | `E:\Terra App\agent-local-sim-20260912` |
| Rama documental, sin despliegue | `codex/agent-stability-contract-20260912` |
| Referencia Git anterior a este documento | `codex/safety-before-stability-contract-20260912`, creada en `bc55062` |
| Catálogo separado | `terra-catalogo / catalogo`, `E:\Terra App\01`; no es el webhook del agente |

**No partir de `7577b5d` ni de `890f45b` como si contuvieran todas las correcciones.**
Tampoco copiar un handler antiguo completo para cambiar una frase. Antes de una
mejora, identificar la versión vigente y comprobar que conserva los cambios de
esta referencia. Los nombres de ramas y rutas no certifican por sí solos el
contenido ejecutado en producción.

Las comprobaciones de este documento son históricas y fechadas; no se afirma haber
auditado aquí las mejoras de tono/conocimiento que el usuario esté realizando
en otra rama, tarea o servicio. Deben conservarse y revisarse sin sobrescribirlas.

### 2.1 Secuencia de cambios comprobada

| Commit | Cambio real |
| --- | --- |
| `21d2630` | Simulaciones aisladas y documentación de recuperación; reprodujo defectos, todavía no los corregía. |
| `a98bb50` | Diagnóstico sanitizado de Meta, resultados de transporte y webhook; sin añadir reintentos. |
| `e8db3c1` | Guardas de GPS/QR, reservas inciertas y distinción entre envío, preparación y persistencia. |
| `6500957` | Aislamiento del receptor, control HUMANO y supresión de respuestas alternativas inseguras. |
| `0e904e6` | Documentación de la liberación y respaldo SQLite verificado. |
| `bc55062` | Bienvenida con vía visible de atención humana mediante «asesor», más pruebas. |

El commit separado `890f45b` preparaba filtro de receptor y aviso de asesor, pero
no fue integrado literalmente. Su filtro tiene una implementación equivalente
en la liberación; la frase se incorporó posteriormente en `bc55062`. No hacer
cherry-pick a ciegas del parche antiguo sobre el código actual.

## 3. Defectos reproducidos y correcciones aplicadas

Las reproducciones se hicieron con entradas y proveedores simulados. Demuestran
conducta del código bajo esas condiciones, no que cada defecto ocurriera durante
los dos incidentes históricos de Meta.

Los identificadores C6–C10 de esta consolidación son propios de este documento;
no equivalen a los C-xx de la revisión crítica de Astra citada en el anexo.

### D1 — Eventos de otro número podían procesarse

- **Antes:** un evento firmado de otro `phone_number_id` podía reservarse, guardarse
  y provocar una respuesta desde el número configurado del agente.
- **Corrección:** `processWebhookPayload` exige coincidencia exacta entre
  `value.metadata.phone_number_id` y `META_PHONE_NUMBER_ID` antes de procesar
  estados/mensajes, reservar WAMID o escribir datos de negocio.
- **Falla cerrada:** configuración ausente o con espacios marginales, metadata
  ausente/malformada e identificador distinto se ignoran; no deben generar salidas.
- **Código:** `src/lib/meta/handler.ts`, commit `6500957`.
- **Pruebas:** `handler.simulation.test.ts`, canales distintos, metadata/configuración
  inválidas y lote mixto que conserva solamente el canal autorizado.
- **Límite:** es una solución de canal único. El multicanal futuro necesita
  enrutamiento explícito e identidad canal/cliente; nunca eliminar el filtro.

### D2 — Un fallo local después de aceptación podía causar otra respuesta

- **Antes:** el CTA y `updateMessageWaId` compartían el manejo de errores. Si Meta
  aceptaba pero fallaba el registro local, podía enviarse un fallback adicional.
  La respuesta RAG también mezclaba generación, envío y guardado.
- **Corrección:** `sendCatalog` separa transporte de actualización local;
  `sendAndStore` registra el fallo posterior sin propagarlo como nuevo envío;
  `answerKnowledgeQuestion` separa generación de envío y no encadena otra respuesta
  por un fallo de transporte.
- **Regla:** una aceptación no se deshace por fallar SQLite. Un timeout no prueba
  que Meta rechazara la petición. Ninguna de esas situaciones autoriza un reenvío.
- **Código:** `src/lib/meta/handler.ts`, commit `6500957`.
- **Límite importante:** sí puede existir una respuesta de error si el RAG falla
  antes de intentar enviar nada. Lo prohibido es convertir el fallo de un envío
  aceptado o incierto en permiso para una segunda respuesta.

### D3 — Imagen en HUMANO avanzaba el pedido y respondía

- **Antes:** una imagen podía marcar comprobante y enviar acuse automático durante
  la atención humana.
- **Corrección:** en HUMANO, `handleImageMessage` conserva únicamente un registro
  pasivo; no marca comprobante ni genera acuse automático.
- **Código/prueba:** `handler.ts` y `handler.simulation.test.ts`, commit `6500957`.
- **Límite:** esto no implementó almacenamiento ni visualización del adjunto real;
  BIZ-02 permanece separado. Recibir una imagen nunca aprueba un pago.

### D4 — Ubicación en HUMANO podía disparar el QR

- **Antes:** `handleLocationMessage` podía actualizar el pedido y enviar QR aunque
  el operador tuviera el chat.
- **Corrección:** registro pasivo en HUMANO, sin guardar GPS en el pedido ni
  despachar QR automático; el recorrido en IA se conserva.
- **Código/prueba:** `handler.ts` y `handler.simulation.test.ts`, commit `6500957`.

### D5 — Una respuesta pendiente seguía saliendo tras pasar a HUMANO

- **Antes:** la consulta al modelo comenzaba en IA; si el operador cambiaba el modo
  durante la espera, la respuesta podía enviarse igualmente.
- **Corrección:** `canAutomate`, `sendAndStore`, `sendCatalog` y los despachadores
  vuelven a consultar el modo persistido antes de los efectos protegidos.
- **Excepción intencional:** una solicitud explícita de asesor cambia primero a
  HUMANO y puede recibir un único acuse mediante `humanHandoffAcknowledgment`.
  Esta excepción no debe utilizarse para respuestas comerciales ordinarias.
- **Límite:** no se puede retirar una petición a Meta que ya empezó. No afirmar
  cancelación global o serialización completa por haber añadido estas guardas.

### C6 — GPS/QR aceptado o incierto podía quedar marcado como reintentable

- **Antes:** envío y `complete...` compartían catch. Un fallo local posterior a
  aceptación podía marcar la reserva `failed`, permitiendo un envío posterior.
- **Corrección:** los despachadores actuales separan preparación, envío y cierre;
  distinguen `uncertain` y `accepted_persistence_failed` y conservan la reserva.
- **Código:** `catalog-order-flow.ts`, `catalog-payment-flow.ts`, `payment-qr.ts`,
  commit `e8db3c1`.
- **Preparación QR:** `PaymentQrPreparationError` identifica un fallo anterior a
  llamar a Meta y no conserva errores/URLs privadas como `cause`. La supresión por
  modo antes del envío también es distinta de una entrega incierta.
- **Límite:** estos resultados de función no constituyen un nuevo libro persistente
  universal de estados. No se migró el esquema ni se reclasificaron registros viejos.

### C7 — Reservas actuales `sending` se reabrían a los 300 segundos

- **Antes:** la antigüedad podía habilitar otro intento sin saber si el proveedor
  había aceptado el anterior.
- **Corrección:** `catalogDeliveryReservationState` mantiene `sending` como
  `in_progress`, independientemente del tiempo transcurrido. Se usa en
  `reserveCatalogLocationRequest` y `reserveCatalogPaymentQrDelivery`.
- **Código:** `catalog-delivery-reservation-policy.ts` y `db.ts`, commit `e8db3c1`.
- **Mensaje operativo:** el QR pendiente requiere confirmación/revisión; no se
  anuncia falsamente que se repetirá de forma automática.
- **Contrapartida:** una caída incluso antes de enviar puede dejar una reserva
  pendiente. No arreglarla con un temporizador, cron o borrado automático.
- **Alcance:** solo reservas del catálogo actual. La ruta legacy conserva su
  reserva diferente y su lógica de 300 segundos; ver FIN-06.

### C8 — QR automático durante la espera de la URL firmada

- **Corrección:** `sendPaymentQr(..., { requireAiMode: true })` comprueba IA antes
  y después de `await getPaymentQrSignedUrl()`.
- **Automático:** los llamadores del flujo actual deben conservar esa opción.
- **Manual:** el operador autenticado puede enviar QR en HUMANO; no aplicar una
  prohibición global que rompa esta acción legítima.
- **Persistencia:** si ya se aceptó el QR, un fallo al guardar historial no lo
  convierte en reintentable. Esa protección parcial ya existía y se preservó.

### C9 — Diagnóstico insuficiente y errores sin esquema seguro

- Se incorporó `src/lib/meta/diagnostics.ts`: lista cerrada de eventos y campos,
  validación en ejecución, hora UTC, códigos HTTP/Meta numéricos, tipo, estado y
  duración. Un fallo del logger no debe modificar el resultado del envío.
- `sendGraphMessage` distingue intento, aceptación, rechazo e incertidumbre.
  No añadió reintentos. `MetaGraphError` conserva la semántica necesaria de
  `131047`/`outside24h` y token vencido sin devolver el cuerpo privado del proveedor.
- Las referencias HMAC de WAMID usan una sal efímera del proceso; permiten
  relacionar aceptación y estados dentro de ese proceso sin mostrar el ID real.
- No registrar textos, teléfonos, coordenadas, archivos, tokens, cabeceras,
  URLs privadas, payloads completos o excepciones crudas en esta instrumentación.
- **Pendiente:** no hay correlación duradera de entrada con todas sus salidas,
  versión/canal completos en cada evento, manejo integral de `account_update`
  ni protección equivalente de todos los logs de RAG/catálogo ajenos a esta ruta.

### C10 — La bienvenida no indicaba explícitamente cómo pedir atención humana

- `bc55062` añadió: `Si prefieres atención humana, escribe "asesor".`
- La detección de solicitudes humanas y el modo HUMANO ya existían. El cambio
  añadió la vía visible y una prueba del comando literal; no rehízo el clasificador.
- La prueba comprueba una transición y un acuse, sin RAG/CTA/GPS/QR extra ante
  replay y un mensaje posterior mientras el chat permanece en HUMANO.
- La redacción puede mejorarse, pero debe conservar una vía clara y funcional.
  No eliminarla para hacer más corto el saludo. Ver BIZ-05 para negaciones pendientes.

### O1 — Falta de respuesta causada por `messages` desuscrito en Meta

Este fue un problema operativo diferente de los baneos y de los defectos de código.
En la tarea `API AGENTE (2)` se había pausado `messages` intencionalmente. Un build
correcto y un webhook accesible no podían compensar que Meta no entregara entradas.

La comprobación inicial de estar listo para probar omitió esa precondición. Se
revisó el antecedente, se confirmó **No suscritos**, se desplegó la bienvenida,
se verificó la cuenta y, con autorización, se reactivó únicamente `messages`.
Después de recargar Meta, quedó confirmado **Suscritos**. No se cambiaron número,
WABA, portfolio, tokens o variables de EasyPanel para conseguirlo.

**Regla permanente:** comprobar cuenta, callback, suscripción y release antes de
declarar lista una prueba. Cambiar código no activa ni desactiva por sí solo la
suscripción; modificarla exige una decisión operativa explícita y documentada.

## 4. Controles preexistentes que NO deben presentarse como errores corregidos

| Control / afirmación | Situación comprobada y regla |
| --- | --- |
| HMAC del webhook | Ya existía validación sobre cuerpo bruto, formato/longitud y comparación de tiempo constante en `meta/verify.ts`. Conservarla. |
| Deduplicación del mismo WAMID | Ya existían clave única, `INSERT OR IGNORE` y comprobación `changes > 0`. La atomicidad no se añadió en estas correcciones. No mover la reserva después de los envíos. |
| WAL y espera por bloqueo | El código ya intentaba WAL y configuraba `busy_timeout = 5000`. No eran controles ausentes. Esto no certifica el journal efectivo de una base no inspeccionada. |
| Inicio de función async | `void processWebhookPayload(...)` invoca de inmediato; la primera reserva ocurre antes del primer await del flujo. El defecto pendiente es durabilidad, no la carrera anteriormente atribuida a esa expresión. |
| Bienvenida + CTA | Son dos salidas intencionales y secuenciales. El primer saludo retorna sin llamar al RAG. No se unificaron en un único mensaje. |
| Estados `sent`, `delivered`, `read` | Son fases del mismo mensaje, no tres envíos. Solo eventos de estado no deben crear conversaciones ni respuestas. |
| Dos WABA o dos dominios | Nombres repetidos o dos URLs de EasyPanel no prueban doble ejecución. La estrella de un dominio solo lo marca como principal. |
| Dos saludos diferentes | No son replay del mismo WAMID. La simulación conserva una bienvenida y dos CTA, con posible intercalado: no ocultar el pendiente de orden por chat. |
| Capturas de los incidentes | Las horas de capturas/burbujas no fijan por sí solas el instante de sanción. Los avisos mostraron inhabilitación/restauración de WABA; no identificaron una petición causante. |

No atribuir nuevos WAMID a «reabrir WhatsApp» sin evidencia. Tampoco asumir que
pulsar un CTA URL equivale a una respuesta interactiva entrante. El despacho de
entradas interactivas debe seguir validando canal, duplicados y modo.

## 5. Inventario completo de la auditoría y estado de cierre

Los estados siguientes corresponden a la liberación `bc55062`. «Pendiente»
significa **no cerrado por estos commits**; otro trabajo posterior solo puede
cerrarlo mediante evidencia propia, sin sobrescribir la historia.

### 5.1 Fiabilidad, persistencia y operación

| ID | Hallazgo original | Estado después de las correcciones |
| --- | --- | --- |
| FIN-01 | Sin aislamiento del receptor. | Corregido en diseño de canal único; D1. |
| FIN-02 | Acuse HTTP y reserva «visto» sin cola/ciclo duradero; caída puede perder trabajo y una excepción abortar el resto del lote. | Pendiente. No existe recuperación persistente de trabajos ni garantía exactamente una vez. |
| FIN-03 | Aceptación, fallo e incertidumbre mezclados; fallback, reservas reintentables y UI engañosa. | Parcial: D2/C6/C7 corrigen caminos actuales. Falta estado persistente universal, reconciliación, tratamiento de históricos `failed` y UI completa. |
| FIN-04 | Sin orden por chat entre webhooks distintos; efectos pendientes en HUMANO. | Parcial: guardas HUMANO corregidas, serialización por chat pendiente. |
| FIN-05 | Trazabilidad insuficiente y errores no minimizados. | Parcial: diagnóstico de C9; correlación duradera y medidas de cuenta pendientes. |
| FIN-06 | Confirmación legacy elude parte del flujo nuevo; QR manual sin idempotencia propia en servidor. | Pendiente. `/api/order-confirmations` usa `reservePaymentQrDelivery`, distinto del catálogo actual. Dos solicitudes manuales concurrentes aún pueden enviar varios QR. Inventariar consumidores antes de retirar/adaptar. |
| FIN-07 | Topología, volumen, recuperación y retención sin certificar integralmente. | Parcial: se comprobó una réplica configurada, volumen ext4 `/app/data`, espacio y respaldo consistente. Faltan restauración ensayada, copia externa, retención, journal efectivo y topología de incidentes históricos. |

El borrado de una conversación deja pedidos con vínculo nulo por `ON DELETE SET
NULL`; falta política explícita de conservación y deduplicación histórica.
No borrar chats/reservas para «limpiar» un incidente o permitir reenvíos.

### 5.2 Negocio, RAG y pedidos

| ID | Hallazgo y efecto posible | Estado / trabajo pendiente |
| --- | --- | --- |
| BIZ-01 | Conversión `Number(null)`/cadena vacía a cero puede llevar precio ausente al RAG como Bs 0. | No corregido por esta liberación. Preservar ausencia y validar recorrido normalización→RAG→respuesta; no se demostró una cotización real gratis. |
| BIZ-02 | Imagen marca comprobante sin guardar referencia revisable del adjunto; panel textual y PDF sin manejo. | Pendiente. Referencia y almacenamiento privados, validación, acceso autenticado, retención y revisión humana. |
| BIZ-03 | Imagen, ubicación y respuestas pendientes ignoran HUMANO. | Corregido en efectos examinados: D3/D4/D5/C8. No revoca solicitudes ya iniciadas ni arregla intención lingüística. |
| BIZ-04 | Historial sensible puede salir en otro turno; una pregunta pública mezclada con datos privados evade el filtro del turno. | Pendiente. Sanitizar/minimizar tanto recuperación como generación e historial. No se confirmó filtración real. |
| BIZ-05 | Matcher de asesor confunde negaciones/narración con solicitud; referencia de producto puede ocultar petición humana. | Pendiente. Añadir «asesor» a la bienvenida no cierra este defecto. Probar peticiones positivas, negadas, narrativas y mixtas. |
| BIZ-06 | Tras GPS fallido se promete escribir «ubicación», pero ese recorrido no dispara el reintento anunciado. | Pendiente. Recuperación explícita sin reenviar resultados inciertos. No añadir retry automático como arreglo rápido. |
| BIZ-07 | RAG usa selección antigua en lugar del producto/variante del pedido activo. | Pendiente. Contexto de pedido correcto, sustitución A→B y separación precio pactado/precio vigente. |
| BIZ-08 | Varios pedidos activos y ausencia de correlación de respuesta pueden asociar GPS/imagen tardíos al pedido equivocado. | Pendiente. Definir una compra activa o selección/correlación explícita; no cerrar pedidos silenciosamente. |
| BIZ-09 | Reglas comerciales demasiado amplias bloquean preguntas informativas de pago/garantías/facturación aun con fuente. | Pendiente / decisión de producto. Mejorable con pruebas, separando informar de autorizar transacciones. |
| BIZ-10 | Existe etiqueta/estado de pago confirmado, pero no se encontró cierre humano completo en las APIs examinadas. | Pendiente. Verificar procedimiento externo; si se integra, decisión humana autenticada, atribuible y auditable. |

### 5.3 Seguridad HTTP

| ID | Hallazgo | Estado / cierre requerido |
| --- | --- | --- |
| SEC-01 | GET `/api/qr` público descarga QR remoto para diagnosticarlo; permite consumo y revela metadatos/errores. No entrega por ello imagen ni credenciales al visitante. | Pendiente. Proteger diagnóstico y separar salud pública mínima sin descargar archivos. |
| SEC-02 | Lectura completa del cuerpo webhook antes de revisar firma y sin límite de bytes de aplicación. | Pendiente. Prevalidación, límite real de lectura y proxy; HMAC correcto no resuelve consumo de memoria. |
| SEC-03 | Mutaciones Basic sin control Origin/CSRF. Explotación condicionada a reutilización de credenciales por navegador, identificador conocido y demás condiciones. | Pendiente; no explotación demostrada. Validar defensa de origen/CSRF e iframe con servicios simulados. |
| SEC-04 | JSON autorizado `null` puede producir 500 en vez de 400 en creación/confirmación de pedido. | Pendiente. Validar objeto no nulo, no array y tipos antes de usar campos. |

Refuerzos adicionales identificados, no cerrados automáticamente:

- Basic compartido sin identidades/roles individuales ni rate-limit propio;
  controles de proxy no certificados integralmente.
- `request.formData()` procesa antes del límite final del QR de 2 MB; falta
  protección de recepción/memoria y dimensiones.
- MIME declarado no demuestra que los bytes sean una imagen válida; falta
  decodificación/validación o re-encodeo adecuado.
- HSTS, CSP, X-Frame-Options y X-Content-Type-Options no aparecieron en cuatro
  respuestas externas auditadas; no se certificó todo el panel autenticado.
- RLS, permisos reales de buckets, red, caducidad/rotación de secretos y accesos
  internos no se certificaron leyendo credenciales ni datos privados.
- Fuera de la ruta de saludo, algunos logs de OpenAI/RAG/catálogo todavía
  imprimen errores crudos. No considerar sanitizado todo el log del servicio.

### 5.4 Calidad y entorno de validación

La auditoría original tenía 29 pruebas y una carpeta `node_modules.incomplete`
que contaminaba TypeScript. Las dependencias de ese worktree eran un junction al
catálogo. Se preservaron esos archivos ajenos; no se eliminaron como «limpieza».

Las correcciones se trabajaron en un checkout aislado con dependencias propias,
runner offline y cobertura ampliada hasta 129 pruebas en 15 archivos. Se
validaron TypeScript, lint del agente y build Webpack; el build de producción se
comprobó separadamente. Los números históricos 29, 57, 128 y 129 corresponden a
etapas distintas; un test de caracterización verde no significaba defecto cerrado.

Pendientes o límites de esa validación:

- Local Node 24 frente a Node 22 observado en producción; repetir la validación
  del runtime objetivo cuando se cambien dependencias o componentes nativos.
- `engines >=20.9.0` es más permisivo que los mínimos de algunas dependencias.
- Dos errores preexistentes de lint completo por `@ts-nocheck` en funciones
  Supabase y una advertencia no se corrigieron; no ocultarlos excluyendo pruebas.
- Turbopack local no se validó bajo bloqueo total de sockets, por su IPC. No
  retirar las defensas offline de los tests para forzar un resultado verde.
- No se acreditó una nueva CI obligatoria ni protección de ramas.
- Mocks y políticas puras no prueban SQLite nativo, concurrencia real, reinicios,
  recuperación, permisos Supabase ni todos los recorridos de negocio.
- El resultado histórico de `npm audit` sin avisos no certifica toda la seguridad.

## 6. Núcleo protegido: reglas que ningún cambio de tono puede saltarse

### P-01 — Autenticación y canal

Conservar HMAC sobre cuerpo original, comparación segura y rechazo de solicitudes
inválidas. Después, comprobar el receptor antes de reservar o producir efectos.
No aceptar «cualquier número», no usar el primer número del payload como emisor
ni tratar falta de configuración como permiso para continuar.

### P-02 — Reserva y deduplicación

Conservar clave única y decisión atómica del WAMID. No borrar reservas, moverlas
al final del envío ni sustituirlas por una variable en memoria. Un mensaje distinto
no es duplicado; no descartar GPS, comprobantes o asesor por un cooldown global.

### P-03 — Aceptación, incertidumbre y reintentos

Separar generación, preparación, envío, persistencia y entrega. Un fallo local
después de aceptación no genera otra salida. No usar `Promise.race` con reintento
para una llamada que podría seguir ejecutándose. No reenviar desde otro número,
otro proveedor o un fallback para sortear una restricción o un resultado incierto.

### P-04 — HUMANO manda sobre la automatización

Consultar modo persistido antes de cada efecto protegido y después de esperas
relevantes. Conservar captura pasiva sin avance automático de pedido en HUMANO.
La confirmación única de una solicitud explícita de asesor y las acciones manuales
autorizadas son excepciones acotadas, no puertas para envíos automáticos.

### P-05 — GPS, QR y pago

Conservar confirmación de pedido→solicitud GPS nativa→ubicación→QR→comprobante en
revisión en el flujo actual. No reabrir `sending` por tiempo ni quitar
`requireAiMode:true` a envíos automáticos. El modelo nunca aprueba pagos,
comprobantes o despacho por su propia interpretación de una imagen/texto.

### P-06 — Diagnóstico y privacidad

Conservar esquema cerrado y códigos necesarios; aceptación no equivale a lectura.
No imprimir secretos ni información del cliente para «depurar más fácil».
No leer/versionar `.env.local`, la base operativa, conversaciones, teléfonos,
ubicaciones o comprobantes en pruebas, informes o cambios de código.

### P-07 — Frontera de servicios

Catálogo y agente permanecen separados. Mantener comunicación de servidor
autenticada, token de compra opaco, expiración y vinculación al chat. El catálogo
no escribe directamente en SQLite del agente. El enlace público no debe mostrar
identificadores internos o secretos.

### P-08 — Evidencia y operación de Meta

No declarar «listo» solo por build/HTTP. Comprobar cuenta, canal configurado,
callback, `messages` y versión efectiva. Pausar/reactivar suscripciones es una
acción separada que exige autorización y registro. No alterar Meta/EasyPanel,
números, WABA, portfolio, variables o réplicas como efecto lateral de editar tono.

### P-09 — Cambios estructurales excepcionales

No congelar bugs pendientes como si fueran características correctas. Se permiten
correcciones futuras, pero tocar el núcleo requiere necesidad explícita, análisis
del efecto, revisión del diff, pruebas equivalentes o mejores y autorización
específica. Mantener estas invariantes incluso al mover funciones a otros archivos.

## 7. Qué se puede mejorar y qué no es «solo prompt»

| Zona | Cambios editoriales admisibles | Condiciones |
| --- | --- | --- |
| `src/lib/system-prompt.ts` | Tono, claridad, vocabulario, longitud, ejemplos. | Preservar restricciones de negocio, evidencia, privacidad y atención humana. El archivo no es una zona libre de reglas. |
| `docs/rag/base-conocimiento-terra.md` y fuentes aprobadas | Información comercial verificada, organización y redacción. | No inventar datos ni convertir documentos recuperados en instrucciones de sistema. Publicar en producción requiere autorización correspondiente. |
| Textos de bienvenida/ayuda en `handler.ts` | Redacción acotada y vía visible de asesor. | No reescribir funciones completas, mover awaits/catches o añadir llamadas. Actualizar aserciones textuales sin quitar las de seguridad. |
| `src/lib/openai.ts`, `rag/service.ts`, `rag/core.ts`, `rag/policy.ts`, `message-routing.ts` | Mejoras funcionales de recuperación, evidencia o intención. | No son solo contenido: requieren revisión y pruebas específicas. BIZ-04/05/07/09 no se resuelven cambiando una frase. |
| Estado, transporte, persistencia, auth y dispatchers | Fuera de un encargo editorial ordinario. | Aplican P-01 a P-09 y autorización específica si cambia la protección. |

Ejemplo permitido: una bienvenida más natural que siga ofreciendo asesor y
mantenga los mismos dos envíos secuenciales y controles. Ejemplo no autorizado:
«para que responda más rápido», quitar el await, enviar catálogo y texto en
paralelo o responder con otro mensaje cuando la primera llamada queda incierta.

La instrucción «no puedo confirmar ese precio» puede redactarse mejor; no puede
convertirse en un precio inventado ni en aprobación de pago. No cambiar a HUMANO
automáticamente solo por incertidumbre comercial: ofrecer la vía y respetar la
solicitud explícita y el interruptor manual del equipo.

## 8. Archivos y pruebas que deben revisarse ante un cambio

Rutas relativas a la raíz del agente, válidas en la referencia `bc55062`:

| Zona protegida | Archivos de implementación | Pruebas de referencia |
| --- | --- | --- |
| Entrada, firma y acuse | `src/app/api/webhook/route.ts`, `src/lib/meta/verify.ts` | `src/app/api/webhook/route.simulation.test.ts` |
| Canal, dedup, modo, bienvenida y fallback | `src/lib/meta/handler.ts` | `src/lib/meta/handler.simulation.test.ts` |
| Transporte y clasificación de errores | `src/lib/meta/client.ts` | `src/lib/meta/client.simulation.test.ts` |
| Registro sanitizado | `src/lib/meta/diagnostics.ts` | `src/lib/meta/diagnostics.test.ts` |
| QR automático/manual y preparación | `src/lib/payment-qr.ts` | `src/lib/payment-qr.test.ts` |
| GPS y QR del catálogo actual | `src/lib/catalog-order-flow.ts`, `src/lib/catalog-payment-flow.ts` | `src/lib/catalog-order-flow.test.ts`, `src/lib/catalog-payment-flow.test.ts` |
| Reservas actuales | `src/lib/db.ts`, `src/lib/catalog-delivery-reservation-policy.ts` | `src/lib/catalog-delivery-reservation-policy.test.ts` más tests de despacho; no sustituyen pruebas SQLite nativas |
| Enrutamiento y reglas RAG | `src/lib/message-routing.ts`, `src/lib/rag/*` | `src/lib/message-routing.test.ts`, tests de core/policy/resume/chunking |
| Aislamiento de pruebas | `scripts/run-local-tests.mjs`, `scripts/local-network-guard.mjs`, `vitest.local.config.mts`, `src/test/*` | `src/test/local-safety.test.ts` |

No está permitido eliminar, omitir o debilitar aserciones para hacer verde una
regresión. El número 129 es la referencia histórica, no un techo ni una métrica
suficiente: se protege la conducta cubierta. Una reorganización de tests exige
trazabilidad equivalente de las invariantes.

## 9. Lista obligatoria antes de aceptar y liberar cambios

- [ ] Identificar servicio, HEAD, rama, worktree y cambios ajenos; no confundir
  una copia antigua o el catálogo con el agente vigente.
- [ ] Leer la guía mínima y el AGENTS.md aplicable; consultar aquí solo el detalle
  relevante. Distinguir texto de lógica y conducta protegida de implementación.
- [ ] Crear un punto recuperable y trabajar en una rama `codex/` no configurada
  directamente para producción.
- [ ] Revisar el diff contra la versión vigente y preservar D1–D5/C6–C10 y P-01–P-09.
- [ ] Añadir pruebas del cambio; conservar la cobertura de seguridad existente.
- [ ] Ejecutar `npm run test:local` en un checkout aislado sin datos ni secretos.
- [ ] Ejecutar TypeScript, lint y build con entorno apropiado sin cargar datos
  operativos. Registrar por separado errores preexistentes y no ocultarlos.
- [ ] Verificar especialmente: canal inválido sin efectos; mismo WAMID sin repetir
  acción; aceptación con fallo local sin fallback; transporte incierto sin retry;
  imagen/GPS en HUMANO sin avance; cambio a HUMANO durante RAG/QR sin nueva salida;
  reservas antiguas sin reapertura; asesor con un acuse; logs sin datos privados.
- [ ] Para tono/conocimiento, revisar ejemplos y fuentes aprobadas; no inventar
  precio, stock, garantía, fecha ni aprobación. Mantener el pedido activo y la
  atención humana sin cambiar sus reglas inadvertidamente.
- [ ] Guardar avance en commit enfocado y registrar límites que siguen abiertos.
- [ ] Desplegar solo con autorización explícita, servicio/referencia comprobados
  y plan de reversión compatible. No disparar otro deploy si el push ya lo inició.
- [ ] Antes de prueba real, verificar cuenta, configuración del canal/callback y
  `messages`; no confundir `GREEN`, 200 del proveedor o build con inmunidad.
- [ ] Prueba controlada autorizada, una etapa a la vez; distinguir intento,
  aceptación y lectura mediante metadatos. No hacer pruebas masivas o ráfagas.
- [ ] Ante falta de respuesta, duplicados o restricción, detener pruebas repetidas
  y conservar evidencia sanitizada; no cambiar número/WABA para eludir la medida.

El runner offline revisa existencia de archivos privados sin leerlos, filtra
variables, desactiva `.env` y sustituye SQLite/proveedores. Son defensas contra
llamadas accidentales, no una sandbox del sistema operativo ni permiso para
ejecutar cualquier test nuevo sin inspeccionar imports y efectos.

## 10. Evidencia de despliegue y operación observada

La liberación inicial verificó fuentes críticas dentro del contenedor, builder,
dominio, una réplica y volumen persistente. La liberación `bc55062` mostró éxito
en EasyPanel y la huella del handler de la nueva instancia coincidió con la local
normalizada a LF:

```text
5526df0c3801510114e8bae4c67c3447c80d8a9dbe1e7184ac827f27c59f3873
```

Eso es evidencia de la fuente comparada, no una comparación binaria universal
de todos los artefactos. En producción se observó Node 22.19.0. La prueba del
12 de septiembre de 2026 quedó registrada así, sin reproducir datos del cliente:

| Hora Bolivia (UTC-04:00) | Evento comprobado |
| --- | --- |
| 02:57:19 | Un mensaje entrante recibido. |
| 02:57:20 | Meta aceptó el texto de bienvenida. |
| 02:57:21 | Meta aceptó el CTA de catálogo después del texto. |
| 02:57:22 | Estados de ambos mensajes llegaron a `read`, sin códigos de error. |
| 03:08 y aproximadamente 03:14 | La cuenta volvió a mostrar Aprobada en las revisiones efectuadas. |

En ese intercambio no hubo llamadas RAG, envíos simultáneos, reintentos ni
duplicados observados. Esto no valida todos los recorridos futuros. El rótulo
del panel `Catálogo enviado.` se inserta antes del envío y no sustituye la
confirmación de Meta; falta de WAMID tampoco prueba rechazo definitivo.

**Observación posterior del usuario:** no se repitieron baneos desde los cambios
y el agente funciona correctamente. No se inventa una duración de seguimiento
ni se presenta como monitoreo continuo realizado por el asistente.

## 11. Respaldo y reversión sin pérdida de datos

- Fuente recuperable: `bc55062` y sus ramas de seguridad documentadas.
- ZIP de código: `E:\Terra App\backups\agente-local-sim-20260912\release-bc55062.zip`.
- SHA-256 del ZIP:
  `26F9D691B0A21ECBBAD3D44327645D8C7FCF1C805A0E0AEA7B940739E4ED0D56`.
- El ZIP no sustituye datos, archivos privados ni el historial completo de Git.
- Se creó una copia SQLite consistente antes de los cambios, mediante backup
  online; 38 páginas, 155648 bytes y quick_check correcto. Su ubicación privada y
  límites están en el manifiesto de liberación. No se copiaron datos a este documento.
- Esa copia está en el mismo servidor/volumen; no es respaldo externo ni prueba
  de restauración integral. Falta un ensayo de recuperación con datos sintéticos.

Para una regresión editorial, revertir únicamente el commit afectado, conservando
las protecciones posteriores. No `reset --hard`, no reemplazar todo el handler
con un archivo antiguo y no restaurar SQLite para deshacer una frase. Volver a
una versión anterior a las guardas de reservas puede reactivar intentos inciertos:
requiere evaluación explícita, no un rollback ciego.

## 12. Aplicación del contrato y cierre

La guía mínima debe acompañar cada tarea sobre el agente; este documento queda
disponible para consulta puntual. El AGENTS.md de la copia corregida enlaza la guía.
En otra máquina o nueva rama, incorporar la guía y su enlace mediante una integración
documental revisada, conservando esta auditoría como referencia. No dar por hecho
que un archivo solo local ya está en GitHub/producción.

Para un bloqueo técnico adicional se necesita configurar por separado CI,
revisiones obligatorias y protección de ramas. Eso no se implementa al escribir
un .md y requeriría su propia autorización.

**Criterio final:** mejorar lo que el agente dice no debe cambiar inadvertidamente
quién puede activar el agente, cuándo puede enviar, cómo respeta HUMANO, cómo
trata una entrega incierta o cómo conserva pedidos y datos. El funcionamiento
recuperado es la referencia a preservar, sin ocultar los pendientes ni prometer
que la causa interna de un baneo de Meta haya quedado demostrada.

## Anexo — Fuentes locales y trazabilidad

Estas fuentes son antecedentes fechados. Los estados «pendiente», «no desplegado»
o los conteos de pruebas antiguos deben leerse junto con las liberaciones posteriores.

- [Auditoría integral e índice](<E:/Terra App/agent-production-worktree/docs/auditorias/2026-09-12-auditoria-integral-agente/00-informe.md>).
- [Fiabilidad y persistencia FIN-01–07](<E:/Terra App/agent-production-worktree/docs/auditorias/2026-09-12-auditoria-integral-agente/01-fiabilidad-y-persistencia.md>).
- [Negocio y RAG BIZ-01–10](<E:/Terra App/agent-production-worktree/docs/auditorias/2026-09-12-auditoria-integral-agente/02-negocio-rag-y-pedidos.md>).
- [Seguridad HTTP SEC-01–04](<E:/Terra App/agent-production-worktree/docs/auditorias/2026-09-12-auditoria-integral-agente/03-seguridad-http.md>).
- [Validación original](<E:/Terra App/agent-production-worktree/docs/auditorias/2026-09-12-auditoria-integral-agente/05-validacion-local.md>).
- [Producción verificada durante la auditoría](<E:/Terra App/agent-production-worktree/docs/auditorias/2026-09-12-auditoria-integral-agente/06-produccion-verificada.md>).
- [Revisión crítica C-01 y corrección de hipótesis anteriores](<E:/Terra App/agent-production-worktree/docs/auditorias/2026-09-11-baneo-whatsapp/08-auditoria-astra.md>).
- [Plan integral original](<E:/Terra App/agent-production-worktree/docs/planes/2026-09-12-fiabilidad-whatsapp-terra.md>).
- [Reproducción aislada D1–D5](pruebas/2026-09-12-simulacion-local.md).
- [Liberación de correcciones](pruebas/2026-09-12-liberacion-controlada.md).
- [Bienvenida y reactivación](pruebas/2026-09-12-bienvenida-reactivacion-messages.md).
- [Evidencia final de reactivación](<E:/Terra App/backups/agente-local-sim-20260912/REACTIVACION-MESSAGES.md>).
- [Estado de referencia y estabilidad](<E:/Terra App/backups/agente-local-sim-20260912/BASE-VERIFICADA-Y-ESTABILIDAD.md>).
