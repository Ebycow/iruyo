import type { NextConfig } from "next";

// TODO: basePathは環境変数からいれたい
const nextConfig: NextConfig = {
  distDir: "../../.next",
  basePath: "/iruyo",
};

export default nextConfig;
