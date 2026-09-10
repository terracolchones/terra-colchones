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

Primero se crea el **producto principal** con nombre, categoría, precio,
descripción breve, detalles técnicos y hasta tres fotos generales. Esos datos
se comparten con todas las variantes.

El botón **Crear variante** abre una ficha separada que ya hereda la información
del producto principal. Cada variante representa una combinación comercial
exacta: por ejemplo, `1.5 plazas`, `2 plazas`, `Café Touch 205` o cualquier
modelo. Solo necesita su nombre o tamaño, código externo opcional, punto de
color y hasta tres fotos propias. El panel no maneja stock numérico ni precios
por variante.

Activa **Mostrar punto de color** y elige el tono. La ficha pública enseña solo
el punto, nunca un nombre de color. En esa misma fila se puede subir una galería
propia: es opcional y admite hasta tres fotos. Cuando no hay fotos de la variante,
la ficha muestra la galería general del producto como respaldo. En móvil las
fotos se deslizan horizontalmente; en escritorio se muestran la imagen principal
y sus miniaturas.
