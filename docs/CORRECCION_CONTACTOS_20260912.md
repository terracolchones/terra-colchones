# Contactos públicos y presentación de respuestas

Servicio: `agentevps / agente`. Rama de trabajo:
`codex/agent-public-contacts-20260912`.

## Recuperación

Antes de editar se verificaron rama, worktrees y estado limpio. Referencia Git
`codex/safety-angenteterra-1-before-contacts-20260912`, commit
`9839657c1d62ed970c95539dac01cbd3d4a79533`. Producción partía de
`ecef880498012a981bd8514dca7ee296c7515e38`; la diferencia eran documentos.
Se creó y verificó además el bundle local con historial completo
`.cache/contact-release/angenteterra-1-before-contacts-20260912.bundle`, SHA256
`6643E08CE9123F89286A513168AF9118FB5DC94928033AB5D82683D0FCBE2749`.

Se respaldó exclusivamente el documento comercial autorizado y su versión
publicada en `/app/data/backups/contacts-20260912-before-update.json`, con creación
exclusiva y permisos restringidos. No se abrió ni copió la base de conversaciones.
Para revertir el contenido, crear y publicar una nueva versión desde ese respaldo;
no restaurar pedidos ni bases completas. Conservar los cambios posteriores del equipo.

## Hallazgos y contenido aprobado

El documento «Contacto y direcciones» conservaba enlaces de WhatsApp tanto en la
revisión publicada 1 como en el borrador 2. Sus cinco nombres de asesores coincidían
con la lista proporcionada; los teléfonos tenían separadores. Tarija tenía un
tercer contacto que no formaba parte de la nueva lista aprobada.

Se guardó y publicó la revisión 2 mediante la API del agente, conservando título,
tipo y etiquetas. Antes de guardar se comparó el documento completo con el respaldo;
antes de publicar se comprobó el hash del contenido aprobado. Ambas operaciones
respondieron HTTP 200, y el contenido publicado coincidió exactamente.

Se aplicó la lista nueva del usuario: cinco asesores con nombre y dos teléfonos
de Tarija, sin enlaces de WhatsApp. Se conservaron nombres, números, direcciones,
mapas y políticas suministrados. Se corrigió el encabezado «aPedidos» y se separaron
las secciones. Los horarios corresponden únicamente a Santa Cruz. No se verificó
la titularidad telefónica mediante llamadas ni mensajes, ni se inventaron nombres
para Tarija. Los datos comerciales reales no se incorporan al repositorio.

## Corrección de comportamiento

Una solicitud de teléfono comercial no es el envío de un dato privado ni una
solicitud de transferencia. Debe resolverse con fuentes comerciales publicadas,
manteniendo la asociación entre ciudad, nombre y número. Los datos personales del
historial siguen protegidos. Se presentan contactos en texto plano y se evita
exponer marcadores internos de omisión. La frase para acceder al equipo conserva
la palabra «asesor» con una redacción más cercana.
La API de comportamiento confirmó `source: built_in`, revisión 0 y ningún
borrador; el texto inicial actualizado se reflejará al desplegar, sin reemplazar
instrucciones personalizadas del equipo.

No cambia el contrato entre catálogo y agente, el transporte de Meta, el control
de duplicados, las transiciones de pedido, GPS, QR o comprobantes, ni las
condiciones de transferencia explícita a HUMANO.

## Verificación y liberación

- 408 pruebas en 28 archivos: aprobadas con `node scripts/run-local-tests.mjs`.
- TypeScript sin errores y build de producción aislado aprobado.
- Lint sin errores; permanece un aviso anterior en `supabase/functions/rag-index/index.ts`.
- Herramienta de evaluación con módulos puros: 14 escenarios y 25 turnos ficticios,
  sin fallos técnicos. Esta ejecución sin modelo no evalúa el tono del proveedor.
- Dos revisiones independientes cerraron los casos de asociación ciudad/persona,
  lectura publicada fallida, teléfonos partidos en límites de bloques y consultas
  combinadas de contactos con productos o políticas del mismo documento.
- La recuperación del directorio usa documentos publicados completos; el historial
  no se convierte en autoridad para números. Las consultas combinadas conservan
  la respuesta del modelo y validan los pares de nombre y teléfono.

## Producción verificada

Se publicaron atómicamente la rama de trabajo, la referencia de seguridad y el
avance normal de `agent-production` a
`68d4c8de8bc4c18cfc5ee7c3837db156d2b63ae7`. EasyPanel confirmó el despliegue
correcto de `agentevps / agente`; el catálogo no se desplegó.

El 12 de septiembre de 2026 a las 21:16 UTC se verificó:

- Hashes del handler, servicio RAG, directorio, formato e instrucciones iguales
  a los blobs de la revisión liberada.
- Panel y APIs autenticadas: HTTP 200. API de comportamiento anónima: HTTP 401.
- Prompt inicial activo con texto plano y sin la expresión fría anterior.
- Documento comercial publicado con el contenido exacto aprobado.
- Conexión `connected`, calidad `GREEN` y webhook `reachable`.

Siete comprobaciones adicionales con entradas ficticias y lectura del conocimiento
comercial vigente pasaron en el contenedor nuevo: números por ciudad, error de
escritura de Cochabamba, seguimiento por asesor, ausencia de horario de Tarija y
consulta combinada de oficina y teléfonos. Usaron el directorio y responder puros
del código desplegado: cero llamadas al modelo y cero mensajes de WhatsApp. No
se abrieron conversaciones ni pedidos. No equivalen a una prueba de entrega por Meta.

La evidencia de salud sin contenido se guardó en
`/app/data/backups/contacts-release-68d4c8d-checks.json`. El respaldo comercial
anterior y la referencia Git permanecen disponibles. Esta anotación posterior
se guarda en la rama de trabajo sin provocar otro despliegue solo por documentación.
