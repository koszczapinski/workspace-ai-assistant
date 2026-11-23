import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (see Dockerfile).
  output: 'standalone',
  devIndicators: false,
  turbopack: {
    root: process.cwd(),
    rules: { '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' } },
  },
};
export default nextConfig;
