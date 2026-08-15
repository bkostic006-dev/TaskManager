import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server the Docker image copies
  // instead of shipping node_modules.
  output: 'standalone',
  // Stated rather than left to the default, which is `null` — "whatever this
  // version decides". Strict Mode double-invokes effects in development, which
  // is precisely the condition the boot refresh has to survive: two calls to
  // `/auth/refresh` with the same cookie, the second of which the server's
  // compare-and-swap would answer `401`. Turning it off would hide the bug the
  // single-flight promise exists to prevent until production.
  reactStrictMode: true,
};

export default nextConfig;
