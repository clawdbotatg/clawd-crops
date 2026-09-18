import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `yarn start` is `next dev`; phones and the Pico reach it by LAN address, which dev blocks by default
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
  reactStrictMode: true,
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
};

const isIpfs = process.env.NEXT_PUBLIC_IPFS_BUILD === "true";

if (isIpfs) {
  nextConfig.output = "export";
  nextConfig.trailingSlash = true;
  nextConfig.images = {
    unoptimized: true,
  };
}

module.exports = nextConfig;
