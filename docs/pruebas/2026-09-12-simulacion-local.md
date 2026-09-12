# Terra: respaldo de código y simulación local

Fecha: 12 de septiembre de 2026. Servicio: agente, no catálogo.

## Resultado y alcance

Se preparó una copia de trabajo aislada y se ejecutaron simulaciones del código
actual. No se corrigió el comportamiento funcional todavía. No se enviaron
mensajes, no se cambió el webhook y no se desplegó ni reinició producción.

El respaldo de código está creado. El respaldo operativo de los datos de
producción sigue PENDIENTE: no se debe confundir con Git ni con el ZIP de fuentes.

## Puntos recuperables

- Base: `7577b5d31b854b9f5bbedd18ca73ef8959c426e9`.
- Rama de seguridad: `codex/safety-agent-local-sim-20260912`.
- Rama de pruebas: `codex/agent-local-sim-20260912`.
- Carpeta aislada: `E:\Terra App\agent-local-sim-20260912`.
- Copia de código base: `E:\Terra App\backups\agente-local-sim-20260912\codigo-7577b5d.zip`.
- SHA-256 del ZIP: `97F5A6AB038F5DD6FD46709B7096E7865696210FC7CEFC2800E2BEECC09A84ED`.

El ZIP procede de `git archive` del commit indicado: contiene las fuentes
versionadas y el lockfile, no el historial Git, dependencias, archivos privados ni
datos operativos. Se comprobó el índice del ZIP: 156 entradas, ninguna ruta de
`data/`, `node_modules/`, `.git/` o `.env` real; sí contiene `.env.example`.
También se descomprimieron sus entradas en memoria y se compararon con los 107
blobs del commit: un archivo coincide byte a byte y 106 coinciden al normalizar
CRLF a LF (`core.autocrlf=true` en Windows); cero diferencias de contenido.

Los cambios previos, incluidos documentos de auditoría sin versionar, permanecen
en `E:\Terra App\agent-production-worktree` y NO están incluidos en este ZIP.
No se incorporaron, descartaron ni sobrescribieron para crear el respaldo.
Una copia en este mismo disco no protege frente a la pérdida física del disco.

## Cómo repetir la simulación

En PowerShell:

```powershell
Set-Location -LiteralPath 'E:\Terra App\agent-local-sim-20260912'
npm run test:local
```

Para un punto concreto:

```powershell
npm run test:local -- src/lib/meta/handler.simulation.test.ts
npm run test:local -- src/app/api/webhook/route.simulation.test.ts
```

Usar este comando, no `next dev`, `next start`, un túnel ni el número real. El
runner no levanta un webhook público. `NextRequest` se construye en memoria.

### Protecciones aplicadas

- Dependencias propias instaladas con `npm ci --ignore-scripts --no-audit --no-fund`;
  no se reutilizó la unión de dependencias de la carpeta original.
- El runner rechaza una carpeta con archivos `.env*` distintos de `.env.example`
  o con `data/`. Solo revisa los nombres/existencia, no su contenido.
- El proceso de pruebas recibe únicamente variables de sistema permitidas y
  banderas de prueba; no hereda credenciales de proveedores ni proxies.
- Se desactiva la carga de `.env` de Vite. Todos los identificadores, mensajes y
  valores sensibles usados como fixtures son ficticios.
- Un módulo precargado bloquea `fetch`, HTTP/HTTPS y conexiones de sockets.
- SQLite se sustituye por un constructor que falla; DB, Meta, OpenAI y las
  integraciones de catálogo/GPS/QR utilizadas se simulan.
- Hay pruebas que verifican el bloqueo de red y la sustitución de SQLite.

Estas defensas JavaScript evitan llamadas accidentales en esta suite revisada;
NO son una sandbox del sistema operativo frente a código malicioso, procesos
externos o extensiones nativas. No permiten afirmar que cualquier test futuro
será seguro sin revisar sus imports y efectos.

## Resultados de la suite final

57 casos en 11 archivos: 29 existentes, 14 del webhook, 12 del handler y 2 de
aislamiento. Cinco casos del handler son caracterizaciones explícitas de defectos
actuales, NO pruebas de que esos defectos estén corregidos.

Se descartó una primera versión con `it.fails`: podía aceptar una excepción de
precondición como si fuera la reproducción buscada. La versión final comprueba
precondiciones, secuencia y efectos concretos mediante aserciones ordinarias.

### Comportamientos confirmados en la simulación

| Punto | Observación |
| --- | --- |
| Un primer saludo | Un texto de bienvenida, después un CTA; espera la aceptación simulada del texto. |
| Repetición del mismo WAMID | No comienza otra respuesta mientras la primera está pendiente. La reserva de persistencia se simula; no es una prueba de concurrencia SQLite real. |
| Dos saludos con WAMID distintos | Una bienvenida y dos CTA. El segundo evento puede enviar su CTA mientras la bienvenida del primero está pendiente. No prueba por sí solo una infracción de Meta. |
| Estados de entrega | No crean conversaciones ni respuestas. |
| Texto ya en HUMANO | Se almacena sin respuesta automática. |
| Solicitud explícita de asesor | Cambia a HUMANO antes de enviar una sola confirmación. |
| Firma del webhook | Firma ausente/incorrecta/malformada o cuerpo alterado se rechazan; firma correcta se acepta. |
| Respuesta HTTP | Se devuelve 200 antes de terminar el procesamiento. Una excepción posterior se registra, pero esto no prueba recuperación duradera. |

