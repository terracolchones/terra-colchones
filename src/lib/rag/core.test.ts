import { describe, expect, it } from "vitest";
import type { CatalogProduct } from "../catalog-storefront/types";
import {
  formatRetrievedSources,
  parseKnowledgeBase,
  retrieveApprovedSources,
} from "./core";

const knowledge = parseKnowledgeBase(`---
titulo: Prueba
---

## Entrega

Terra realiza entregas en Santa Cruz y envíos a Bolivia.

## Pagos y comprobantes

Un comprobante queda en revisión por un asesor. No se confirman pagos.

## Datos que se deben cargar después

Esta plantilla no es información comercial aprobada.
`);

const products: CatalogProduct[] = [
  {
    id: "lounge",
    externalCode: null,
    slug: "sillon-lounge",
    name: "Sillón Lounge Confort",
    category: "Juegos de living",
    shortDescription: "Sillón giratorio para sala.",
    description: "Tapizado confortable para living.",
    specifications: ["Base giratoria"],
    priceFrom: 1999,
    compareAtPriceFrom: null,
    availability: "available",
    published: true,
    featured: true,
    sortOrder: 1,
    images: [],
    variants: [
      {
        id: "gris",
        externalCode: null,
        name: "Sillón gris",
        slug: "sillon-lounge-gris",
        label: "Gris",
        colorHex: null,
        colorName: null,
        showColor: false,
        showOptionText: true,
        isPrimary: true,
        price: 2099,
        compareAtPrice: null,
        availability: "available",
        active: true,
        sortOrder: 1,
        images: [],
      },
      {
        id: "azul-inactivo",
        externalCode: null,
        name: "Sillón azul",
        slug: "sillon-lounge-azul",
        label: "Azul",
        colorHex: null,
        colorName: null,
        showColor: false,
        showOptionText: true,
        isPrimary: false,
        price: 2099,
        compareAtPrice: null,
        availability: "available",
        active: false,
        sortOrder: 2,
        images: [],
      },
    ],
  },
  {
    id: "hidden",
    externalCode: null,
    slug: "oculto",
    name: "Producto Oculto",
    category: "Otros",
    shortDescription: "No debe recuperarse.",
    description: "",
    specifications: [],
    priceFrom: 10,
    compareAtPriceFrom: null,
    availability: "available",
    published: false,
    featured: false,
    sortOrder: 2,
    images: [],
    variants: [],
  },
];

describe("RAG de Terra", () => {
  it("extrae secciones recuperables y excluye plantillas internas", () => {
    expect(knowledge.map((chunk) => chunk.title)).toEqual([
      "Entrega",
      "Pagos y comprobantes",
    ]);
  });

  it("recupera el producto seleccionado con su precio y variante vigentes", () => {
    const sources = retrieveApprovedSources({
      query: "¿Cuánto cuesta?",
      products,
      knowledge,
      selectedLead: { productId: "lounge", variantId: "gris" },
    });

    const context = formatRetrievedSources(sources);
    expect(context).toContain("Sillón Lounge Confort");
    expect(context).toContain("Variante seleccionada: Gris");
    expect(context).toMatch(/2[,.]099/);
    expect(context).not.toContain("Azul");
  });

  it("no suplanta el precio ni el stock de una variante seleccionada", () => {
    const sources = retrieveApprovedSources({
      query: "¿Cuánto cuesta la variante sin precio?",
      products: [
        {
          ...products[0],
          variants: [
            {
              id: "sin-precio",
              externalCode: null,
              name: "Sillón edición especial",
              slug: "sillon-lounge-edicion-especial",
              label: "Edición especial",
              colorHex: null,
              colorName: null,
              showColor: false,
              showOptionText: true,
              isPrimary: true,
              price: null,
              compareAtPrice: null,
              availability: "out_of_stock",
              active: true,
              sortOrder: 1,
              images: [],
            },
          ],
        },
      ],
      knowledge,
      selectedLead: { productId: "lounge", variantId: "sin-precio" },
    });

    const context = formatRetrievedSources(sources);
    expect(context).toContain(
      "Disponibilidad de la variante seleccionada: Sin stock",
    );
    expect(context).toContain(
      "Precio de la variante seleccionada: sin precio publicado.",
    );
    expect(context).not.toContain("Precio vigente: Bs 1.999");
  });

  it("recupera la política pertinente sin inventar una ficha de producto", () => {
    const sources = retrieveApprovedSources({
      query: "¿Hacen envíos a Bolivia?",
      products,
      knowledge,
    });
    expect(sources.some((source) => source.label === "Entrega")).toBe(true);
    expect(sources.some((source) => source.label === "Producto Oculto")).toBe(
      false,
    );
  });

  it("no devuelve fuentes para una consulta sin evidencia", () => {
    const sources = retrieveApprovedSources({
      query: "¿Tienen financiamiento bancario?",
      products,
      knowledge,
    });
    expect(sources).toEqual([]);
  });
});
