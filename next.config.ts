import type { NextConfig } from "next";
import { version } from "./package.json";

const nextConfig: NextConfig = {
  // Produces .next/standalone with a minimal server.js for the Docker image.
  output: "standalone",
  // The app version shown on the dashboard, inlined at build time.
  env: { APP_VERSION: version },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
