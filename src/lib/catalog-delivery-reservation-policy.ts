export interface CatalogDeliveryAttempt {
  status: "sending" | "sent" | "failed";
  updated_at: number;
}

/**
 * Política compartida por GPS y QR. `sending` también puede representar una
 * respuesta incierta o una caída antes/después de enviar: la antigüedad no
 * demuestra que Meta no aceptara el mensaje. No se recupera automáticamente.
 * Un intento indeterminado requiere revisión humana antes de otra acción.
 */
export function catalogDeliveryReservationState(
  existing: CatalogDeliveryAttempt | undefined,
): "available" | "already_sent" | "in_progress" {
  if (!existing || existing.status === "failed") return "available";
  if (existing.status === "sent") return "already_sent";
  return "in_progress";
}
