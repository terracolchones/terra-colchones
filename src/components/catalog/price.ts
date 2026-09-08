export function formatBolivianos(value: number | null): string {
  if (value === null) return "Consultar precio";
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value).replace("BOB", "Bs");
}

export function availabilityLabel(value: "available" | "out_of_stock" | "coming_soon"): string {
  if (value === "available") return "Disponible";
  if (value === "out_of_stock") return "Sin stock";
  return "Próximamente";
}
