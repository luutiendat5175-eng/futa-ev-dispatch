import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The circular “N” is the Next.js development indicator, not an app button.
  // Hide it so the operational dashboard has no developer-only controls.
  devIndicators: false,
};

export default nextConfig;
