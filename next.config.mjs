/** @type {import('next').NextConfig} */
const nextConfig = {
  // The deterministic engine lives in src/ as plain ESM; nothing special needed.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
