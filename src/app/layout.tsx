import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agente de WhatsApp",
  description: "Dashboard local para WhatsApp Cloud API y OpenAI",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
