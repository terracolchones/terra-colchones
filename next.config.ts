import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  async redirects() {
    return [
      // Los CTA antiguos dejan de mostrar el checkout retirado y llegan al catálogo.
      { source: "/landing.html", destination: "/catalogo", permanent: false },
      { source: "/productos/sillon-lounge", destination: "/catalogo", permanent: false },
    ];
  },
};

export default nextConfig;
