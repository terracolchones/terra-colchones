# Operación de la base RAG de Terra

## Dónde se carga la información

El contenido aprobado se administra en el panel real del agente:

`https://agente.terracolchonesymuebles.online/conocimiento`

El panel usa la misma protección de operadores que el dashboard. No hay una
API pública ni acceso desde el catálogo público.

1. Crear o editar un documento.
2. Guardarlo como **borrador**.
3. Revisar el texto y usar **Publicar**.

Solo la última versión publicada se recupera para clientes. Al publicar una
nueva versión, la publicada anterior queda archivada y se puede auditar.

## Qué guardar en cada lugar

- **Panel RAG:** empresa, políticas, preguntas frecuentes, cobertura, fichas
  complementarias y categorías aprobadas.
- **Catálogo:** nombre, fotos, variantes, precio y disponibilidad. El agente
  vuelve a leer esos datos vigentes; no se deben duplicar manualmente en RAG.
- **Nunca en RAG:** teléfonos privados, conversaciones, domicilios de clientes, GPS, comprobantes,
  información bancaria, QR privados, secretos ni datos personales.

## Índice y escalabilidad

La migración `20260910103000_rag_knowledge_base.sql` crea:

- Documentos y versiones (`draft`, `published`, `archived`).
- Bloques de texto, búsqueda de texto completo y vector de 384 dimensiones.
- Tarjetas semánticas automáticas para productos publicados, sin copiar precio
  ni stock.
- Una cola de embeddings recuperable; si el vector aún no está disponible, la
  búsqueda de texto sigue funcionando.

Las Edge Functions `rag-search` y `rag-index` usan el modelo nativo
`gte-small` de Supabase. Tras desplegarlas, se programa `rag-index` cada minuto
y se habilita `RAG_SEMANTIC_SEARCH_ENABLED=true` en el servicio del agente.
Esta activación se hace después de verificar la migración y el worker; no forma
parte de un despliegue de código normal.

El programador invoca el worker con una clave secreta gestionada por Supabase;
esa credencial no se replica en código, variables manuales ni documentación.

## Flujo de conversación

El mensaje afirmativo de confirmación vincula el pedido; GPS y QR se ejecutan
mediante acciones validadas del sistema. Una pregunta o una objeción se responde
con RAG sin añadir siempre un recordatorio de pago o ubicación. Una respuesta
breve como «sí» conserva el historial para interpretar la pregunta anterior.
Solo una solicitud explícita del cliente cambia el chat a atención humana;
una negación, una mención informativa o una hipótesis no autoriza la transferencia.

El tono y las prioridades se publican desde `/comportamiento`. El modelo recibe
la versión activa, las fuentes recuperadas para la consulta y las reglas
protegidas. Publicar conocimiento aporta hechos; publicar el prompt cambia la
forma de conversar. Ninguno de esos editores autoriza pagos ni envíos GPS/QR.

La creación actual de pedidos usa `/api/catalog-orders` y la confirmación del
cliente por WhatsApp. Desde esta liberación, la confirmación externa heredada
`/api/order-confirmations` devuelve `410` con autenticación válida y no envía QR.
Se conservaron sus tablas y reservas históricas.

## Punto de seguridad

Antes del ajuste de prioridad de respuestas RAG se creó el punto recuperable
`codex/safety-before-rag-answer-priority-6624d17` sobre el commit `6624d17`.
Ese punto conserva el comportamiento anterior del agente sin incluir cambios
locales ajenos.
