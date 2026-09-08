import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const noStoreHeaders = { "Cache-Control": "no-store" };

function configuredCredentials(): string | null {
  const username = process.env.DASHBOARD_BASIC_AUTH_USER?.trim();
  const password = process.env.DASHBOARD_BASIC_AUTH_PASSWORD;
  if (!username || !password) return null;

  // El separador evita ambigüedad entre pares como "ab:c" y "a:bc".
  return `${username}\0${password}`;
}

function suppliedCredentials(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Basic\s+(.+)$/i);
  if (!match) return null;

  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return `${decoded.slice(0, separator)}\0${decoded.slice(separator + 1)}`;
  } catch {
    return null;
  }
}

function safelyEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

/**
 * Devuelve una respuesta de bloqueo o `null` cuando la solicitud está autorizada.
 * Si faltan las credenciales de producción, el dashboard falla cerrado.
 */
export function requireDashboardAuth(request: NextRequest): NextResponse | null {
  const expected = configuredCredentials();
  if (!expected) {
    return NextResponse.json(
      { error: "El acceso al dashboard no está disponible." },
      { status: 503, headers: noStoreHeaders },
    );
  }

  const supplied = suppliedCredentials(request);
  if (supplied && safelyEquals(supplied, expected)) return null;

  return NextResponse.json(
    { error: "Autenticación requerida." },
    {
      status: 401,
      headers: {
        ...noStoreHeaders,
        "WWW-Authenticate": 'Basic realm="Terra dashboard", charset="UTF-8"',
      },
    },
  );
}
