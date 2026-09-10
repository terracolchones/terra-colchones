---
titulo: Base de conocimiento inicial de Terra
version: 0.1
estado: borrador
uso: Fuente de información para el agente RAG de WhatsApp
actualizado: 2026-09-08
---

# Base de conocimiento de Terra

## Regla principal

El agente solo responde con información encontrada en esta base, en el
catálogo publicado o en una fuente comercial aprobada. Si falta un dato, debe
decir que un asesor lo confirmará. No debe inventar precios, stock, plazos,
garantías, promociones ni políticas.

## Empresa

- Nombre comercial: Terra.
- Canales de atención: catálogo web y WhatsApp.
- Cobertura confirmada: entregas en Santa Cruz y envíos a Bolivia.

## Categorías de productos confirmadas

Terra comercializa las siguientes categorías:

- Colchones brasileños.
- Somieres.
- Almohadas.
- Juegos de living.
- Comedores.
- Cocinas modulares.

La ficha publicada de cada producto en el catálogo es la fuente principal para
sus detalles, variantes, precio y disponibilidad.

## Catálogo dinámico

Los datos específicos de cada producto se consultan en el catálogo publicado de
Supabase. Solo se consideran válidos los productos publicados y sus variantes
activas.

El RAG puede usar, cuando estén cargados en el catálogo:

- Nombre y categoría.
- Descripción y especificaciones.
- Variante.
- Precio.
- Disponibilidad.

No guardar aquí una copia manual de precios, stock o características de un
producto: el catálogo publicado es la fuente vigente.

## Entrega

- Terra realiza entregas en Santa Cruz y envíos a Bolivia.
- La coordinación de entrega requiere información confirmada por el proceso de
  compra o por un asesor.
- El agente RAG no debe prometer una fecha, costo o cobertura específica si no
  existe una ficha aprobada para ello.

## Pago y comprobantes

- El pago se coordina únicamente mediante el flujo controlado de compra.
- Un comprobante recibido queda en revisión por un asesor.
- El agente nunca debe afirmar que un pago está aprobado.
- El agente no debe solicitar, crear ni modificar códigos QR, datos bancarios,
  GPS ni comprobantes.

## Respuestas frecuentes aprobadas

### ¿Qué productos vende Terra?

Terra comercializa colchones brasileños, somieres, almohadas, juegos de living,
comedores y cocinas modulares. Puedo ayudarte a encontrar el producto que buscas.

### ¿En qué ciudades entrega Terra?

Terra realiza entregas en Santa Cruz y envíos a Bolivia. Para confirmar la
cobertura y condiciones de tu zona, un asesor puede revisarlo contigo.

### Ya envié mi comprobante, ¿mi pago está aprobado?

Tu comprobante queda en revisión. Un asesor validará el pago y se comunicará
contigo antes del despacho.

## Casos que se derivan a un asesor

Derivar, sin inventar una respuesta, cuando el cliente pida:

- Precio, descuento, promoción o cotización no presentes en el catálogo.
- Stock o disponibilidad que no esté actualizado en la fuente aprobada.
- Fecha, costo o cobertura exacta de entrega.
- Garantía, devolución, factura o condiciones no documentadas.
- Confirmación de pago o revisión de comprobante.
- Cambio, cancelación o problema con una compra existente.
- Información personal, bancaria o de ubicación.

## Datos que se deben cargar después

Para cada producto nuevo o actualizado, completar esta plantilla:

```text
Nombre del producto:
Categoría:
Descripción corta:
Variantes / colores / medidas:
Precio vigente:
Disponibilidad:
Materiales y características:
Garantía:
Entrega y cobertura:
Preguntas frecuentes:
Fecha de última revisión:
Responsable que aprobó la información:
```

## Fuentes internas actuales

- Catálogo publicado de Terra en Supabase.
- Fichas comerciales aprobadas por Terra.
- Este documento, para preguntas frecuentes y políticas generales.

No usar conversaciones de clientes, comprobantes, ubicaciones, secretos ni
datos privados como fuente general de conocimiento del RAG.
