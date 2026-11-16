const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  ...(process.env.NEXT_PUBLIC_NEXT_PHASE_ENABLED === "true" ? { devIndicators: false } : {}),
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
