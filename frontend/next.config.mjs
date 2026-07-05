/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the slim `runner` stage in Dockerfile (copies .next/standalone).
  output: "standalone",
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
