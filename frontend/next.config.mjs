/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the slim `runner` stage in Dockerfile (copies .next/standalone).
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
