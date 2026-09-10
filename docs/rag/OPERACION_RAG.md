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
- **Nunca en RAG:** teléfonos, conversaciones, direcciones, GPS, comprobantes,
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

Las acciones transaccionales (código de pedido, GPS, QR, imagen de comprobante)
tienen prioridad. Una pregunta general se responde con RAG y el agente añade el
recordatorio del siguiente paso del pedido. Solo una solicitud explícita del
cliente cambia el chat a atención humana.
