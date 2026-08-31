import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: [
    "@odyssey/supabase-client",
    "@odyssey/types",
    "@odyssey/ui",
  ],
};
export default nextConfig;
