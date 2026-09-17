# Panel de chat Terra — implementación local

Fecha: 17 de septiembre de 2026.
Estado: implementado y validado en local; no publicado.

## Base, alcance y recuperación

- Servicio propietario: `agentevps / agente`.
- Worktree: `E:\Terra App\agent-panel-chat-20260917`.
- Rama: `codex/agent-panel-chat-20260917`, sin upstream para evitar publicar por accidente.
- Se actualizó `origin/agent-production` mediante fetch: base `a97583f`.
  La copia editorial `f4c1343` solo añadía documentación sobre esa base.
- Respaldo creado antes de editar:
  `codex/safety-before-agent-panel-chat-20260917`, commit `a97583f`.
- Implementación principal: `88e8415`.

La referencia remota se verificó; no se inspeccionó la versión en ejecución del
VPS. Antes de una eventual publicación se debe volver a comprobar la fuente y
versión del servicio. Esta entrega no incluye despliegue ni cambios de configuración.

El cambio afecta la interfaz de operadores y la lectura paginada de mensajes.
El POST de envío manual permanece sin cambios. En `db.ts` solo se añade un import
y una función para la nueva lectura; `getMessages`, `getRecentHistory`, esquema,
migraciones y escrituras existentes quedan intactos. No cambian webhook, reglas
de IA/HUMANO, RAG, transporte Meta, pedidos, GPS, QR ni revisión de pagos.
No cambia el contrato catálogo-agente, por lo que no corresponde modificar la
arquitectura entre servicios en esta entrega.

## Funciones entregadas

- Actualizaciones sin salto automático cuando el operador lee arriba.
- Seguimiento de mensajes nuevos cuando el operador está al final.
- Aviso de mensajes entrantes y botón para volver al final.
- Páginas de 50 mensajes anteriores, ordenadas por fecha e ID, sin duplicados.
- Actualización de mensajes recientes conservando las páginas ya cargadas.
- Recuperación de más de 50 mensajes nuevos entre consultas mediante páginas
  sucesivas, junto con actualización de los metadatos de envío recientes.
- Consultas serializadas y cancelación al desmontar/cambiar de conversación.
- Estados de carga, error, reintento y fin de historial.
- Enlace oficial de WhatsApp a partir del contacto autenticado, sin envío ni cambio
  de modo. Usa la cuenta activa del dispositivo y no sincroniza historiales.
- Fondo, burbujas, fechas y etiquetas de IA/asesor renovados.
- Encabezado y escritura fijos; navegación móvil entre lista y conversación.
- Ajustes en un menú móvil y eliminación en «Más acciones», conservando su
  confirmación y comportamiento. Los errores de eliminación ahora son visibles.

Imágenes, comprobantes visuales, GPS en mapa, ficha ampliada de pedido y Shopify
continúan fuera de esta etapa.

El diseño de esa evolución se registra en
[Comprobantes y GPS reutilizables con Shopify](PLAN_DATOS_WHATSAPP_SHOPIFY_20260917.md).
Es un plan pendiente: la vista local actual no incluye esas funciones ni una
conexión con Shopify.

## Abrir y probar la vista

Desde este worktree:

```powershell
npm run preview:chat
```

Abrir `http://127.0.0.1:3191/preview/chat`.

La vista utiliza los componentes reales del panel con un transporte de prueba
en memoria del navegador. Incluye 140 mensajes ficticios en una conversación,
otra conversación en modo IA y una vacía. No requiere credenciales ni una base.
Al recargar, los ejemplos vuelven a su estado inicial.

Controles de prueba:

1. Subir en el chat y pulsar «Simular mensaje» o «Simular 75 mensajes».
2. Comprobar que la posición se conserva y aparece el contador de nuevos mensajes.
3. Subir hasta «Cargar mensajes anteriores» y recorrer las páginas.
4. Pulsar «Simular fallo» y luego «Restablecer conexión».
5. Pulsar «Simular demora» y cambiar de conversación.
6. Cambiar IA/HUMANO y probar escritura ficticia.

