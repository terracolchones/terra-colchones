import { redirect } from "next/navigation";

export const metadata = {
  title: "Sillón Giratorio Lounge Confort | Terra",
  description: "Elige el color y confirma tu pedido con Terra.",
};

interface SillonLoungePageProps {
  searchParams: Promise<{ order?: string | string[] }>;
}

/** Compatibilidad de una ruta antigua de landing. */
export default async function SillonLoungePage({ searchParams }: SillonLoungePageProps) {
  const { order } = await searchParams;
  const orderId = typeof order === "string" ? order.trim() : "";
  redirect(`/landing.html${orderId ? `?order=${encodeURIComponent(orderId)}` : ""}`);
}
