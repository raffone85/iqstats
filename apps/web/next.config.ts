import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@iqstats/shared"],
  // Consente il caricamento dei chunk dev quando l'app è aperta da un dispositivo
  // sulla LAN (es. test da cellulare via IP locale), non solo da localhost.
  allowedDevOrigins: ["192.168.1.5"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