En móvil, los controles de simulación están en «Herramientas de prueba».
En la demo, los enlaces externos y a otros paneles muestran una explicación;
el QR y la eliminación no realizan acciones reales. El envío manual únicamente
añade un mensaje ficticio en memoria.

El lanzador rechaza checkouts con archivos de entorno privados o `data/`, filtra
el entorno heredado, limita el servidor a loopback y carga una protección contra
acceso externo y archivos operativos. La capa HTTP solo permite la página de
demostración y sus recursos; las rutas reales de API están bloqueadas. Son
protecciones de desarrollo, no un sandbox del sistema operativo. La página
también exige desarrollo, variable de preview y host local; en producción devuelve
404. No se modifica la autenticación del panel operativo.

Las dependencias se reutilizan mediante una junction a la instalación local del
agente editorial; no se actualizó su contenido ni se instalaron dependencias nuevas.

## Validación realizada

- Suite local aislada: **569 pruebas, 36 archivos, todas correctas**.
- Se añadieron 13 pruebas de paginación SQLite en memoria, orden con fechas
  repetidas, ráfaga de 122 mensajes, conservación de historial y metadatos,
  validación de cursores, autenticación de GET y restricciones/envío manual de POST.
- TypeScript: correcto.
- ESLint del proyecto: 0 errores; permanece un aviso preexistente en
  `supabase/functions/rag-index/index.ts:28`, archivo no modificado.
- Build Next.js 16.3.4 con webpack y sin red externa: correcto.
- `git diff --check`: correcto.
- No existe `data/` en el worktree y no se leyeron archivos de entorno privados.
- Consulta HTTP a `/api/conversations` del servidor de preview: **403**.

### Verificación en navegador con datos ficticios

| Caso | Evidencia |
| --- | --- |
| Varias actualizaciones sin novedades | Permanecieron 50 mensajes cargados; no se cargó el historial completo automáticamente. |
| Lectura arriba + un mensaje nuevo | Mensaje 131 conservó desplazamiento de 3 px respecto al contenedor; `scrollTop` permaneció en 3699. |
| Lectura arriba + 75 mensajes | El mismo mensaje conservó 3 px y el mismo `scrollTop`; el contador mostró 76 nuevos en total. |
| Carga de página anterior | El mensaje 91 conservó su desplazamiento de 126 px, aun al insertar 50 mensajes por encima. |
| Historial completo | Se mostraron 216 mensajes: 140 iniciales más 76 simulados; apareció «Inicio de la conversación». |
| Fallo de consulta | Aviso visible sin perder los 216 mensajes cargados; recuperación al restablecer la conexión. |
| Cambio a segundo cliente | Solo sus mensajes, sin mezcla con el primero; escritura deshabilitada en IA. |
| Envío manual ficticio | Se habilitó en HUMANO y apareció el texto de prueba. |
| Seguir el final | Tras un mensaje entrante, 50 pasó a 51 mensajes y la distancia al final permaneció en 0. |
| Móvil 320 px | Sin desbordamiento horizontal; chat visible de 296 px de alto en viewport de 740 px; primera apertura al final, distancia 0. |
| Escritorio 1280 px | Encabezado, lista, chat y escritura visibles; sin errores ni advertencias de consola. |

Se corrigieron durante la revisión dos detalles: el cursor de refresco de una
primera página de 50 elementos y la primera apertura del chat oculto en móvil.
Las verificaciones anteriores incluyen esas correcciones.

## Límites y siguiente paso

La vista comprueba interacción y presentación usando los componentes reales.
La consulta del servidor se prueba por separado con SQLite en memoria y tests de
autenticación; no se consultaron conversaciones productivas ni se enviaron mensajes
a Meta. Esta evidencia valida los fallos identificados en código y su reproducción
local; no equivale a una prueba del VPS o a la aprobación de una publicación.

Para revisar el resultado basta con la vista local. Un despliegue futuro requiere
solicitud explícita, comprobar otra vez la versión del agente y preparar la revisión
de código y recuperación correspondientes. El catálogo no se despliega con esto.
