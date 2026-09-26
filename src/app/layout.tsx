import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agente de WhatsApp",
  description: "Dashboard local para WhatsApp Cloud API y OpenAI",
  other: {
    "facebook-domain-verification": "gv31qkqir3u74r2iovietdj9u9ivgt",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