### Cinco defectos reproducidos y conducta a implementar después

| ID | Defecto observado | Conducta segura pendiente |
| --- | --- | --- |
| D1 | Un evento dirigido a otro `phone_number_id` se reserva, almacena y responde. | Validar el canal receptor antes de cualquier efecto. |
| D2 | CTA aceptado + fallo local al guardar su ID produce otro mensaje de fallback. | Separar envío y persistencia; no iniciar envíos adicionales por un error local posterior a la aceptación. |
| D3 | Una imagen en HUMANO marca comprobante y envía confirmación automática. | Respetar el control humano y definir por separado el registro pasivo permitido. |
| D4 | Una ubicación en HUMANO dispara el QR automático. | Bloquear acciones automáticas cuando el chat está en HUMANO. |
| D5 | Una respuesta RAG pendiente se envía aunque el operador cambie a HUMANO. | Revalidar el modo inmediatamente antes del envío. |

Estas caracterizaciones deben cambiarse a las expectativas seguras al corregir
cada defecto. Su resultado verde ahora significa «se reprodujo lo observado»,
no «el agente está libre de fallos». Ninguna identifica el motivo interno de los
dos bloqueos de Meta ni garantiza evitar uno nuevo.

## Validación técnica

- TypeScript: `tsc --noEmit --incremental false`, sin errores.
- Lint de `src`, scripts y configuraciones: sin errores.
- Lint completo (`npm run lint`): dos errores preexistentes por `@ts-nocheck` en
  `supabase/functions/rag-index/index.ts` y `supabase/functions/rag-search/index.ts`,
  más una advertencia de exportación anónima en el primero. No se modificaron.
- Build local con Webpack: completado, incluida comprobación de tipos y páginas.
  Se ejecutó con entorno filtrado, sin secretos y con el bloqueo de red activo.
- Build por defecto con Turbopack: no completó; el bloqueo de sockets también
  bloqueó su comunicación interna entre procesos. No se debilitó la protección
  de las pruebas para hacerlo pasar. Webpack no acredita equivalencia del build
  de Turbopack de producción.
- Entorno local: Node 24.19.0, Next 16.3.4, Vitest 5.0.0. Producción fue observada
  previamente con Node 22.19.0: la simulación no certifica igualdad del runtime.
- La regeneración de `next-env.d.ts` durante el build se revirtió en esta carpeta
  aislada; no se modificó el código funcional ni el lockfile.

## Respaldo operativo: pendiente antes de tocar producción

En EasyPanel se revisó únicamente `agentevps / agente` → Storage. El volumen
identificado es `agente-data`, montado en `/app/data`. La lista de backups estaba
vacía; el diálogo ofrece `Local Disk`. Se cerró sin guardar ni ejecutar acciones.

El respaldo de volúmenes de EasyPanel utiliza un espejo y puede actualizar o
borrar archivos en el destino en ejecuciones posteriores. Su documentación
advierte que copiar una base activa no sustituye una copia consistente de base
de datos. Fuente: [Volume Backups](https://easypanel.io/docs/backups/volumes).

Pendiente con autorización específica y revisión del destino:

1. Preparar una copia consistente de SQLite mediante un mecanismo compatible
   con la base activa, sin consultar ni mostrar registros de clientes; alternativa:
   ventana de mantenimiento expresamente acordada. No copiar únicamente el
   archivo principal de una base WAL activa.
2. Proteger los restantes archivos operativos que correspondan, sin abrirlos,
   con permisos restringidos y un destino exclusivo y recuperable.
3. Verificar integridad y restauración aislada mediante comprobaciones técnicas
   sin exponer contenido; no importar datos privados en estas pruebas sintéticas.
4. Acordar conservación y copia fuera del servidor. Un proveedor local en el
   mismo servidor no cubre su pérdida: [Backups](https://easypanel.io/docs/backups).
5. Respaldar configuración/secretos con el mecanismo privado del responsable;
   no incorporarlos a Git, ZIP de fuentes ni documentos de auditoría.

No se afirma que exista actualmente un respaldo operativo recuperable ni que
este documento lo sustituya.

## Recuperación del código sin sobrescribir trabajos

Para regresar a la base, crear OTRA carpeta y OTRA rama a partir de la rama de
seguridad, usando un nombre de destino que todavía no exista:

```powershell
git -C 'E:\Terra App\agent-production-worktree' worktree add -b codex/agent-recovery-20260912 'E:\Terra App\agent-recovery-20260912' codex/safety-agent-local-sim-20260912
```

No ejecutar `reset --hard`, no reemplazar la carpeta de producción y no extraer
el ZIP encima de cambios existentes. Recuperar código no restaura pedidos/datos
ni elimina restricciones de Meta. Ninguna rama nueva de esta prueba se ha subido
al remoto ni conectado a EasyPanel.

## Siguiente decisión

Se puede corregir D1/D2 y el control HUMANO en esta rama aislada, uno por uno,
cambiando las caracterizaciones por regresiones seguras. El despliegue, el backup
operativo y una eventual prueba real requieren sus verificaciones/autorizaciones
propias. No realizar pruebas reales mientras la cuenta esté restringida.
