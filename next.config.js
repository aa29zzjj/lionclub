const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  ...(process.env.LIONCLUBS_WEB_PREVIEW === "true" ? { distDir: ".next-club-preview" } : {}),
  ...(process.env.NEXT_PUBLIC_NEXT_PHASE_ENABLED === "true" ? { devIndicators: false } : {}),
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
