import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Administrador de catálogo | Terra",
  robots: { index: false, follow: false },
};

export default function CatalogAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
