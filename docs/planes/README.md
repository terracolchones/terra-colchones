# Planes de trabajo

Esta carpeta conserva decisiones y planes técnicos antes de implementarlos.
No debe contener credenciales, tokens, datos de clientes ni copias de la base
de datos.

## Estados

- `PENDIENTE`: aprobado para considerar más adelante; todavía no se implementa.
- `EN IMPLEMENTACIÓN`: el código se está modificando.
- `EN REVISIÓN`: la implementación terminó y se están ejecutando pruebas y revisando el diff.
- `COMPLETADO`: pruebas y revisión final aprobadas.

## Flujo de trabajo

1. Guardar cada plan en un archivo independiente con objetivo, límites y pruebas.
2. Implementar únicamente el plan o función elegida para la fase actual.
3. Ejecutar las comprobaciones proporcionales al cambio, incluyendo como base
   lint, TypeScript y build cuando afecte al código de la aplicación.
4. Revisar el diff completo, los flujos relacionados y posibles regresiones.
5. Documentar el resultado y cambiar el estado del plan antes de pasar a la
   siguiente fase.

## Índice

| Plan | Estado | Fecha |
| --- | --- | --- |
| [Regreso con WhatsApp Personal y Business](regreso-doble-whatsapp.md) | PENDIENTE | 2026-09-07 |
