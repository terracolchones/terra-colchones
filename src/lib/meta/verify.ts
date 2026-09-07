import crypto from "node:crypto";

/** Verifica el HMAC que Meta calcula sobre el body sin parsear. */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const provided = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(provided, "hex");

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
