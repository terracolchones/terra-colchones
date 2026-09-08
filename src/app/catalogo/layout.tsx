import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Catálogo Terra | Colchones y descanso",
  description: "Explora el catálogo Terra y consulta cada producto directamente por WhatsApp.",
};

export default function CatalogLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
