import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Production optimizations */
  swcMinify: true,
  compress: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,

  /* API routes configuration */
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
    responseLimit: "50mb",
  },

  /* Environment variables */
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE || "http://localhost:5000",
  },

  /* Security headers */
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "SAMEORIGIN",
        },
        {
          key: "X-XSS-Protection",
          value: "1; mode=block",
        },
      ],
    },
  ],

  /* Redirects */
  redirects: async () => [
    {
      source: "/",
      destination: "/dashboard",
      permanent: false,
    },
  ],
};

export default nextConfig;
