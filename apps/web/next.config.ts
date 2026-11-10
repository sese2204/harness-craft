import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Sheet components ship as TSX + CSS Modules source (packages/sheet-ui).
  transpilePackages: ['@harness-craft/sheet-ui'],
};

export default nextConfig;
