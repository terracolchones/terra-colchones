# Mapas públicos y trato conversacional — 12 de septiembre de 2026

Servicio: `agentevps / agente`, dominio del agente, línea `agent-production`.
Trabajo aislado: `codex/agent-branch-maps-greetings-20260912`.

## Respaldo y alcance

- Punto recuperable: `codex/safety-before-maps-greetings-20260912`, commit `577e69cb3cd078c73dd6f47f9a03642f265c81c5`.
- Producción anterior: `68d4c8de8bc4c18cfc5ee7c3837db156d2b63ae7`; el punto recuperable añade únicamente documentación.
- Bundle completo verificado: `.cache/maps-greetings-release/before-maps-greetings-20260912.bundle`.
- SHA256: `36EA72BB0A2605C7A3AABBEDA22286B6C1E1F6B5CE99A5C5772A7B7D878528F8`.
- No cambia el catálogo, la base de conversaciones, documentos comerciales publicados, credenciales ni configuración Meta/Supabase.

## Causa y comportamiento

La corrección anterior cubría contactos, pero algunas consultas imperativas de dirección
se clasificaban como datos privados del pedido. Otras llegaban al modelo y perdían mapas.

- Direcciones, mapas y datos de sucursales llegan al conocimiento público; las direcciones
  privadas del cliente y las acciones de GPS/QR mantienen el tratamiento controlado.
- «Cocha» identifica Cochabamba solamente si existe la ciudad en el documento publicado.
  Seguimientos, repeticiones, selección de Sur/Norte y petición de todas las direcciones
  conservan su alcance; ante una sucursal ambigua se pide la ciudad.
- Respuestas del directorio: introducción breve, 📍 nombre de sucursal, mapa publicado,
  dirección y separación entre sucursales. Si falta un mapa se explica sin inventarlo.
- Las respuestas mixtas conservan los pares verificados de sucursal y mapa.
- Los teléfonos siguen como nombre y número de la fuente, sin enlaces de WhatsApp,
  asteriscos ni marcadores internos. No se extienden horarios entre ciudades.
- El saludo se añade al mensaje existente al inicio o al retomar tras 30 minutos de
  inactividad. Es un criterio de conversación, no una regla de Meta. No hay temporizador
  ni mensajes proactivos. El catálogo conserva su bienvenida antes del CTA cuando procede.
- Instrucciones iniciales y reglas protegidas distinguen el mapa público de una solicitud
  GPS privada. El texto editable publicado por el usuario, si existe, no se sobrescribe.

## Protección y validación

Se mantienen `asesor`, HUMANO explícito, reserva por mensaje, ausencia de reenvíos ante
resultado incierto, revalidación de modo tras esperas, GPS único y comprobante en revisión.
Las regresiones usan datos sintéticos; no se envían mensajes de prueba por WhatsApp.
Validación local: 472 pruebas en 29 archivos, TypeScript y build aislado aprobados.
Lint sin errores; conserva el aviso anterior de exportación en `rag-index/index.ts:28`.
Evaluación técnica sin proveedor: 14 escenarios / 25 turnos, cero controles fallidos.
Esta evaluación no califica la personalidad de un modelo real.
Revisión independiente cerró dos regresiones adicionales: fuente fresca indisponible con
seguimiento corto y mapas cruzados por el modelo, incluso con líneas vacías entre título y URL.
Producción verificada el 12 de septiembre de 2026, 22:25 UTC:

- Commit desplegado: `0a1d395179998ba8237ed3f9a586f0b3b40d6e73`.
- EasyPanel terminó correctamente; los hashes de diez módulos desplegados coinciden con Git.
- Siete consultas ejecutadas con los módulos desplegados y el conocimiento publicado:
  dirección de Cochabamba, Cocha, repetición de Cocha, datos de Cochabamba,
  todas las direcciones, sucursal Sur y direcciones de Santa Cruz. Todas aprobaron
  nombre y mapa exactos, cantidad de sucursales y ausencia de marcadores/asteriscos.
  Cero llamadas al modelo y cero envíos por WhatsApp.
- `/comportamiento` y `/api/behavior` autenticados: 200. API sin autenticación: 401.
- Instrucciones activas `built_in`, con la nueva regla de saludo visible en la API.
- Conexión `connected`, calidad `GREEN`, webhook `reachable` en ese momento.
- Contactos siguen publicados en revisión 2; SHA256 del contenido:
  `cdb5ce2a4c689de45202d4a3383af4cef9c5df61885139fd6015100fdfb6cafc`.
- Evidencia sin datos de clientes: `/app/data/backups/maps-release-0a1d395-probe.json`
  y `/app/data/backups/maps-release-0a1d395-health.json`.

La primera ejecución de la herramienta de comprobación tuvo un error al escapar una
cadena y terminó antes de consultar servicios. Se corrigió esa herramienta; las siete
consultas anteriores corresponden a la ejecución posterior que finalizó correctamente.

Para volver atrás, revertir el commit funcional de esta liberación en una rama separada,
validar y publicar de forma normal en `agent-production`; no forzar la rama ni restaurar
la base de conversaciones. El conocimiento publicado no necesita reversión para este cambio.
