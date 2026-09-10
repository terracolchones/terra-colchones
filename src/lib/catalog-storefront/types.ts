export type ProductAvailability = "available" | "out_of_stock" | "coming_soon";

export interface CatalogImage {
  id: string;
  path: string;
  url: string;
  alt: string;
  sortOrder: number;
}

export interface CatalogVariant {
  id: string;
  externalCode: string | null;
  label: string;
  colorHex: string | null;
  price: number | null;
  compareAtPrice: number | null;
  availability: ProductAvailability;
  active: boolean;
  sortOrder: number;
  images: CatalogImage[];
}

export interface CatalogProduct {
  id: string;
  externalCode: string | null;
  slug: string;
  name: string;
  category: string;
  shortDescription: string;
  description: string;
  specifications: string[];
  priceFrom: number | null;
  compareAtPriceFrom: number | null;
  availability: ProductAvailability;
  published: boolean;
  featured: boolean;
  sortOrder: number;
  images: CatalogImage[];
  variants: CatalogVariant[];
}

export interface CatalogHomeSettings {
  eyebrow: string;
  title: string;
  description: string;
  imageUrl: string | null;
}

export interface CatalogSnapshot {
  products: CatalogProduct[];
  home: CatalogHomeSettings;
}

export interface CatalogLeadContext {
  productId: string;
  variantId: string | null;
}
