# Catálogo Terra: activación inicial

La web pública está en `/catalogo` y el panel privado en `/catalogo-admin`.

## Antes de usar el panel

1. Ejecuta `supabase/migrations/20260907190000_catalogo_terra.sql` en el editor SQL del proyecto Supabase ya configurado.
2. Añade a las variables del entorno los valores de catálogo incluidos en `.env.example`.
3. Define `CATALOG_ADMIN_PASSWORD` y abre `/catalogo-admin`. El panel se abre directamente con esa clave, sin correo ni enlace de acceso.

El SQL crea cuatro fichas en borrador. No se muestran al público hasta que el dueño complete la información y active **Publicado**.

## Preparación para el sistema comercial

Cada producto y variante incluye `external_code`. Déjalo vacío durante la carga manual o escribe el código existente si ya está disponible. La futura integración usará ese campo para sincronizar nombre, precio, stock y variantes, mientras las fotos y el contenido comercial permanecen en el catálogo.
