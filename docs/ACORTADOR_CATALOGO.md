# Acortador de productos Terra

## Ubicación y uso

El administrador de `terracolchonesymuebles.online/catalogo-admin` incorpora
**Acortador de enlaces**, con la misma autenticación del catálogo. Pegar el enlace
de una ficha publicada y pulsar **Acortar enlace** devuelve una dirección como
`https://terracolchonesymuebles.online/7k3`. El botón de copiar permite compartirla.
La lista **Enlaces guardados** recupera los enlaces del servidor, con paginación
de 30 registros y acciones para copiar, abrir y eliminar. Se conserva al cerrar
sesión, recargar o cambiar de dispositivo.

Funciona para cualquier producto o versión publicada actual o futura. Repetir un producto
recupera el mismo código; cambiar su nombre o slug no rompe el enlace corto.
Se aceptan enlaces con o sin protocolo y etiquetas de campañas conocidas
(`utm_*`, `fbclid`, `gclid`), que se descartan. Se rechazan otros dominios,
rutas, fragmentos y parámetros privados, incluido `checkout`: una publicación
no debe incorporar la vinculación privada de un cliente.

## Implementación

- `POST /api/catalog/admin/short-links`: exige la clave administrativa existente,
  valida el producto publicado y crea o recupera su enlace. No devuelve IDs internos.
- `GET` en esa API devuelve el historial autenticado sin IDs internos; `DELETE`
  desactiva el código solicitado, después de una confirmación visible en el panel.
- `GET /[code]`: renderiza la ficha existente mediante `ProductDetail`, sin
  redirección HTTP ni pantalla intermedia. Conserva el flujo de compra. Si se
  adjunta un contexto `checkout` válido al visitar la ficha, se transmite al
  componente; el acortador nunca lo almacena.
- Los metadatos de la dirección corta incluyen título, descripción, primera
  imagen y la ficha larga como URL canónica para compartir e indexar.
- `catalog_short_links` guarda el código y la identidad del producto y su variante en Supabase,
  únicamente mediante el servidor. RLS y revocaciones impiden acceso directo a
  roles públicos. No se usa SQLite, almacenamiento del navegador ni memoria
  del proceso para conservar enlaces.
- Los códigos comienzan con un dígito de 2 a 9 y tienen inicialmente tres
  caracteres. Se usa aleatoriedad criptográfica, PK para códigos y UNIQUE para
  destinos (producto o variante). Las colisiones se reintentan; con colisiones repetidas se amplía
  la longitud. Las solicitudes simultáneas convergen al mismo enlace.
- Se reserva el patrón `[2-9][a-hj-km-np-z2-9]{2,7}` para productos: no añadir
  páginas estáticas ni archivos públicos que coincidan con él.
- Despublicar un producto devuelve 404 en su enlace corto; republicarlo restaura
  el acceso. Eliminarlo conserva una fila con `product_id = null` para que el
  código antiguo nunca apunte a otro producto. No borrar esas filas al limpiar.
- Eliminar desde el acortador deja `product_id` y `variant_id` en null, oculta
  la fila del historial y devuelve 404 en ese enlace; la ficha larga permanece.
  Al volver a acortar el producto se crea un código nuevo. Si una variante se
  elimina, `target_kind = variant` impide abrir otra variante por accidente.

## Preparación y activación

Integración de producción: `codex/catalog-short-links-production-20260916`,
desde `origin/main` en `ba8955a`. Punto recuperable:
`codex/safety-before-short-links-production-20260916`.
Se utilizó un worktree aislado para no incorporar cambios locales de otras tareas.
La primera demostración (`6dbd1c1`) no se fusiona: se trasladó la función a la
versión vigente, conservando las mejoras de imágenes, variantes y páginas legales.
El usuario autorizó publicar el acortador el 16 de septiembre de 2026, con la
condición de conservar la tienda existente. Solo se modifica `CatalogAdmin.tsx`
para añadir la sección; las demás rutas y componentes existentes quedan intactos.

La activación autorizada corresponde únicamente al servicio
**terra-catalogo / catalogo**, cuya línea de despliegue es `main`:

1. Revisar/integrar el commit en la versión vigente del catálogo, conservando
   cambios de otros desarrollos en `CatalogAdmin.tsx`.
2. Aplicar `supabase/migrations/20260916120000_catalog_short_links.sql` al proyecto
   Supabase que ya utiliza ese catálogo. Es una migración aditiva, sin modificar
   productos ni las tablas del agente. No requiere variables ni servicios nuevos.
3. Desplegar el catálogo y comprobar autenticación, creación, recuperación,
   copia y apertura del enlace con un producto público aprobado.
4. Confirmar que los enlaces largos anteriores y la confirmación de compra
   mantienen su comportamiento. No modificar ni desplegar `agentevps / agente`.

Si se revierte el código, conservar la tabla para recuperar los mismos enlaces
al reactivar la función. Una reversión de código deja los enlaces cortos sin
resolver mientras esté instalada una versión anterior.

La migración no se aplica automáticamente. Si falta, el panel informa que el
almacenamiento no está disponible; no simula haber guardado un enlace.

## Verificación local

Las pruebas usan productos, credenciales y almacenamiento ficticios. No requieren
leer `.env.local`, acceder a conversaciones ni conectarse a Supabase o Meta.
Ejecutar `npm test`, `npm run lint`, `npx tsc --noEmit` y `npm run build`.
En el worktree de desarrollo las dependencias se comparten mediante una junction;
la compilación local usa `npm run build -- --webpack` para no ampliar la raíz de
Turbopack fuera del worktree. La configuración productiva no se modifica.

Validación completada el 16 de septiembre de 2026:

- 81 pruebas automáticas aprobadas en 11 archivos, incluida autenticación,
  validación de destinos, colisiones, concurrencia, productos futuros y retiro.
- TypeScript, ESLint y compilación de producción con webpack aprobados.
- Navegador Edge automatizado en 1440 px y 390 px, con API de almacenamiento
  simulada en localhost: inicio de sesión, creación, recuperación y portapapeles
  comprobados; sin desbordamiento horizontal ni errores de JavaScript.
- Ficha corta comprobada con HTTP 200 y sin cabecera Location, URL conservada
  en el navegador, canonical correcto y ficha larga operativa. Cambio de slug
  conserva el enlace; producto retirado y código inexistente devuelven 404.
- No se aplicó la migración a Supabase ni se desplegó ningún servicio. La
  integración real del almacenamiento queda pendiente de la activación autorizada.
