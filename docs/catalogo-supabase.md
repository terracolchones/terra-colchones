# Catálogo Terra: activación inicial

La web pública está en `/catalogo` y el panel privado en `/catalogo-admin`.

## Antes de usar el panel

1. Ejecuta `supabase/migrations/20260907190000_catalogo_terra.sql` en el editor SQL del proyecto Supabase ya configurado.
2. Ejecuta después `supabase/migrations/20260910173000_variant_galleries.sql` para activar color y galerías opcionales por variante.
3. Ejecuta por último `supabase/migrations/20260910213000_public_variant_pages.sql` para convertir cada versión en una ficha pública con su enlace, nombre, precio y galería propia.
4. Añade a las variables del entorno los valores de catálogo incluidos en `.env.example`.
5. Define `CATALOG_ADMIN_PASSWORD` y abre `/catalogo-admin`. El panel se abre directamente con esa clave, sin correo ni enlace de acceso.

El SQL crea cuatro fichas en borrador. No se muestran al público hasta que el dueño complete la información y active **Publicado**.

## Preparación para el sistema comercial

Cada producto y variante incluye `external_code`. Déjalo vacío durante la carga manual o escribe el código existente si ya está disponible. La futura integración usará ese campo para sincronizar nombre, precio, stock y variantes, mientras las fotos y el contenido comercial permanecen en el catálogo.

## Familias, versiones públicas, puntos de color y galerías

Primero se crea la **familia de producto** con categoría, descripción breve,
detalles técnicos y hasta tres fotos generales de respaldo. Al guardarla, el
producto original se convierte automáticamente en su **versión principal**:
conserva su nombre, precio, código y URL propia. Nunca desaparece del catálogo.

El botón **Crear versión** abre una ficha separada. Cada versión tiene nombre
público, URL única, precio, código externo opcional y galería de hasta tres
fotos. **Duplicar** parte de una versión existente para que solo se cambien el
nombre, color, texto selector y fotos. No se maneja stock numérico por ahora.

En cada versión se puede activar de forma independiente **Punto de color**,
**Mostrar variante de texto** (plazas, puertas, modelo, etc.), ambos o ninguno.
La ficha pública muestra puntos de color y botones de texto solo cuando fueron
activados. Al elegir uno, navega a la URL de la versión exacta y cambia nombre,
precio, código y galería. Cuando una versión no tiene fotos, muestra la galería
general de respaldo. En móvil las fotos se deslizan horizontalmente; en
escritorio se muestran imagen principal y miniaturas.
