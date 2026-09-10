# Catálogo Terra: activación inicial

La web pública está en `/catalogo` y el panel privado en `/catalogo-admin`.

## Antes de usar el panel

1. Ejecuta `supabase/migrations/20260907190000_catalogo_terra.sql` en el editor SQL del proyecto Supabase ya configurado.
2. Ejecuta después `supabase/migrations/20260910173000_variant_galleries.sql` para activar color y galerías opcionales por variante.
3. Añade a las variables del entorno los valores de catálogo incluidos en `.env.example`.
4. Define `CATALOG_ADMIN_PASSWORD` y abre `/catalogo-admin`. El panel se abre directamente con esa clave, sin correo ni enlace de acceso.

El SQL crea cuatro fichas en borrador. No se muestran al público hasta que el dueño complete la información y active **Publicado**.

## Preparación para el sistema comercial

Cada producto y variante incluye `external_code`. Déjalo vacío durante la carga manual o escribe el código existente si ya está disponible. La futura integración usará ese campo para sincronizar nombre, precio, stock y variantes, mientras las fotos y el contenido comercial permanecen en el catálogo.

## Variantes, puntos de color y galerías

Cada fila de **Variantes** representa una combinación comercial exacta: por
ejemplo, `2 plazas` en un color determinado. Puede tener su código externo y un
precio propio opcional; si el precio queda vacío, la ficha utiliza el precio
general del producto. El panel no maneja stock numérico.

Activa **Mostrar punto de color** y elige el tono. La ficha pública enseña solo
el punto, nunca un nombre de color. En esa misma fila se puede subir una galería
propia: es opcional y admite hasta 12 fotos. Cuando no hay fotos de la variante,
la ficha muestra la galería general del producto como respaldo. En móvil las
fotos se deslizan horizontalmente; en escritorio se muestran la imagen principal
y sus miniaturas.
