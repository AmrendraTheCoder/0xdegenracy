import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // A second dev server or a test build (NEXT_DIST_DIR=.next-claude) must never share `.next` with a running
  // `npm run dev`: two processes writing one cache corrupts it ("Cannot find module './611.js'").
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // wagmi's optional connector deps pull these in; they are not used in the browser bundle.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
