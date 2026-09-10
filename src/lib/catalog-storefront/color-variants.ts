const COLOR_HEX_PATTERN = /^#[0-9a-f]{6}$/i;

export function normalizeColorHex(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return COLOR_HEX_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}
