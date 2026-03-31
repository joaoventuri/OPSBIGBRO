import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:3001/api/:path*" },
      { source: "/ws/:path*", destination: "http://localhost:3001/ws/:path*" },
      { source: "/ide/:path*", destination: "http://localhost:3001/ide/:path*" },
    ];
  },
};

export default nextConfig;
