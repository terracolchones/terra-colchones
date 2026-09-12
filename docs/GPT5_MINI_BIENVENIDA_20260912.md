# GPT-5 mini, presentación y catálogo — 12 de septiembre de 2026

## Alcance autorizado

El usuario pidió corregir la presentación inicial, acompañar el catálogo con
texto cercano, conservar el contexto al pedir información de productos y usar
exactamente GPT-5 mini. Servicio: `agentevps / agente`, rama de despliegue
`agent-production`; el catálogo público es otro servicio y no se modifica.

## Punto de recuperación

- Rama de trabajo: `codex/agent-gpt5-mini-welcome-20260912`.
- Respaldo: `codex/safety-before-gpt5-mini-20260912`.
- Commit del respaldo: `77c5bbd32c1ccdb525b57a678ee87740826a4d0c`.
- Producción al comenzar: `0a1d395179998ba8237ed3f9a586f0b3b40d6e73`.
- Bundle local verificado: `.cache/gpt5-mini-release/before-gpt5-mini-20260912.bundle`.
- SHA-256: `0DF63EE1B6C22609BCB9190AD2A09F2DFEBCD79804F579BAC0B00CFA283343DC`.

No contiene cambios locales ajenos, credenciales ni datos de clientes.
El bundle es un respaldo de Git; no representa una copia de la base operativa.

## Cambios

- Primera respuesta: bienvenida a Terra y presentación como asistente virtual,
  seguida de la respuesta a la consulta original y acceso a `asesor`.
- Saludo breve al retomar, sin repetir la presentación en cada respuesta.
- Reconocimiento de `Holac`, `Holaa` y `Hola Terra` sin absorber preguntas.
- Pregunta pertinente sobre productos cuando no hay categoría; reutilización
  de la categoría, selección o pedido si ya están en la conversación.
- Texto cercano dentro de la tarjeta de catálogo existente. Se conservan
  botón, enlace privado, revalidaciones y cantidad de envíos.
- Cierre breve ante agradecimientos, sin insistir en el paso de compra.
- Se eliminan saludos iniciales repetidos en conversaciones continuas y se
  reconocen invitaciones equivalentes a escribir `asesor` sin duplicarlas.
- El contexto del pedido llega al modelo en español, sin códigos internos;
  no se deducen confirmaciones cuando el estado es desconocido. Las políticas
  no deben ampliarse con exclusiones o ejemplos que la fuente no publica.
- Configuración de modelo compartida entre respuesta real y evaluación.
  GPT-5 mini usa `minimal`, `max_output_tokens: 1536`, verbosidad baja,
  `store: false` y un único intento. Se rechazan respuestas vacías,
  incompletas o incompatibles con el límite de texto antes del envío.

## Modelo y activación

Se verificó el override real anterior: `google/gemini-2.5-flash-lite` mediante
OpenRouter. GPT-5 mini se configura allí como `openai/gpt-5-mini`; la conexión
y credencial existentes permanecen en el mismo proveedor.

La prueba inicial real, con una sola consulta ficticia y cero envíos WhatsApp,
devolvió `model: openai/gpt-5-mini`, `status: completed` en 1542 ms.

Primero se desplegó `e8c104a` conservando el override anterior. La evaluación
real del modelo nuevo pasó 210 controles en 14 escenarios / 25 turnos, con
12 peticiones al proveedor (19.229 tokens de entrada y 1.008 de salida).
La lectura semántica detectó saludos/avisos repetidos y un código de estado
en una respuesta: se corrigieron antes de activar el modelo para clientes.

La revisión siguiente se evalúa en una carpeta aislada del servidor, con
módulos puros y fixtures del commit publicado y su hash verificado. Solo
después de aprobarla se cambia `OPENAI_MODEL` y se despliega esa versión.
No se leen archivos de secretos ni conversaciones.

## Protecciones conservadas

Petición explícita de asesor, modo HUMANO manual, deduplicación, comprobación
de modo tras operaciones asíncronas, control de GPS/QR y comprobantes en revisión.
No hay aprobación automática de pagos ni pruebas por WhatsApp real.
Los mapas publicados, teléfonos y documentos de conocimiento no se editan.

## Validación

542 pruebas locales pasan en 32 archivos. TypeScript y build correctos;
lint sin errores, con el aviso previo de exportación anónima en
`supabase/functions/rag-index/index.ts:28`.
Resultados finales y commit desplegado se registrarán tras completar la
evaluación real final, la activación y las comprobaciones del servicio.

## Reversión

Restaurar `OPENAI_MODEL=google/gemini-2.5-flash-lite` y desplegar un commit
normal de reversión del cambio de código, manteniendo el historial remoto.
No forzar ramas ni restaurar una base de datos sobre conversaciones nuevas.
El nombre del modelo es configuración pública; no debe copiarse ninguna
credencial a este documento.

Referencias: [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini)
y [guía de GPT-5](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5).
