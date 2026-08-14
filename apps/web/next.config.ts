import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server the Docker image copies
  // instead of shipping node_modules.
  output: 'standalone',
};

export default nextConfig;
